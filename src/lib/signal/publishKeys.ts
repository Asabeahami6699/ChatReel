import { api } from '../api';
import {
  createOneTimePreKeys,
  ensureSignalIdentity,
  localOpkCount,
  toB64,
} from './signalStore';

let publishInFlight: Promise<void> | null = null;
let lastPublishedFor: string | null = null;
let lastPublishedAt = 0;
const REPUBLISH_MIN_MS = 30_000;

/** Ensure this device's Signal X3DH material is on the server before encrypt/decrypt. */
export async function publishSignalKeys(userId: string): Promise<void> {
  if (
    lastPublishedFor === userId &&
    Date.now() - lastPublishedAt < REPUBLISH_MIN_MS &&
    !publishInFlight
  ) {
    return;
  }
  if (publishInFlight) {
    await publishInFlight;
    return;
  }

  publishInFlight = (async () => {
    const id = await ensureSignalIdentity(userId);

    await api.keys.register(toB64(id.identityPub), 'identity_x25519', {
      registration_id: id.registrationId,
    });
    await api.keys.register(toB64(id.signingPub), 'signing', {
      registration_id: id.registrationId,
    });
    await api.keys.register(toB64(id.spkPub), 'signed_prekey', {
      key_id: id.spkId,
      signature: toB64(id.spkSignature),
      registration_id: id.registrationId,
    });

    const localCount = await localOpkCount(userId);
    const { count: remoteCount } = await api.keys.prekeyCount();
    if (localCount < 40 || remoteCount < 40) {
      const batch = await createOneTimePreKeys(userId, 80);
      await api.keys.registerSignalPrekeys(batch);
    }

    lastPublishedFor = userId;
    lastPublishedAt = Date.now();
  })().finally(() => {
    publishInFlight = null;
  });

  await publishInFlight;
}
