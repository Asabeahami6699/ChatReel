// hooks/useKeys.ts
import { useEffect } from 'react';
import { api } from '../lib/api';
import { encode, generateKeyPair, publicKeyFromPrivate } from '../lib/crypto';
import { ensureLocalIdentity } from '../lib/messageCrypto';
import {
  getSecretItem,
  setSecretItem,
  signedPrekeyPrivateKeyId,
} from '../lib/keyStore';

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
    let cancelled = false;

    const init = async () => {
      if (!userId) return;

      try {
        // Always publish the local identity public key (upsert on server).
        await ensureLocalIdentity(userId);
        if (cancelled) return;

        await ensureSignedPrekey(userId);
        if (cancelled) return;

        const { count } = await api.keys.prekeyCount();
        if (count < 50) {
          const keys = await Promise.all(Array.from({ length: 100 }, generateKeyPair));
          await api.keys.registerPrekeys(keys.map((k) => encode(k.publicKey)));
        }
      } catch (err) {
        console.warn('[useKeys] init failed:', err);
      }
    };

    void init();
    return () => {
      cancelled = true;
    };
  }, [userId]);
};
