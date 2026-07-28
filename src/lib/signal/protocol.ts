import { api } from '../api';
import {
  DR_WIRE_PREFIX,
  fromB64,
  isSignalWire,
  toB64,
} from './primitives';
import {
  initSessionAsAlice,
  initSessionAsBob,
  ratchetDecrypt,
  ratchetEncrypt,
  ratchetEncryptPreKey,
  type MessageHeader,
  type RatchetSession,
} from './doubleRatchet';
import { x3dhAlice, x3dhBob, type PreKeyBundle } from './x3dh';
import {
  consumeLocalOpk,
  ensureSignalIdentity,
  loadOpkPrivate,
  loadSession,
  saveSession,
} from './signalStore';

export type SignalWireFields = {
  content: string;
  iv: string;
  ephemeral_public_key: string;
  plaintext: false;
};

function packHeader(header: MessageHeader): string {
  return DR_WIRE_PREFIX + toB64(new TextEncoder().encode(JSON.stringify(header)));
}

function unpackHeader(wire: string): MessageHeader {
  const raw = wire.slice(DR_WIRE_PREFIX.length);
  const json = new TextDecoder().decode(fromB64(raw));
  return JSON.parse(json) as MessageHeader;
}

export { isSignalWire };

export async function fetchPreKeyBundle(userId: string): Promise<PreKeyBundle | null> {
  try {
    const bundle = await api.keys.getBundle(userId);
    if (!bundle?.identity_key || !bundle?.signed_prekey) return null;
    return {
      identityKey: bundle.identity_key,
      signingKey: bundle.signing_key,
      registrationId: bundle.registration_id,
      signedPreKey: {
        keyId: bundle.signed_prekey.key_id,
        publicKey: bundle.signed_prekey.public_key,
        signature: bundle.signed_prekey.signature,
      },
      oneTimePreKey: bundle.one_time_prekey
        ? {
            keyId: bundle.one_time_prekey.key_id,
            publicKey: bundle.one_time_prekey.public_key,
          }
        : null,
    };
  } catch {
    return null;
  }
}

async function ensureSessionAsAlice(
  myUserId: string,
  peerId: string
): Promise<{ session: RatchetSession; isNew: boolean; meta?: {
  ourIdentityPub: Uint8Array;
  ourEphemeralPub: Uint8Array;
  spkId: number;
  opkId: number | null;
} }> {
  const existing = await loadSession(myUserId, peerId);
  if (existing?.ckS) {
    return { session: existing, isNew: false };
  }

  const me = await ensureSignalIdentity(myUserId);
  const bundle = await fetchPreKeyBundle(peerId);
  if (!bundle) {
    throw new Error('Peer has no Signal prekey bundle');
  }

  const { sharedSecret, ephemeral, usedOpkId } = x3dhAlice(me.identityPriv, bundle);
  const session = initSessionAsAlice({
    sharedSecret,
    ourIdentityPub: me.identityPub,
    peerIdentityPub: fromB64(bundle.identityKey),
    peerSpkPub: fromB64(bundle.signedPreKey.publicKey),
  });
  await saveSession(myUserId, peerId, session);

  return {
    session,
    isNew: true,
    meta: {
      ourIdentityPub: me.identityPub,
      ourEphemeralPub: ephemeral.publicKey,
      spkId: bundle.signedPreKey.keyId,
      opkId: usedOpkId,
    },
  };
}

export async function encryptSignalDm(
  myUserId: string,
  peerId: string,
  cleartext: string
): Promise<SignalWireFields> {
  const { session, isNew, meta } = await ensureSessionAsAlice(myUserId, peerId);
  const enc =
    isNew && meta
      ? ratchetEncryptPreKey(session, cleartext, meta)
      : ratchetEncrypt(session, cleartext);
  await saveSession(myUserId, peerId, session);
  return {
    content: enc.ciphertextHex,
    iv: enc.ivHex,
    ephemeral_public_key: packHeader(enc.header),
    plaintext: false,
  };
}

export async function decryptSignalDm(
  myUserId: string,
  peerId: string,
  wire: { content: string; ephemeral_public_key: string },
  iAmSender: boolean
): Promise<string | null> {
  if (!isSignalWire(wire.ephemeral_public_key)) return null;
  try {
    const header = unpackHeader(wire.ephemeral_public_key);
    let session = await loadSession(myUserId, peerId);

    if (!session && header.t === 'pk' && header.ik && header.ek && header.spk_id != null) {
      // Bob receives first PreKey message
      const me = await ensureSignalIdentity(myUserId);
      if (header.spk_id !== me.spkId) {
        // SPK rotated — still try with current SPK (common case: same SPK)
        console.warn('[signal] SPK id mismatch', header.spk_id, me.spkId);
      }
      let opkPriv: Uint8Array | null = null;
      if (header.opk_id != null) {
        opkPriv = await loadOpkPrivate(myUserId, header.opk_id);
      }
      const sharedSecret = x3dhBob({
        ourIdentityPriv: me.identityPriv,
        ourSpkPriv: me.spkPriv,
        ourOpkPriv: opkPriv,
        theirIdentityPub: fromB64(header.ik),
        theirEphemeralPub: fromB64(header.ek),
      });
      session = initSessionAsBob({
        sharedSecret,
        ourIdentityPub: me.identityPub,
        peerIdentityPub: fromB64(header.ik),
        ourSpkPriv: me.spkPriv,
        ourSpkPub: me.spkPub,
      });
      if (header.opk_id != null) {
        await consumeLocalOpk(myUserId, header.opk_id);
      }
    }

    if (!session) {
      // Sender re-reading own message — session should exist locally
      if (iAmSender) {
        session = await loadSession(myUserId, peerId);
      }
      if (!session) return null;
    }

    const clear = ratchetDecrypt(session, header, wire.content);
    await saveSession(myUserId, peerId, session);
    return clear;
  } catch (err) {
    console.warn('[signal] decrypt failed:', err);
    return null;
  }
}
