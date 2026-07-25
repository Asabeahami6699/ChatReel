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

export type E2EWireFields = {
  content: string;
  iv: string;
  ephemeral_public_key: string;
  plaintext: false;
};

export type DecryptableMessage = {
  id?: string;
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
};

/**
 * Identity keys and decrypted cleartext live in e2eCache (memory + disk) so a
 * cold start doesn't need a network round trip before a message can be read.
 */
const IDENTITY_FETCH_MS = 6000;
const IDENTITY_FETCH_ATTEMPTS = 3;
const GROUP_ENCRYPT_MS = 8000;
/** Ceiling for the send path — past this we fall back to plaintext rather than stall. */
const DM_ENCRYPT_MS = 10000;

/** Warm the persisted caches as early as possible. */
void hydrateE2ECaches();

/**
 * Wire format for DM ECDH:
 *   legacy: "<senderPub>"
 *   v2:     "<senderPub>|<recipientPub>"
 * Recipient decrypts with ECDH(myPriv, senderPub).
 * Sender re-reads with ECDH(myPriv, recipientPub) — needed for true bidirectional decrypt.
 */
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

/** True when the row is marked encrypted (or has E2E fields). */
export function isEncryptedMessage(msg: DecryptableMessage): boolean {
  if (msg.plaintext === false) return true;
  return Boolean(msg.iv && msg.ephemeral_public_key && msg.plaintext !== true);
}

export function rememberDecryptedText(messageId: string | undefined, cleartext: string | null | undefined) {
  if (!messageId || !cleartext) return;
  setCachedCleartext(messageId, cleartext);
}

export function recallDecryptedText(messageId: string | undefined): string | undefined {
  if (!messageId) return undefined;
  return getCachedCleartext(messageId);
}

/** UI text: prefer decrypted cache, else plaintext content, else soft placeholder. */
export function getMessageDisplayText(msg: DecryptableMessage): string {
  if (msg.decrypted) return msg.decrypted;
  const cached = recallDecryptedText(msg.id);
  if (cached) return cached;
  if (!isEncryptedMessage(msg)) return msg.content ?? '';
  // Avoid scary "Encrypted message" flash while keys catch up.
  return 'Message';
}

export async function loadMyIdentityPrivateKey(userId: string): Promise<string | null> {
  return getSecretItem(identityPrivateKeyId(userId));
}

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
 * Publish local identity to the server (upsert). Call from login bootstrap only —
 * never from the message send hot path.
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

/**
 * Encrypt cleartext for a DM recipient using mutual identity ECDH.
 * Stores BOTH public keys on the wire so either party can decrypt later.
 */
export async function encryptTextForRecipient(
  senderUserId: string,
  recipientUserId: string,
  cleartext: string
): Promise<E2EWireFields> {
  const { privateKeyHex: myPriv, publicKeyHex: myPub } =
    await getLocalIdentity(senderUserId);
  const recipientPub = await fetchRecipientIdentityPublicKey(recipientUserId);
  const shared = await deriveSharedSecret(myPriv, recipientPub);
  const { iv, ciphertext } = await encryptMessage(cleartext, shared);
  return {
    content: ciphertext,
    iv,
    ephemeral_public_key: packDmE2eWireKeys(myPub, recipientPub),
    plaintext: false,
  };
}

/**
 * Best-effort encrypt for DM or group text.
 * Groups use sender keys; DMs use mutual identity ECDH.
 */
