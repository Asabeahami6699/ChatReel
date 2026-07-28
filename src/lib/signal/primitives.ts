/**
 * Signal-inspired E2EE primitives for Expo (X25519 + AES-256-GCM + HKDF).
 * Not a byte-compatible libsignal wire format — protocol semantics match
 * X3DH + Double Ratchet so decryption is deterministic and keyed per message.
 */
import { ed25519, x25519 } from '@noble/curves/ed25519.js';
import { gcm } from '@noble/ciphers/aes.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { hmac } from '@noble/hashes/hmac.js';
import { bytesToHex, hexToBytes, randomBytes } from '@noble/hashes/utils.js';

export const DR_WIRE_PREFIX = 'dr1:';

export function isSignalWire(ephemeralPublicKey?: string | null): boolean {
  return Boolean(ephemeralPublicKey?.startsWith(DR_WIRE_PREFIX));
}

export function toB64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export function fromB64(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomBytes32(): Uint8Array {
  return randomBytesN(32);
}

export function randomBytesN(n: number): Uint8Array {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ExpoCrypto = require('expo-crypto') as { getRandomBytes: (n: number) => Uint8Array };
    return ExpoCrypto.getRandomBytes(n);
  } catch {
    return randomBytes(n);
  }
}

export type X25519KeyPair = { privateKey: Uint8Array; publicKey: Uint8Array };
export type Ed25519KeyPair = { privateKey: Uint8Array; publicKey: Uint8Array };

export function generateX25519KeyPair(): X25519KeyPair {
  const privateKey = x25519.utils.randomSecretKey();
  const publicKey = x25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

export function generateEd25519KeyPair(): Ed25519KeyPair {
  const privateKey = ed25519.utils.randomSecretKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

export function x25519PublicFromPrivate(privateKey: Uint8Array): Uint8Array {
  return x25519.getPublicKey(privateKey);
}

export function dh(privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  return x25519.getSharedSecret(privateKey, publicKey);
}

export function sign(message: Uint8Array, privateKey: Uint8Array): Uint8Array {
  return ed25519.sign(message, privateKey);
}

export function verify(
  signature: Uint8Array,
  message: Uint8Array,
  publicKey: Uint8Array
): boolean {
  try {
    return ed25519.verify(signature, message, publicKey);
  } catch {
    return false;
  }
}

/** HKDF-SHA256 → 32 bytes */
export function kdf(
  ikm: Uint8Array,
  info: string,
  salt?: Uint8Array,
  length = 32
): Uint8Array {
  const saltBytes = salt ?? new Uint8Array(32);
  return hkdf(sha256, ikm, saltBytes, new TextEncoder().encode(info), length);
}

/** Double Ratchet KDF_RK: returns [newRootKey, chainKey] */
export function kdfRk(rootKey: Uint8Array, dhOut: Uint8Array): [Uint8Array, Uint8Array] {
  const out = hkdf(
    sha256,
    dhOut,
    rootKey,
    new TextEncoder().encode('WhisperRatchet'),
    64
  );
  return [out.slice(0, 32), out.slice(32, 64)];
}

/** Double Ratchet KDF_CK: returns [newChainKey, messageKey] */
export function kdfCk(chainKey: Uint8Array): [Uint8Array, Uint8Array] {
  const messageKey = hmac(sha256, chainKey, new Uint8Array([0x01]));
  const nextChain = hmac(sha256, chainKey, new Uint8Array([0x02]));
  return [nextChain, messageKey];
}

/** Derive AES-GCM key + 12-byte nonce from message key */
export function encryptWithMessageKey(
  messageKey: Uint8Array,
  plaintext: Uint8Array,
  ad?: Uint8Array
): { ciphertext: Uint8Array; nonce: Uint8Array } {
  const material = kdf(messageKey, 'WhisperMessageKeys', undefined, 44);
  const key = material.slice(0, 32);
  const nonce = material.slice(32, 44);
  const cipher = gcm(key, nonce, ad);
  return { ciphertext: cipher.encrypt(plaintext), nonce };
}

export function decryptWithMessageKey(
  messageKey: Uint8Array,
  ciphertext: Uint8Array,
  ad?: Uint8Array
): Uint8Array {
  const material = kdf(messageKey, 'WhisperMessageKeys', undefined, 44);
  const key = material.slice(0, 32);
  const nonce = material.slice(32, 44);
  const cipher = gcm(key, nonce, ad);
  return cipher.decrypt(ciphertext);
}

export { bytesToHex, hexToBytes };
