// hooks/useKeys.ts
import { useEffect } from 'react';
import { InteractionManager } from 'react-native';
import { api } from '../lib/api';
import { encode, generateKeyPair } from '../lib/crypto';
import { ensureLocalIdentity } from '../lib/messageCrypto';
import {
  getSecretItem,
  setSecretItem,
  signedPrekeyPrivateKeyId,
} from '../lib/keyStore';
import {
  createOneTimePreKeys,
  ensureSignalIdentity,
  localOpkCount,
  toB64,
} from '../lib/signal/signalStore';

/** Defer heavy crypto/network so first paint and taps stay responsive. */
const KEYS_WARM_DELAY_MS = 2800;

async function ensureLegacySecpSignedPrekeyLocal(userId: string): Promise<void> {
  // Kept locally for any legacy tooling; Signal SPK is what we publish now.
  let signed = await getSecretItem(signedPrekeyPrivateKeyId(userId));
  if (!signed) {
    const { privateKey } = await generateKeyPair();
    signed = encode(privateKey);
    await setSecretItem(signedPrekeyPrivateKeyId(userId), signed);
  }
}

/** Publish X25519 identity + Ed25519 signing + signed prekey + OTPs (Signal). */
async function ensureSignalKeysPublished(userId: string): Promise<void> {
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
}

export const useKeys = (userId: string) => {
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let delayTimer: ReturnType<typeof setTimeout> | null = null;

    const init = async () => {
      try {
        // v1 secp identity kept for decrypting legacy ECDH messages.
        await ensureLocalIdentity(userId);
        if (cancelled) return;

        await ensureLegacySecpSignedPrekeyLocal(userId);
        if (cancelled) return;

        // Signal X3DH bundle (identity_x25519 + SPK + OTPs with private keys).
        await ensureSignalKeysPublished(userId);
      } catch (err) {
        console.warn('[useKeys] init failed:', err);
      }
    };

    const handle = InteractionManager.runAfterInteractions(() => {
      delayTimer = setTimeout(() => {
        if (!cancelled) void init();
      }, KEYS_WARM_DELAY_MS);
    });

    return () => {
      cancelled = true;
      handle.cancel?.();
      if (delayTimer) clearTimeout(delayTimer);
    };
  }, [userId]);
};
