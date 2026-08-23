import { api } from './api';
import {
  decryptMessage,
  deriveSharedSecret,
  encode,
  encryptMessage,
  generateKeyPair,
  publicKeyFromPrivate,
} from './crypto';
import {
  decryptGroupText,
  encryptGroupText,
  isGroupSenderKeyWire,
  syncGroupSenderKeysForMe,
} from './groupSenderKeys';
import {
  decryptSignalDm,
  encryptSignalDm,
  isSignalWire,
} from './signal/protocol';
import { publishSignalKeys } from './signal/publishKeys';
import {
  getSecretItem,
  identityPrivateKeyId,
  setSecretItem,
} from './keyStore';
import {
  clearCachedIdentityPub,
  getCachedCleartext,
  getCachedIdentityPub,
  hydrateE2ECaches,
  setCachedCleartext,
  setCachedIdentityPub,
} from './e2eCache';

// ============================================================================
// TYPES
// ============================================================================

export type E2EWireFields = {
  content: string;
  iv: string;
  ephemeral_public_key: string;
  plaintext: false;
};

export type DecryptableMessage = {
  id?: string;
  client_message_id?: string | null;
  content?: string | null;
  message_type?: string | null;
  plaintext?: boolean | null;
  iv?: string | null;
  ephemeral_public_key?: string | null;
  sender_id?: string;
  receiver_id?: string | null;
  group_id?: string | null;
  /** Client-only cleartext cache (sender device / after decrypt). */
  decrypted?: string | null;
  /** Whether the peer's identity key has been verified out-of-band. */
  safety_number_verified?: boolean;
};

/** Trust level for an identity key. */
export type TrustLevel = 'trusted' | 'untrusted' | 'verified';

export type PeerTrustRecord = {
  userId: string;
  publicKey: string;
  trustLevel: TrustLevel;
  firstSeen: number;
  lastVerified?: number;
};

// ============================================================================
// CONSTANTS
// ============================================================================

const IDENTITY_FETCH_MS = 6000;
const IDENTITY_FETCH_ATTEMPTS = 3;
const GROUP_ENCRYPT_MS = 3500;
const DM_ENCRYPT_MS = 2500;

/** Warm the persisted caches as early as possible. */
void hydrateE2ECaches();

// ============================================================================
// TRUST STORE (TOFU — first seen trusted; identity change → untrusted)
// ============================================================================

const peerTrustStore = new Map<string, PeerTrustRecord>();

function getTrustKey(userId: string, publicKey: string): string {
  return `${userId}:${publicKey}`;
}

export function getPeerTrust(userId: string, publicKey: string): PeerTrustRecord | undefined {
  return peerTrustStore.get(getTrustKey(userId, publicKey));
}

export function setPeerTrust(record: PeerTrustRecord): void {
  peerTrustStore.set(getTrustKey(record.userId, record.publicKey), record);
}

export function isPeerTrusted(userId: string, publicKey: string): boolean {
  const record = getPeerTrust(userId, publicKey);
  return record?.trustLevel === 'trusted' || record?.trustLevel === 'verified';
}

/** Remember peer secp identity; mark untrusted if it rotates (possible reinstall / MITM). */
function notePeerIdentity(userId: string, publicKey: string): void {
  const existingForKey = getPeerTrust(userId, publicKey);
  if (existingForKey) return;

  let prior: PeerTrustRecord | undefined;
  for (const rec of peerTrustStore.values()) {
    if (rec.userId === userId && rec.publicKey !== publicKey) {
      prior = rec;
      break;
    }
  }

  if (prior) {
    console.warn('[e2e] peer identity changed for', userId);
    setPeerTrust({
      userId,
      publicKey,
      trustLevel: 'untrusted',
      firstSeen: Date.now(),
    });
    // Next outbound encrypt starts a fresh PreKey session with the new identity.
    void import('./signal/protocol').then((m) => m.markPeerNeedsResync(userId));
    return;
  }

  setPeerTrust({
    userId,
    publicKey,
    trustLevel: 'trusted',
    firstSeen: Date.now(),
  });
}

