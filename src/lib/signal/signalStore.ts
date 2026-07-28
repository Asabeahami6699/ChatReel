import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSecretItem, setSecretItem } from '../keyStore';
import type { RatchetSession } from './doubleRatchet';
import {
  bytesToHex,
  fromB64,
  generateEd25519KeyPair,
  generateX25519KeyPair,
  hexToBytes,
  randomBytesN,
  sign,
  toB64,
  x25519PublicFromPrivate,
} from './primitives';

const REG_ID_KEY = (userId: string) => `sig_reg_${userId}`;
const IK_PRIV = (userId: string) => `sig_ik_${userId}`;
const SIGN_PRIV = (userId: string) => `sig_sign_${userId}`;
const SPK_PRIV = (userId: string) => `sig_spk_${userId}`;
const SPK_ID = (userId: string) => `sig_spk_id_${userId}`;
const OPK_MAP = (userId: string) => `sig_opk_map_${userId}`;
const SESSION = (userId: string, peerId: string) => `sig_sess_${userId}_${peerId}`;

export type LocalSignalIdentity = {
  registrationId: number;
  identityPriv: Uint8Array;
  identityPub: Uint8Array;
  signingPriv: Uint8Array;
  signingPub: Uint8Array;
  spkId: number;
  spkPriv: Uint8Array;
  spkPub: Uint8Array;
  spkSignature: Uint8Array;
};

async function loadOpkMap(userId: string): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(OPK_MAP(userId));
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

async function saveOpkMap(userId: string, map: Record<string, string>) {
  await AsyncStorage.setItem(OPK_MAP(userId), JSON.stringify(map));
}

export async function ensureSignalIdentity(userId: string): Promise<LocalSignalIdentity> {
  let regRaw = await getSecretItem(REG_ID_KEY(userId));
  let registrationId = regRaw ? parseInt(regRaw, 10) : NaN;
  if (!Number.isFinite(registrationId)) {
    registrationId = (randomBytesN(2)[0]! << 8) | randomBytesN(1)[0]!;
    registrationId = (registrationId % 16380) + 1;
    await setSecretItem(REG_ID_KEY(userId), String(registrationId));
  }

  let ikPrivHex = await getSecretItem(IK_PRIV(userId));
  let identityPriv: Uint8Array;
  let identityPub: Uint8Array;
  if (!ikPrivHex) {
    const kp = generateX25519KeyPair();
    identityPriv = kp.privateKey;
    identityPub = kp.publicKey;
    await setSecretItem(IK_PRIV(userId), bytesToHex(identityPriv));
  } else {
    identityPriv = hexToBytes(ikPrivHex);
    identityPub = x25519PublicFromPrivate(identityPriv);
  }

  let signPrivHex = await getSecretItem(SIGN_PRIV(userId));
  let signingPriv: Uint8Array;
  let signingPub: Uint8Array;
  if (!signPrivHex) {
    const kp = generateEd25519KeyPair();
    signingPriv = kp.privateKey;
    signingPub = kp.publicKey;
    await setSecretItem(SIGN_PRIV(userId), bytesToHex(signingPriv));
  } else {
    signingPriv = hexToBytes(signPrivHex);
    const { ed25519 } = await import('@noble/curves/ed25519.js');
    signingPub = ed25519.getPublicKey(signingPriv);
  }

  let spkIdRaw = await getSecretItem(SPK_ID(userId));
  let spkPrivHex = await getSecretItem(SPK_PRIV(userId));
  let spkId = spkIdRaw ? parseInt(spkIdRaw, 10) : NaN;
  let spkPriv: Uint8Array;
  let spkPub: Uint8Array;
  if (!spkPrivHex || !Number.isFinite(spkId)) {
    const kp = generateX25519KeyPair();
    spkPriv = kp.privateKey;
    spkPub = kp.publicKey;
    spkId = 1;
    await setSecretItem(SPK_PRIV(userId), bytesToHex(spkPriv));
    await setSecretItem(SPK_ID(userId), String(spkId));
  } else {
    spkPriv = hexToBytes(spkPrivHex);
    spkPub = x25519PublicFromPrivate(spkPriv);
  }

  const spkSignature = sign(spkPub, signingPriv);

  return {
    registrationId,
    identityPriv,
    identityPub,
    signingPriv,
    signingPub,
    spkId,
    spkPriv,
    spkPub,
    spkSignature,
  };
}

/** Generate OTPs, persist privates locally, return pubs for upload. */
export async function createOneTimePreKeys(
  userId: string,
  count: number
): Promise<Array<{ keyId: number; publicKey: string }>> {
  const map = await loadOpkMap(userId);
  const existingIds = Object.keys(map).map((k) => parseInt(k, 10)).filter(Number.isFinite);
  let nextId = existingIds.length ? Math.max(...existingIds) + 1 : 1;
  const out: Array<{ keyId: number; publicKey: string }> = [];
  for (let i = 0; i < count; i++) {
    const kp = generateX25519KeyPair();
    const keyId = nextId++;
    map[String(keyId)] = bytesToHex(kp.privateKey);
    out.push({ keyId, publicKey: toB64(kp.publicKey) });
  }
  await saveOpkMap(userId, map);
  return out;
}

export async function loadOpkPrivate(
  userId: string,
  keyId: number
): Promise<Uint8Array | null> {
  const map = await loadOpkMap(userId);
  const hex = map[String(keyId)];
  if (!hex) return null;
  return hexToBytes(hex);
}

export async function consumeLocalOpk(userId: string, keyId: number): Promise<void> {
  const map = await loadOpkMap(userId);
  delete map[String(keyId)];
  await saveOpkMap(userId, map);
}

export async function localOpkCount(userId: string): Promise<number> {
  const map = await loadOpkMap(userId);
  return Object.keys(map).length;
}

export async function loadSession(
  userId: string,
  peerId: string
): Promise<RatchetSession | null> {
  try {
    const raw = await AsyncStorage.getItem(SESSION(userId, peerId));
    if (!raw) return null;
    return JSON.parse(raw) as RatchetSession;
  } catch {
    return null;
  }
}

export async function saveSession(
  userId: string,
  peerId: string,
  session: RatchetSession
): Promise<void> {
  await AsyncStorage.setItem(SESSION(userId, peerId), JSON.stringify(session));
}

export async function clearSignalSessions(userId: string): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const mine = keys.filter((k) => k.startsWith(`sig_sess_${userId}_`));
  if (mine.length) await AsyncStorage.multiRemove(mine);
}

export { toB64, fromB64 };
