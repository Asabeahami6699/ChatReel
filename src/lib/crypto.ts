// src/lib/crypto.ts
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { cbc } from '@noble/ciphers/aes.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import * as Crypto from 'expo-crypto';

export async function generateKeyPair() {
  const privateKey = secp256k1.utils.randomPrivateKey();
  const publicKey = secp256k1.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

export const encode = bytesToHex;

export async function deriveSharedSecret(privateKeyHex: string, publicKeyHex: string) {
  const privateKeyBytes = hexToBytes(privateKeyHex);
  const publicKeyBytes = hexToBytes(publicKeyHex);
  const sharedPoint = secp256k1.getSharedSecret(privateKeyBytes, publicKeyBytes);
  const salt = new Uint8Array(32);
  const info = new TextEncoder().encode('chat-app-e2ee');
  return hkdf(sha256, sharedPoint.slice(1), salt, info, 32);
}

export async function encryptMessage(text: string, shared: Uint8Array) {
  const iv = Crypto.getRandomBytes(16);
  const plaintext = new TextEncoder().encode(text);
  const ciphertext = cbc.encrypt(plaintext, shared, iv);
  return { iv: bytesToHex(iv), ciphertext: bytesToHex(ciphertext) };
}

export async function decryptMessage(content: string, iv: string, shared: Uint8Array) {
  const ciphertextBytes = hexToBytes(content);
  const ivBytes = hexToBytes(iv);
  const decryptedBytes = cbc.decrypt(ciphertextBytes, shared, ivBytes);
  return new TextDecoder().decode(decryptedBytes);
}