// ============================================================================
// SAFETY NUMBERS
// ============================================================================

/**
 * Compute a safety number for out-of-band key verification.
 * Both parties must compute the same string given the same keys.
 */
export function computeSafetyNumber(
  myUserId: string,
  myIdentityPub: string,
  peerUserId: string,
  peerIdentityPub: string
): string {
  const [firstId, secondId] = [myUserId, peerUserId].sort();
  const [firstKey, secondKey] =
    firstId === myUserId
      ? [myIdentityPub, peerIdentityPub]
      : [peerIdentityPub, myIdentityPub];

  const combined = `safety-number-v1\0${firstId}\0${firstKey}\0${secondId}\0${secondKey}`;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }

  const absHash = Math.abs(hash).toString().padStart(60, '0');
  return absHash.match(/.{5}/g)?.slice(0, 12).join(' ') || absHash;
}

/**
 * Verify a peer identity key out-of-band.
 * Returns the safety number and updates the trust store.
 */
export async function verifyPeerIdentity(
  myUserId: string,
  peerUserId: string,
  expectedSafetyNumber?: string
): Promise<{ safetyNumber: string; verified: boolean; record: PeerTrustRecord }> {
  const myIdentity = await getLocalIdentity(myUserId);
  const peerPub = await fetchRecipientIdentityPublicKey(peerUserId, { forceRefresh: true });

  const safetyNumber = computeSafetyNumber(
    myUserId,
    myIdentity.publicKeyHex,
    peerUserId,
    peerPub
  );

  const verified = expectedSafetyNumber ? safetyNumber === expectedSafetyNumber : false;

  const record: PeerTrustRecord = {
    userId: peerUserId,
    publicKey: peerPub,
    trustLevel: verified ? 'verified' : 'trusted',
    firstSeen: Date.now(),
    lastVerified: verified ? Date.now() : undefined,
  };

  setPeerTrust(record);
  return { safetyNumber, verified, record };
}

/**
 * Mark a peer as trusted without explicit safety-number comparison.
 */
export function trustPeerIdentity(userId: string, publicKey: string): void {
  const existing = getPeerTrust(userId, publicKey);
  setPeerTrust({
    userId,
    publicKey,
    trustLevel: 'trusted',
    firstSeen: existing?.firstSeen ?? Date.now(),
    lastVerified: Date.now(),
  });
}

// ============================================================================
// IDENTITY MANAGEMENT
// ============================================================================

/** Local-only identity material (no network). Creates a keypair if missing. */
export async function getLocalIdentity(userId: string): Promise<{
  privateKeyHex: string;
  publicKeyHex: string;
}> {
  let privateKeyHex = await getSecretItem(identityPrivateKeyId(userId));
  if (!privateKeyHex) {
    const { privateKey, publicKey } = await generateKeyPair();
    privateKeyHex = encode(privateKey);
    await setSecretItem(identityPrivateKeyId(userId), privateKeyHex);
    const publicKeyHex = encode(publicKey);
    setCachedIdentityPub(userId, publicKeyHex);
    return { privateKeyHex, publicKeyHex };
  }
  const publicKeyHex = publicKeyFromPrivate(privateKeyHex);
  setCachedIdentityPub(userId, publicKeyHex);
  return { privateKeyHex, publicKeyHex };
}

/**
 * Publish local secp identity to the server (legacy decrypt + safety numbers).
 * Call from login bootstrap — never from the message send hot path.
 */
export async function ensureLocalIdentity(userId: string): Promise<{
  privateKeyHex: string;
  publicKeyHex: string;
}> {
  const local = await getLocalIdentity(userId);
  try {
    await api.keys.register(local.publicKeyHex, 'identity');
  } catch (err) {
    console.warn('[e2e] identity upsert failed:', err);
  }
  return local;
}

export async function loadMyIdentityPrivateKey(userId: string): Promise<string | null> {
  return getSecretItem(identityPrivateKeyId(userId));
}

// ============================================================================
// PEER IDENTITY FETCHING
// ============================================================================

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

