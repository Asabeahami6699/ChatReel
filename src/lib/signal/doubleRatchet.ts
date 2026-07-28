import {
  decryptWithMessageKey,
  dh,
  encryptWithMessageKey,
  fromB64,
  generateX25519KeyPair,
  kdf,
  kdfCk,
  kdfRk,
  toB64,
  type X25519KeyPair,
} from './primitives';

const MAX_SKIP = 200;

export type SkippedKey = { dhPubB64: string; n: number; mkB64: string };

export type RatchetSession = {
  /** Root key */
  rk: string;
  /** Our current DH ratchet keypair */
  dhPriv: string;
  dhPub: string;
  /** Their current DH ratchet public key (b64), or null before first receive */
  theirDhPub: string | null;
  /** Sending / receiving chain keys */
  ckS: string | null;
  ckR: string | null;
  /** Message numbers */
  ns: number;
  nr: number;
  /** Previous sending chain length */
  pn: number;
  skipped: SkippedKey[];
  /** Peer identity public (X25519 b64) — associated data */
  peerIdentityPub: string;
  /** Our identity public (X25519 b64) */
  ourIdentityPub: string;
  /** True if we initiated (Alice) */
  initiated: boolean;
};

export type MessageHeader = {
  v: 1;
  t: 'pk' | 'msg';
  /** Alice identity (X25519) — prekey only */
  ik?: string;
  /** Alice ephemeral EK — prekey only */
  ek?: string;
  spk_id?: number;
  opk_id?: number | null;
  /** Current ratchet DH public */
  dh: string;
  pn: number;
  n: number;
};

function b64(u: Uint8Array) {
  return toB64(u);
}
function ub64(s: string) {
  return fromB64(s);
}