export async function tryEncryptChatText(opts: {
  chatType: 'individual' | 'group';
  senderUserId: string | undefined;
  chatId: string;
  cleartext: string;
  memberUserIds?: string[];
}): Promise<E2EWireFields | null> {
  const { chatType, senderUserId, chatId, cleartext, memberUserIds } = opts;
  if (!senderUserId || !chatId || !cleartext) return null;

  try {
    if (chatType === 'group') {
      const members = memberUserIds?.length
        ? memberUserIds
        : ((await api.groups.members(chatId)).members as Array<{ user_id?: string }>)
            .map((m) => m.user_id)
            .filter(Boolean) as string[];
      return await withTimeout(
        encryptGroupText(senderUserId, chatId, cleartext, members),
        GROUP_ENCRYPT_MS,
        'group-encrypt'
      );
    }

    return await withTimeout(
      encryptTextForRecipient(senderUserId, chatId, cleartext),
      DM_ENCRYPT_MS,
      'encrypt'
    );
  } catch (err) {
    console.warn('[e2e] encrypt skipped (plaintext fallback):', err);
    if (chatType === 'individual') clearIdentityPubCache(chatId);
    return null;
  }
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
 * Decrypt a single message for the local user when possible.
 * DM decrypt is bidirectional:
 *  - recipient: ECDH(myPriv, senderPubFromWire)
 *  - sender:    ECDH(myPriv, recipientPubFromWire | peer identity)
 */
export async function decryptChatMessage<T extends DecryptableMessage>(
  msg: T,
  myUserId: string | undefined
): Promise<T> {
  if (!myUserId) return msg;
  await hydrateE2ECaches();
  if (msg.decrypted) {
    rememberDecryptedText(msg.id, msg.decrypted);
    return msg;
  }
  const remembered = recallDecryptedText(msg.id);
  if (remembered) return { ...msg, decrypted: remembered };
  if (!isEncryptedMessage(msg)) return msg;
  if (!msg.content || !msg.iv || !msg.ephemeral_public_key) return msg;

  try {
    // Group sender-key messages
    if (msg.group_id && isGroupSenderKeyWire(msg.ephemeral_public_key)) {
      if (!msg.sender_id) return msg;
      const clear = await decryptGroupText(
        myUserId,
        msg.group_id,
        msg.sender_id,
        msg.content,
        msg.iv
      );
      if (clear != null) {
        rememberDecryptedText(msg.id, clear);
        return { ...msg, decrypted: clear };
      }
      console.warn('[e2e] group decrypt failed for message', msg.id);
      return msg;
    }

    // Also try GSK if group_id set (wire without prefix still)
    if (msg.group_id && msg.sender_id && !msg.receiver_id) {
      const clear = await decryptGroupText(
        myUserId,
        msg.group_id,
        msg.sender_id,
        msg.content,
        msg.iv
      );
      if (clear != null) {
        rememberDecryptedText(msg.id, clear);
        return { ...msg, decrypted: clear };
      }
    }

    const myPriv = await loadMyIdentityPrivateKey(myUserId);
    if (!myPriv) return msg;

    const { senderPub, recipientPub } = unpackDmE2eWireKeys(msg.ephemeral_public_key);
    const iAmSender = msg.sender_id === myUserId;
    const peerId = iAmSender
      ? msg.receiver_id || undefined
      : msg.sender_id || undefined;

    // Candidate peer pubs for ECDH(myPriv, peerPub). Never use my own pub first.
    const peerPubs: string[] = [];
    if (iAmSender) {
      // Need the recipient pub that was used at encrypt time.
      if (recipientPub) peerPubs.push(recipientPub);
      if (peerId) {
        try {
          peerPubs.push(await fetchRecipientIdentityPublicKey(peerId));
        } catch {
          /* offline / missing */
        }
      }
    } else {
      // Recipient: shared = ECDH(myPriv, senderPub).
      if (senderPub) peerPubs.push(senderPub);
      // Legacy / mis-tagged rows: also try live peer identity.
      if (peerId) {
        try {
          peerPubs.push(await fetchRecipientIdentityPublicKey(peerId));
        } catch {
          /* offline / missing */
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
        rememberDecryptedText(msg.id, clear);
        return { ...msg, decrypted: clear };
      }
    }

    // The cached peer identity can be stale (peer reinstalled and re-registered).
    // Re-fetch once and retry before giving up, so the row isn't stuck on a
    // placeholder until the user reopens the chat.
    if (peerId) {
      try {
        const fresh = await fetchRecipientIdentityPublicKey(peerId, { forceRefresh: true });
        const clear = await attempt(fresh);
        if (clear != null) {
          rememberDecryptedText(msg.id, clear);
          return { ...msg, decrypted: clear };
        }
      } catch {
        /* offline — keep the cached key for the next attempt */
      }
    }

    console.warn(
      '[e2e] decrypt failed for message',
      msg.id,
      iAmSender ? '(sender re-read failed)' : '(recipient decrypt failed — identity key mismatch?)'
    );
    return msg;
  } catch (err) {
    console.warn('[e2e] decrypt failed for message', msg.id, err);
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
  rememberDecryptedText(serverMsg.id, clear);
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

  const row = {
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