/** Coalesce concurrent lookups — a screen of messages must not fan out N requests. */
const identityFetches = new Map<string, Promise<string>>();

async function fetchIdentityWithRetry(userId: string): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < IDENTITY_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const { public_key } = await withTimeout(
        api.keys.getIdentity(userId),
        IDENTITY_FETCH_MS,
        'getIdentity'
      );
      if (public_key) return public_key;
      lastErr = new Error('empty identity key');
    } catch (err) {
      lastErr = err;
    }
    if (attempt < IDENTITY_FETCH_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('identity fetch failed');
}

async function fetchRecipientIdentityPublicKey(
  userId: string,
  opts?: { forceRefresh?: boolean }
): Promise<string> {
  if (!opts?.forceRefresh) {
    const cached = getCachedIdentityPub(userId);
    if (cached) return cached;
  }
  const inFlight = identityFetches.get(userId);
  if (inFlight && !opts?.forceRefresh) return inFlight;

  const request = fetchIdentityWithRetry(userId)
    .then((publicKey) => {
      notePeerIdentity(userId, publicKey);
      setCachedIdentityPub(userId, publicKey);
      return publicKey;
    })
    .finally(() => {
      if (identityFetches.get(userId) === request) identityFetches.delete(userId);
    });
  identityFetches.set(userId, request);
  return request;
}

export function clearIdentityPubCache(userId?: string) {
  clearCachedIdentityPub(userId);
  if (userId) identityFetches.delete(userId);
  else identityFetches.clear();
}

// ============================================================================
// ENCRYPTION — Signal for DMs, sender keys for groups (no plaintext fallback in strict path)
// ============================================================================

/**
 * Encrypt cleartext for a DM recipient.
 * Signal Protocol only — no legacy ECDH for new sends.
 */
export async function encryptTextForRecipient(
  senderUserId: string,
  recipientUserId: string,
  cleartext: string
): Promise<E2EWireFields> {
  if (!cleartext) {
    throw new Error('Cannot encrypt empty message');
  }

  // Publish our bundle first so the peer can answer with a PreKey session later.
  await publishSignalKeys(senderUserId);

  const peerPub = await fetchRecipientIdentityPublicKey(recipientUserId).catch(() => null);
  if (peerPub) {
    const trust = getPeerTrust(recipientUserId, peerPub);
    if (trust?.trustLevel === 'untrusted') {
      console.warn(
        '[e2e] encrypting despite untrusted identity for',
        recipientUserId,
        '(verify safety number when possible)'
      );
    }
  }

  const signal = await encryptSignalDm(senderUserId, recipientUserId, cleartext);
  return {
    content: signal.content,
    iv: signal.iv,
    ephemeral_public_key: signal.ephemeral_public_key,
    plaintext: false,
  };
}

/**
 * Encrypt cleartext for a DM or group chat.
 * Throws on failure — use tryEncryptChatText at UI boundaries.
 */
export async function encryptChatText(opts: {
  chatType: 'individual' | 'group';
  senderUserId: string | undefined;
  chatId: string;
  cleartext: string;
  memberUserIds?: string[];
}): Promise<E2EWireFields> {
  const { chatType, senderUserId, chatId, cleartext, memberUserIds } = opts;

  if (!senderUserId || !chatId || !cleartext) {
    throw new Error('Missing required encryption parameters');
  }

  if (chatType === 'group') {
    await publishSignalKeys(senderUserId);
    const members = memberUserIds?.length
      ? memberUserIds
      : ((await api.groups.members(chatId)).members as Array<{ user_id?: string }>)
          .map((m) => m.user_id)
          .filter(Boolean) as string[];

    if (members.length === 0) {
      throw new Error('Cannot encrypt group message: no members');
    }

    return encryptGroupText(senderUserId, chatId, cleartext, members);
  }

  return encryptTextForRecipient(senderUserId, chatId, cleartext);
}

/**
 * Best-effort encrypt for send / outbox paths.
 * Returns null only when encryption cannot complete (caller may queue plaintext offline).
 */
