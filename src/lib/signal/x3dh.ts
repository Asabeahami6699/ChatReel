import {
  dh,
  fromB64,
  generateX25519KeyPair,
  kdf,
  toB64,
  verify,
} from './primitives';

export type PreKeyBundle = {
  identityKey: string; // b64 X25519
  signingKey: string; // b64 Ed25519
  registrationId: number;
  signedPreKey: {
    keyId: number;
    publicKey: string; // b64 X25519
    signature: string; // b64 Ed25519 sig over SPK pub
  };
  oneTimePreKey?: {
    keyId: number;
    publicKey: string; // b64 X25519
  } | null;
};

/**
 * X3DH as Alice (initiator).
 * SK = KDF( DH(IK_A, SPK_B) || DH(EK_A, IK_B) || DH(EK_A, SPK_B) [|| DH(EK_A, OPK_B)] )
 */
export function x3dhAlice(
  ourIdentityPriv: Uint8Array,
  bundle: PreKeyBundle
): {
  sharedSecret: Uint8Array;
  ephemeral: { privateKey: Uint8Array; publicKey: Uint8Array };
  usedOpkId: number | null;
} {
  const ikB = fromB64(bundle.identityKey);
  const spkB = fromB64(bundle.signedPreKey.publicKey);
  const sig = fromB64(bundle.signedPreKey.signature);
  const signingKey = fromB64(bundle.signingKey);

  if (!verify(sig, spkB, signingKey)) {
    throw new Error('Signed prekey signature invalid');
  }

  const ephemeral = generateX25519KeyPair();
  const dh1 = dh(ourIdentityPriv, spkB);
  const dh2 = dh(ephemeral.privateKey, ikB);
  const dh3 = dh(ephemeral.privateKey, spkB);

  let ikm = concat(dh1, dh2, dh3);
  let usedOpkId: number | null = null;
  if (bundle.oneTimePreKey?.publicKey) {
    const opkB = fromB64(bundle.oneTimePreKey.publicKey);
    const dh4 = dh(ephemeral.privateKey, opkB);
    ikm = concat(ikm, dh4);
    usedOpkId = bundle.oneTimePreKey.keyId;
  }

  // F pad as in Signal (0xFF * 32) || ikm
  const pad = new Uint8Array(32).fill(0xff);
  const sharedSecret = kdf(concat(pad, ikm), 'WhisperText');

  return { sharedSecret, ephemeral, usedOpkId };
}

/**
 * X3DH as Bob (responder) — mirrors Alice's DH sequence.
 */
export function x3dhBob(opts: {
  ourIdentityPriv: Uint8Array;
  ourSpkPriv: Uint8Array;
  ourOpkPriv?: Uint8Array | null;
  theirIdentityPub: Uint8Array;
  theirEphemeralPub: Uint8Array;
}): Uint8Array {
  const dh1 = dh(opts.ourSpkPriv, opts.theirIdentityPub);
  const dh2 = dh(opts.ourIdentityPriv, opts.theirEphemeralPub);
  const dh3 = dh(opts.ourSpkPriv, opts.theirEphemeralPub);
  let ikm = concat(dh1, dh2, dh3);
  if (opts.ourOpkPriv) {
    const dh4 = dh(opts.ourOpkPriv, opts.theirEphemeralPub);
    ikm = concat(ikm, dh4);
  }
  const pad = new Uint8Array(32).fill(0xff);
  return kdf(concat(pad, ikm), 'WhisperText');
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export { toB64, fromB64 };