function adBytes(ourIk: string, theirIk: string): Uint8Array {
  // Canonical order so encrypt/decrypt sides produce identical AAD.
  const [first, second] = ourIk < theirIk ? [ourIk, theirIk] : [theirIk, ourIk];
  const a = ub64(first);
  const b = ub64(second);
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

export function initSessionAsAlice(opts: {
  sharedSecret: Uint8Array;
  ourIdentityPub: Uint8Array;
  peerIdentityPub: Uint8Array;
  /** Bob's signed prekey public (initial remote DH) */
  peerSpkPub: Uint8Array;
}): RatchetSession {
  const dhPair = generateX25519KeyPair();
  const dhOut = dh(dhPair.privateKey, opts.peerSpkPub);
  // RK from X3DH SK; first sending chain from DH(ourEK_ratchet, theirSPK)
  const rk0 = kdf(opts.sharedSecret, 'WhisperRootKey');
  const [rk, ckS] = kdfRk(rk0, dhOut);
  return {
    rk: b64(rk),
    dhPriv: b64(dhPair.privateKey),
    dhPub: b64(dhPair.publicKey),
    theirDhPub: b64(opts.peerSpkPub),
    ckS: b64(ckS),
    ckR: null,
    ns: 0,
    nr: 0,
    pn: 0,
    skipped: [],
    peerIdentityPub: b64(opts.peerIdentityPub),
    ourIdentityPub: b64(opts.ourIdentityPub),
    initiated: true,
  };
}

export function initSessionAsBob(opts: {
  sharedSecret: Uint8Array;
  ourIdentityPub: Uint8Array;
  peerIdentityPub: Uint8Array;
  /** Our SPK used in X3DH (current DH private until first ratchet) */
  ourSpkPriv: Uint8Array;
  ourSpkPub: Uint8Array;
}): RatchetSession {
  const rk0 = kdf(opts.sharedSecret, 'WhisperRootKey');
  return {
    rk: b64(rk0),
    dhPriv: b64(opts.ourSpkPriv),
    dhPub: b64(opts.ourSpkPub),
    theirDhPub: null,
    ckS: null,
    ckR: null,
    ns: 0,
    nr: 0,
    pn: 0,
    skipped: [],
    peerIdentityPub: b64(opts.peerIdentityPub),
    ourIdentityPub: b64(opts.ourIdentityPub),
    initiated: false,
  };
}

function skipMessageKeys(
  session: RatchetSession,
  until: number,
  theirDhB64: string
): void {
  if (!session.ckR) return;
  if (until - session.nr > MAX_SKIP) {
    throw new Error('Too many skipped message keys');
  }
  let ck = ub64(session.ckR);
  while (session.nr < until) {
    const [nextCk, mk] = kdfCk(ck);
    session.skipped.push({
      dhPubB64: theirDhB64,
      n: session.nr,
      mkB64: b64(mk),
    });
    if (session.skipped.length > MAX_SKIP) {
      session.skipped.shift();
    }
    ck = nextCk;
    session.nr += 1;
  }
  session.ckR = b64(ck);
}

function dhRatchet(session: RatchetSession, theirDhPub: Uint8Array): void {
  session.pn = session.ns;
  session.ns = 0;
  session.nr = 0;
  session.theirDhPub = b64(theirDhPub);

  // Receiving chain
  const dhOut1 = dh(ub64(session.dhPriv), theirDhPub);
  const [rk1, ckR] = kdfRk(ub64(session.rk), dhOut1);
  session.rk = b64(rk1);
  session.ckR = b64(ckR);

  // Sending chain — new DH key pair
  const next = generateX25519KeyPair();
  session.dhPriv = b64(next.privateKey);
  session.dhPub = b64(next.publicKey);
  const dhOut2 = dh(next.privateKey, theirDhPub);
  const [rk2, ckS] = kdfRk(ub64(session.rk), dhOut2);
  session.rk = b64(rk2);
  session.ckS = b64(ckS);
}

export function ratchetEncrypt(
  session: RatchetSession,
  plaintext: string
): { header: MessageHeader; ciphertextHex: string; ivHex: string } {
  if (!session.ckS) {
    throw new Error('Sending chain not initialized');
  }
  const [nextCk, mk] = kdfCk(ub64(session.ckS));
  session.ckS = b64(nextCk);
  const n = session.ns;
  session.ns += 1;

  const ad = adBytes(session.ourIdentityPub, session.peerIdentityPub);
  const { ciphertext, nonce } = encryptWithMessageKey(
    mk,
    new TextEncoder().encode(plaintext),
    ad
  );

  const header: MessageHeader = {
    v: 1,
    t: 'msg',
    dh: session.dhPub,
    pn: session.pn,
    n,
  };

  return {
    header,
    ciphertextHex: bytesToHexSafe(ciphertext),
    ivHex: bytesToHexSafe(nonce),
  };
}

export function ratchetEncryptPreKey(
  session: RatchetSession,
  plaintext: string,
  meta: {
    ourIdentityPub: Uint8Array;
    ourEphemeralPub: Uint8Array;
    spkId: number;
    opkId?: number | null;
  }
): { header: MessageHeader; ciphertextHex: string; ivHex: string } {
  const enc = ratchetEncrypt(session, plaintext);
  enc.header = {
    ...enc.header,
    t: 'pk',
    ik: b64(meta.ourIdentityPub),
    ek: b64(meta.ourEphemeralPub),
    spk_id: meta.spkId,
    opk_id: meta.opkId ?? null,
  };
  return enc;
}

function trySkipped(
  session: RatchetSession,
  header: MessageHeader,
  ciphertext: Uint8Array
): string | null {
  const idx = session.skipped.findIndex(
    (s) => s.dhPubB64 === header.dh && s.n === header.n
  );
  if (idx < 0) return null;
  const [entry] = session.skipped.splice(idx, 1);
  const ad = adBytes(session.ourIdentityPub, session.peerIdentityPub);
  const plain = decryptWithMessageKey(ub64(entry.mkB64), ciphertext, ad);
  return new TextDecoder().decode(plain);
}

export function ratchetDecrypt(
  session: RatchetSession,
  header: MessageHeader,
  ciphertextHex: string
): string {
  const ciphertext = hexToBytesSafe(ciphertextHex);

  const skipped = trySkipped(session, header, ciphertext);
  if (skipped != null) return skipped;

  const theirDh = ub64(header.dh);
  if (!session.theirDhPub || session.theirDhPub !== header.dh) {
    if (session.theirDhPub && session.ckR) {
      skipMessageKeys(session, header.pn, session.theirDhPub);
    }
    dhRatchet(session, theirDh);
  }

  skipMessageKeys(session, header.n, header.dh);
  if (!session.ckR) throw new Error('Receiving chain missing');

  const [nextCk, mk] = kdfCk(ub64(session.ckR));
  session.ckR = b64(nextCk);
  session.nr += 1;

  const ad = adBytes(session.ourIdentityPub, session.peerIdentityPub);
  const plain = decryptWithMessageKey(mk, ciphertext, ad);
  return new TextDecoder().decode(plain);
}

function bytesToHexSafe(u: Uint8Array): string {
  return Array.from(u)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytesSafe(hex: string): Uint8Array {
  const clean = hex.trim();
  if (clean.length % 2) throw new Error('bad hex');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export type { X25519KeyPair };