export async function tryEncryptChatText(opts: {
  chatType: 'individual' | 'group';
  senderUserId: string | undefined;
  chatId: string;
  cleartext: string;
  memberUserIds?: string[];
}): Promise<E2EWireFields | null> {
  const { chatType, chatId, senderUserId } = opts;
  // WhatsApp-style "Message yourself" — store as plaintext (no Signal session with self).
  if (chatType === 'individual' && senderUserId && chatId === senderUserId) {
    return null;
  }
  try {
    return await withTimeout(
      encryptChatText(opts),
      chatType === 'group' ? GROUP_ENCRYPT_MS : DM_ENCRYPT_MS,
      'encrypt'
    );
  } catch (err) {
    console.warn('[e2e] encrypt failed (no plaintext fallback on wire if strict):', err);
    if (chatType === 'individual') clearIdentityPubCache(chatId);
    return null;
  }
}

/** @deprecated Prefer tryEncryptChatText / encryptChatText */
export async function encryptDmText(
  chatType: 'individual' | 'group',
  senderUserId: string | undefined,
  recipientUserId: string,
  cleartext: string
): Promise<E2EWireFields> {
  if (chatType !== 'individual') {
    throw new Error('Group encryption requires member list');
  }
  return encryptChatText({
    chatType: 'individual',
    senderUserId,
    chatId: recipientUserId,
    cleartext,
  });
}

/** @deprecated Prefer tryEncryptChatText */
export async function tryEncryptDmText(
  chatType: 'individual' | 'group',
  senderUserId: string | undefined,
  recipientUserId: string,
  cleartext: string
): Promise<E2EWireFields | null> {
  if (chatType !== 'individual') return null;
  return tryEncryptChatText({
    chatType: 'individual',
    senderUserId,
    chatId: recipientUserId,
    cleartext,
  });
}

// ============================================================================
// DECRYPTION — Signal + group + legacy ECDH (read-only for old rows)
// ============================================================================

/** True when the row is marked encrypted (or has E2E fields). */
export function isEncryptedMessage(msg: DecryptableMessage): boolean {
  if (msg.plaintext === false) return true;
  return Boolean(msg.iv && msg.ephemeral_public_key && msg.plaintext !== true);
}

function messageCacheKey(msg: DecryptableMessage | string | undefined): string | undefined {
  if (!msg) return undefined;
  if (typeof msg === 'string') return msg;
  return msg.id || msg.client_message_id || undefined;
}

export function rememberDecryptedText(
  messageId: string | DecryptableMessage | undefined,
  cleartext: string | null | undefined
) {
  const key = messageCacheKey(messageId);
  if (!key || !cleartext) return;
  setCachedCleartext(key, cleartext);
}

export function recallDecryptedText(
  messageId: string | DecryptableMessage | undefined
): string | undefined {
  const key = messageCacheKey(messageId);
  if (!key) return undefined;
  return getCachedCleartext(key);
}

/** UI text: prefer decrypted cache, else plaintext content, else soft placeholder. */
export function getMessageDisplayText(msg: DecryptableMessage): string {
  if (msg.decrypted) return msg.decrypted;
  const cached = recallDecryptedText(msg);
  if (cached) return cached;
  if (!isEncryptedMessage(msg)) return msg.content ?? '';
  return 'Message';
}

async function tryDecryptWithShared(
  msg: DecryptableMessage,
  shared: Uint8Array
): Promise<string | null> {
  if (!msg.content || !msg.iv) return null;
  try {
    return await decryptMessage(msg.content, msg.iv, shared);
  } catch {
    return null;
  }
}

/**
 * Decrypt a single message for the local user.
 *
 * Supports:
 * - Signal Double Ratchet (primary)
 * - Group sender keys
 * - Legacy ECDH (old messages only)
 */
