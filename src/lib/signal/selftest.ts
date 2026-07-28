/**
 * Quick self-test for X3DH + Double Ratchet (run with: npx tsx src/lib/signal/selftest.ts)
 * Not imported by the app.
 */
import { x3dhAlice, x3dhBob } from './x3dh';
import {
  initSessionAsAlice,
  initSessionAsBob,
  ratchetDecrypt,
  ratchetEncryptPreKey,
  ratchetEncrypt,
} from './doubleRatchet';
import {
  generateEd25519KeyPair,
  generateX25519KeyPair,
  sign,
  toB64,
} from './primitives';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const aliceIk = generateX25519KeyPair();
  const bobIk = generateX25519KeyPair();
  const bobSign = generateEd25519KeyPair();
  const bobSpk = generateX25519KeyPair();
  const bobOpk = generateX25519KeyPair();
  const sig = sign(bobSpk.publicKey, bobSign.privateKey);

  const bundle = {
    identityKey: toB64(bobIk.publicKey),
    signingKey: toB64(bobSign.publicKey),
    registrationId: 42,
    signedPreKey: {
      keyId: 1,
      publicKey: toB64(bobSpk.publicKey),
      signature: toB64(sig),
    },
    oneTimePreKey: { keyId: 7, publicKey: toB64(bobOpk.publicKey) },
  };

  const { sharedSecret, ephemeral, usedOpkId } = x3dhAlice(aliceIk.privateKey, bundle);
  assert(usedOpkId === 7, 'opk id');

  const bobSk = x3dhBob({
    ourIdentityPriv: bobIk.privateKey,
    ourSpkPriv: bobSpk.privateKey,
    ourOpkPriv: bobOpk.privateKey,
    theirIdentityPub: aliceIk.publicKey,
    theirEphemeralPub: ephemeral.publicKey,
  });
  assert(
    Buffer.from(sharedSecret).equals(Buffer.from(bobSk)),
    'X3DH shared secrets must match'
  );

  const aliceSess = initSessionAsAlice({
    sharedSecret,
    ourIdentityPub: aliceIk.publicKey,
    peerIdentityPub: bobIk.publicKey,
    peerSpkPub: bobSpk.publicKey,
  });
  const enc1 = ratchetEncryptPreKey(aliceSess, 'hello bob', {
    ourIdentityPub: aliceIk.publicKey,
    ourEphemeralPub: ephemeral.publicKey,
    spkId: 1,
    opkId: 7,
  });

  const bobSess = initSessionAsBob({
    sharedSecret: bobSk,
    ourIdentityPub: bobIk.publicKey,
    peerIdentityPub: aliceIk.publicKey,
    ourSpkPriv: bobSpk.privateKey,
    ourSpkPub: bobSpk.publicKey,
  });
  const clear1 = ratchetDecrypt(bobSess, enc1.header, enc1.ciphertextHex);
  assert(clear1 === 'hello bob', 'first decrypt');

  const enc2 = ratchetEncrypt(bobSess, 'hi alice');
  const clear2 = ratchetDecrypt(aliceSess, enc2.header, enc2.ciphertextHex);
  assert(clear2 === 'hi alice', 'reply decrypt');

  const enc3 = ratchetEncrypt(aliceSess, 'second');
  const clear3 = ratchetDecrypt(bobSess, enc3.header, enc3.ciphertextHex);
  assert(clear3 === 'second', 'third message');

  console.log('signal selftest OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
