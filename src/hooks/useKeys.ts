// hooks/useKeys.ts
import { useEffect } from 'react';
import { InteractionManager } from 'react-native';
import { api } from '../lib/api';
import { encode, generateKeyPair, publicKeyFromPrivate } from '../lib/crypto';
import { ensureLocalIdentity } from '../lib/messageCrypto';
import {
  getSecretItem,
  setSecretItem,
  signedPrekeyPrivateKeyId,
} from '../lib/keyStore';

/** Defer heavy crypto/network so first paint and taps stay responsive. */
const KEYS_WARM_DELAY_MS = 2800;

async function ensureSignedPrekey(userId: string): Promise<void> {
  let signed = await getSecretItem(signedPrekeyPrivateKeyId(userId));
  if (!signed) {
    const { privateKey, publicKey } = await generateKeyPair();
    signed = encode(privateKey);
    await setSecretItem(signedPrekeyPrivateKeyId(userId), signed);
    await api.keys.register(encode(publicKey), 'signed_prekey');
    return;
  }
  try {
    await api.keys.register(publicKeyFromPrivate(signed), 'signed_prekey');
  } catch {
    /* already synced */
  }
}

export const useKeys = (userId: string) => {
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let delayTimer: ReturnType<typeof setTimeout> | null = null;

    const init = async () => {
      try {
        // Always publish the local identity public key (upsert on server).
        await ensureLocalIdentity(userId);
        if (cancelled) return;

        await ensureSignedPrekey(userId);
        if (cancelled) return;

        const { count } = await api.keys.prekeyCount();
        if (cancelled) return;
        if (count < 50) {
          // Batch keygen — this is CPU heavy; keep off the critical path.
          const keys = await Promise.all(Array.from({ length: 100 }, generateKeyPair));
          if (cancelled) return;
          await api.keys.registerPrekeys(keys.map((k) => encode(k.publicKey)));
        }
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
