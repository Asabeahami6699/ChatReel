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

const identityPubCache = new Map<string, string>();
/** Survives remounts within the session so reopening a chat doesn't flash ciphertext. */
const decryptedByMessageId = new Map<string, string>();
const IDENTITY_FETCH_MS = 2000;
const GROUP_ENCRYPT_MS = 8000;

/** True when the row is marked encrypted (or has E2E fields). */
export function isEncryptedMessage(msg: DecryptableMessage): boolean {
  if (msg.plaintext === false) return true;
  return Boolean(msg.iv && msg.ephemeral_public_key && msg.plaintext !== true);
}

export function rememberDecryptedText(messageId: string | undefined, cleartext: string | null | undefined) {
  if (!messageId || !cleartext) return;
  decryptedByMessageId.set(messageId, cleartext);
}

export function recallDecryptedText(messageId: string | undefined): string | undefined {
  if (!messageId) return undefined;
  return decryptedByMessageId.get(messageId);
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
    identityPubCache.set(userId, publicKeyHex);
    return { privateKeyHex, publicKeyHex };
  }
  const publicKeyHex = publicKeyFromPrivate(privateKeyHex);
  identityPubCache.set(userId, publicKeyHex);
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

async function fetchRecipientIdentityPublicKey(userId: string): Promise<string> {
  const cached = identityPubCache.get(userId);
  if (cached) return cached;
  const { public_key } = await withTimeout(
    api.keys.getIdentity(userId),
    IDENTITY_FETCH_MS,
    'getIdentity'
  );
  identityPubCache.set(userId, public_key);
  return public_key;
}

export function clearIdentityPubCache(userId?: string) {
  if (userId) identityPubCache.delete(userId);
  else identityPubCache.clear();
}

/**
 * Encrypt cleartext for a DM recipient using mutual identity ECDH.
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
    ephemeral_public_key: myPub,
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
      IDENTITY_FETCH_MS + 500,
      'encrypt'
    );
  } catch (err) {
    console.warn('[e2e] encrypt skipped (plaintext fallback):', err);
    if (chatType === 'individual') identityPubCache.delete(chatId);
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
 */
export async function decryptChatMessage<T extends DecryptableMessage>(
  msg: T,
  myUserId: string | undefined
): Promise<T> {
  if (!myUserId) return msg;
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

    const iAmSender = msg.sender_id === myUserId;

    if (iAmSender) {
      const peerId = msg.receiver_id;
      if (!peerId) return msg;
      try {
        const peerPub = await fetchRecipientIdentityPublicKey(peerId);
        const shared = await deriveSharedSecret(myPriv, peerPub);
        const clear = await tryDecryptWithShared(msg, shared);
        if (clear != null) {
          rememberDecryptedText(msg.id, clear);
          return { ...msg, decrypted: clear };
        }
      } catch {
        /* leave undecrypted */
      }
      return msg;
    }

    const shared = await deriveSharedSecret(myPriv, msg.ephemeral_public_key);
    const clear = await tryDecryptWithShared(msg, shared);
    if (clear != null) {
      rememberDecryptedText(msg.id, clear);
      return { ...msg, decrypted: clear };
    }

    console.warn(
      '[e2e] decrypt failed for message',
      msg.id,
      '(identity key mismatch — reload both apps to resync keys)'
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