export async function decryptChatMessage<T extends DecryptableMessage>(
  msg: T,
  myUserId: string | undefined
): Promise<T> {
  if (!myUserId) return msg;
  await hydrateE2ECaches();

  const cacheKey = messageCacheKey(msg);
  if (msg.decrypted) {
    rememberDecryptedText(cacheKey, msg.decrypted);
    return msg;
  }

  const remembered = recallDecryptedText(cacheKey);
  if (remembered) return { ...msg, decrypted: remembered };

  if (!isEncryptedMessage(msg)) return msg;
  if (!msg.content || !msg.ephemeral_public_key) return msg;
  if (!msg.iv && !isSignalWire(msg.ephemeral_public_key)) return msg;

  try {
    // 1. Signal Double Ratchet
    if (isSignalWire(msg.ephemeral_public_key)) {
      const iAmSender = msg.sender_id === myUserId;
      const peerId = iAmSender
        ? msg.receiver_id || undefined
        : msg.sender_id || undefined;

      if (peerId) {
        // Ensure our SPK/identity exist locally before Bob-side PreKey init.
        await publishSignalKeys(myUserId).catch(() => undefined);

        const clear = await decryptSignalDm(
          myUserId,
          peerId,
          {
            content: msg.content,
            ephemeral_public_key: msg.ephemeral_public_key,
          },
          iAmSender
        );
        if (clear != null) {
          rememberDecryptedText(cacheKey, clear);
          return { ...msg, decrypted: clear };
        }
      }
      return msg;
    }

    // 2. Group sender-key messages
    if (msg.group_id && isGroupSenderKeyWire(msg.ephemeral_public_key)) {
      if (!msg.sender_id) return msg;
      const clear = await decryptGroupText(
        myUserId,
        msg.group_id,
        msg.sender_id,
        msg.content ?? '',
        msg.iv ?? ''
      );
      if (clear != null) {
        rememberDecryptedText(cacheKey, clear);
        return { ...msg, decrypted: clear };
      }
      console.warn('[e2e] group decrypt failed for message', cacheKey ?? 'unknown');
      return msg;
    }

    if (msg.group_id && msg.sender_id && !msg.receiver_id) {
      const clear = await decryptGroupText(
        myUserId,
        msg.group_id,
        msg.sender_id,
        msg.content ?? '',
        msg.iv ?? ''
      );
      if (clear != null) {
        rememberDecryptedText(cacheKey, clear);
        return { ...msg, decrypted: clear };
      }
    }

    // 3. Legacy ECDH (read old rows only)
    const myPriv = await loadMyIdentityPrivateKey(myUserId);
    if (!myPriv) return msg;

    const { senderPub, recipientPub } = unpackDmE2eWireKeys(msg.ephemeral_public_key);
    const iAmSender = msg.sender_id === myUserId;
    const peerId = iAmSender
      ? msg.receiver_id || undefined
      : msg.sender_id || undefined;

    const peerPubs: string[] = [];
    if (iAmSender) {
      if (recipientPub) peerPubs.push(recipientPub);
      if (peerId) {
        try {
          peerPubs.push(await fetchRecipientIdentityPublicKey(peerId));
        } catch {
          /* offline */
        }
      }
    } else {
      if (senderPub) peerPubs.push(senderPub);
      if (peerId) {
        try {
          peerPubs.push(await fetchRecipientIdentityPublicKey(peerId));
        } catch {
          /* offline */
        }
      }
    }

    const tried = new Set<string>();
    const attempt = async (pub: string | undefined): Promise<string | null> => {
      if (!pub || tried.has(pub)) return null;
      tried.add(pub);
      try {
        const shared = await deriveSharedSecret(myPriv, pub);
        return await tryDecryptWithShared(msg, shared);
      } catch {
        return null;
      }
    };

    for (const pub of peerPubs) {
      const clear = await attempt(pub);
      if (clear != null) {
        rememberDecryptedText(cacheKey, clear);
        return { ...msg, decrypted: clear };
      }
    }

    if (peerId) {
      clearCachedIdentityPub(peerId);
      try {
        const fresh = await fetchRecipientIdentityPublicKey(peerId, { forceRefresh: true });
        const clear = await attempt(fresh);
        if (clear != null) {
          rememberDecryptedText(cacheKey, clear);
          return { ...msg, decrypted: clear };
        }
      } catch {
        /* offline */
      }
    }

    // Legacy rows that can't be recovered (peer/user reinstalled) stay as placeholder.
    console.warn(
      '[e2e] legacy ECDH decrypt failed',
      cacheKey ?? 'preview',
      iAmSender ? '(sender re-read)' : '(recipient)',
      'peer=',
      peerId ?? '?'
    );
    return msg;
  } catch (err) {
    console.warn('[e2e] decrypt failed for message', messageCacheKey(msg) ?? 'unknown', err);
    return msg;
  }
}

