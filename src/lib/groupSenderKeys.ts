import * as Crypto from 'expo-crypto';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { api } from './api';
import {
  decryptMessage,
  deriveSharedSecret,
  encryptMessage,
  generateKeyPair,
  publicKeyFromPrivate,
  encode,
} from './crypto';
import { getSecretItem, identityPrivateKeyId, setSecretItem } from './keyStore';

async function getLocalIdentity(userId: string): Promise<{
  privateKeyHex: string;
  publicKeyHex: string;
}> {
  let privateKeyHex = await getSecretItem(identityPrivateKeyId(userId));
  if (!privateKeyHex) {
    const { privateKey, publicKey } = await generateKeyPair();
    privateKeyHex = encode(privateKey);
    await setSecretItem(identityPrivateKeyId(userId), privateKeyHex);
    return { privateKeyHex, publicKeyHex: encode(publicKey) };
  }
  return { privateKeyHex, publicKeyHex: publicKeyFromPrivate(privateKeyHex) };
}

/** Wire marker so decrypt can distinguish group GSK messages from DM ECDH. */
export const GSK_WIRE_PREFIX = 'gsk1:';

function mySenderKeyStoreId(userId: string, groupId: string) {
  return `gsk_own_${userId}_${groupId}`;
}

function peerSenderKeyStoreId(userId: string, groupId: string, senderId: string) {
  return `gsk_peer_${userId}_${groupId}_${senderId}`;
}

function distributedStampId(userId: string, groupId: string) {
  return `gsk_dist_${userId}_${groupId}`;
}

export function isGroupSenderKeyWire(ephemeralPublicKey?: string | null): boolean {
  return Boolean(ephemeralPublicKey?.startsWith(GSK_WIRE_PREFIX));
}

export function senderPubFromGroupWire(ephemeralPublicKey: string): string {
  return ephemeralPublicKey.slice(GSK_WIRE_PREFIX.length);
}

async function loadOrCreateMySenderKey(userId: string, groupId: string): Promise<Uint8Array> {
  const existing = await getSecretItem(mySenderKeyStoreId(userId, groupId));
  if (existing && /^[0-9a-fA-F]+$/.test(existing) && existing.length === 64) {
    return hexToBytes(existing);
  }
  const key = Crypto.getRandomBytes(32);
  await setSecretItem(mySenderKeyStoreId(userId, groupId), bytesToHex(key));
  // Force re-distribute when key is freshly created.
  await setSecretItem(distributedStampId(userId, groupId), '');
  return key;
}

async function storePeerSenderKey(
  userId: string,
  groupId: string,
  senderId: string,
  keyHex: string
): Promise<void> {
  await setSecretItem(peerSenderKeyStoreId(userId, groupId, senderId), keyHex);
}

async function loadPeerSenderKey(
  userId: string,
  groupId: string,
  senderId: string
): Promise<Uint8Array | null> {
  if (senderId === userId) {
    return loadOrCreateMySenderKey(userId, groupId);
  }
  const hex = await getSecretItem(peerSenderKeyStoreId(userId, groupId, senderId));
  if (hex && /^[0-9a-fA-F]+$/.test(hex) && hex.length === 64) {
    return hexToBytes(hex);
  }
  return null;
}

/**
 * Ensure my group sender key exists and is distributed to all peers.
 * Best-effort — failures don't throw (caller may still send plaintext).
 */
