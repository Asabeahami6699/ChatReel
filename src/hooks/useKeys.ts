// hooks/useKeys.ts
import { useEffect } from 'react';
import { InteractionManager } from 'react-native';
import { encode, generateKeyPair } from '../lib/crypto';
import { ensureLocalIdentity } from '../lib/messageCrypto';
import {
  getSecretItem,
  setSecretItem,
  signedPrekeyPrivateKeyId,
} from '../lib/keyStore';
import { publishSignalKeys } from '../lib/signal/publishKeys';

/** Defer heavy crypto/network so first paint and taps stay responsive. */
const KEYS_WARM_DELAY_MS = 800;

async function ensureLegacySecpSignedPrekeyLocal(userId: string): Promise<void> {
  // Kept locally for any legacy tooling; Signal SPK is what we publish now.
  let signed = await getSecretItem(signedPrekeyPrivateKeyId(userId));
  if (!signed) {
    const { privateKey } = await generateKeyPair();
    signed = encode(privateKey);
    await setSecretItem(signedPrekeyPrivateKeyId(userId), signed);
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
        await publishSignalKeys(userId);
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