export async function decryptChatMessages<T extends DecryptableMessage>(
  messages: T[],
  myUserId: string | undefined
): Promise<T[]> {
  if (!myUserId || messages.length === 0) return messages;

  const groupIds = [
    ...new Set(
      messages
        .filter((m) => m.group_id && isEncryptedMessage(m))
        .map((m) => m.group_id as string)
    ),
  ];

  await Promise.all(
    groupIds.map((gid) => syncGroupSenderKeysForMe(gid, myUserId).catch(() => undefined))
  );

  // Publish once per batch so Bob can accept inbound PreKey messages.
  await publishSignalKeys(myUserId).catch(() => undefined);

  return Promise.all(messages.map((m) => decryptChatMessage(m, myUserId)));
}

export function preserveSenderCleartext<T extends DecryptableMessage>(
  serverMsg: T,
  localMsg: T | undefined,
  myUserId: string | undefined
): T {
  if (!localMsg || !myUserId) return serverMsg;
  if (serverMsg.sender_id !== myUserId) return serverMsg;
  if (!isEncryptedMessage(serverMsg)) return serverMsg;

  const clear =
    localMsg.decrypted ||
    (localMsg.plaintext !== false && localMsg.content && !localMsg.iv
      ? localMsg.content
      : undefined);

  if (!clear) return serverMsg;
  rememberDecryptedText(serverMsg, clear);
  return { ...serverMsg, decrypted: clear };
}

/**
 * Resolve a chat-list preview string (decrypt when possible).
 */
export async function resolveChatListPreview(
  fields: {
    content?: string | null;
    message_type?: string | null;
    plaintext?: boolean | null;
    iv?: string | null;
    ephemeral_public_key?: string | null;
    sender_id?: string | null;
    receiver_id?: string | null;
    group_id?: string | null;
    id?: string | null;
    client_message_id?: string | null;
  },
  myUserId: string | undefined
): Promise<string> {
  const type = fields.message_type || 'text';
  if (type === 'audio') return 'Voice message';
  if (type === 'image') return 'Photo';
  if (type === 'video') return 'Video';
  if (type === 'file') return 'Document';
  if (type === 'reel') return 'Reel';
  if (type === 'moment') return 'Moment';

  const row: DecryptableMessage = {
    id: fields.id ?? undefined,
    client_message_id: fields.client_message_id ?? undefined,
    content: fields.content ?? '',
    message_type: type,
    plaintext: fields.plaintext,
    iv: fields.iv,
    ephemeral_public_key: fields.ephemeral_public_key,
    sender_id: fields.sender_id ?? undefined,
    receiver_id: fields.receiver_id ?? undefined,
    group_id: fields.group_id ?? undefined,
  };

  if (!isEncryptedMessage(row)) {
    return row.content || 'Message';
  }

  const decrypted = await decryptChatMessage(row, myUserId);
  return getMessageDisplayText(decrypted);
}

// ============================================================================
// LEGACY WIRE FORMAT HELPERS (kept for decrypt compatibility)
// ============================================================================

export function packDmE2eWireKeys(senderPub: string, recipientPub: string): string {
  return `${senderPub}|${recipientPub}`;
}

export function unpackDmE2eWireKeys(wire: string): {
  senderPub: string;
  recipientPub?: string;
} {
  const raw = wire.trim();
  const idx = raw.indexOf('|');
  if (idx <= 0 || idx === raw.length - 1) {
    return { senderPub: raw };
  }
  return {
    senderPub: raw.slice(0, idx),
    recipientPub: raw.slice(idx + 1),
  };
}