export async function ensureGroupSenderKeyDistributed(
  groupId: string,
  myUserId: string,
  memberUserIds: string[]
): Promise<boolean> {
  const peers = [...new Set(memberUserIds.filter((id) => id && id !== myUserId))];
  if (!peers.length) return true;

  const stampKey = distributedStampId(myUserId, groupId);
  const stamp = await getSecretItem(stampKey);
  const peerStamp = peers.slice().sort().join(',');
  if (stamp === peerStamp) {
    // Already distributed to this exact member set.
    return true;
  }

  try {
    const { privateKeyHex: myPriv, publicKeyHex: myPub } =
      await getLocalIdentity(myUserId);
    const senderKey = await loadOrCreateMySenderKey(myUserId, groupId);
    const senderKeyHex = bytesToHex(senderKey);

    const distributions: Array<{
      recipient_id: string;
      ciphertext: string;
      iv: string;
      sender_identity_pub: string;
    }> = [];

    for (const peerId of peers) {
      try {
        const { public_key } = await api.keys.getIdentity(peerId);
        const shared = await deriveSharedSecret(myPriv, public_key);
        const { iv, ciphertext } = await encryptMessage(senderKeyHex, shared);
        distributions.push({
          recipient_id: peerId,
          ciphertext,
          iv,
          sender_identity_pub: myPub,
        });
      } catch (err) {
        console.warn('[gsk] skip peer (no identity key):', peerId, err);
      }
    }

    if (!distributions.length) return false;

    await api.groups.publishSenderKeys(groupId, distributions);
    // Only stamp when every peer received a copy — otherwise retry next send
    // (and fall back to plaintext until identity keys exist for all members).
    if (distributions.length !== peers.length) return false;
    await setSecretItem(stampKey, peerStamp);
    return true;
  } catch (err) {
    console.warn('[gsk] distribute failed:', err);
    return false;
  }
}

/** Pull peer sender keys encrypted for me and cache them locally. */
export async function syncGroupSenderKeysForMe(
  groupId: string,
  myUserId: string
): Promise<void> {
  try {
    const myPriv = await getSecretItem(identityPrivateKeyId(myUserId));
    if (!myPriv) return;

    const { keys } = await api.groups.getSenderKeys(groupId);
    for (const row of keys) {
      if (!row.sender_id || row.sender_id === myUserId) continue;
      try {
        const shared = await deriveSharedSecret(myPriv, row.sender_identity_pub);
        const keyHex = await decryptMessage(row.ciphertext, row.iv, shared);
        if (/^[0-9a-fA-F]+$/.test(keyHex) && keyHex.length === 64) {
          await storePeerSenderKey(myUserId, groupId, row.sender_id, keyHex);
        }
      } catch (err) {
        console.warn('[gsk] decrypt peer key failed:', row.sender_id, err);
      }
    }
  } catch (err) {
    console.warn('[gsk] sync failed:', err);
  }
}

export async function encryptGroupText(
  senderUserId: string,
  groupId: string,
  cleartext: string,
  memberUserIds: string[]
): Promise<{ content: string; iv: string; ephemeral_public_key: string; plaintext: false }> {
  const distributed = await ensureGroupSenderKeyDistributed(
    groupId,
    senderUserId,
    memberUserIds
  );
  if (!distributed) {
    throw new Error('group sender key not distributed to all members');
  }
  const { publicKeyHex: myPub } = await getLocalIdentity(senderUserId);
  const senderKey = await loadOrCreateMySenderKey(senderUserId, groupId);
  const { iv, ciphertext } = await encryptMessage(cleartext, senderKey);
  return {
    content: ciphertext,
    iv,
    ephemeral_public_key: `${GSK_WIRE_PREFIX}${myPub}`,
    plaintext: false,
  };
}

export async function decryptGroupText(
  myUserId: string,
  groupId: string,
  senderId: string,
  content: string,
  iv: string
): Promise<string | null> {
  let key = await loadPeerSenderKey(myUserId, groupId, senderId);
  if (!key) {
    await syncGroupSenderKeysForMe(groupId, myUserId);
    key = await loadPeerSenderKey(myUserId, groupId, senderId);
  }
  if (!key) return null;
  try {
    return await decryptMessage(content, iv, key);
  } catch {
    // Key may have rotated — force re-sync once.
    await setSecretItem(peerSenderKeyStoreId(myUserId, groupId, senderId), '');
    await syncGroupSenderKeysForMe(groupId, myUserId);
    key = await loadPeerSenderKey(myUserId, groupId, senderId);
    if (!key) return null;
    try {
      return await decryptMessage(content, iv, key);
    } catch {
      return null;
    }
  }
}
