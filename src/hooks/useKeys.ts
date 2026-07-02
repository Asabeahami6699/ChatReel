// hooks/useKeys.ts
import { useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api } from '../lib/api';
import { generateKeyPair, encode } from '../lib/crypto';

export const useKeys = (userId: string) => {
  useEffect(() => {
    const init = async () => {
      if (!userId) return;

      let identity = await SecureStore.getItemAsync(`id_${userId}`);
      if (!identity) {
        const { privateKey, publicKey } = await generateKeyPair();
        identity = encode(privateKey);
        await SecureStore.setItemAsync(`id_${userId}`, identity);
        await api.keys.register(encode(publicKey), 'identity');
      }

      let signed = await SecureStore.getItemAsync(`spk_${userId}`);
      if (!signed) {
        const { privateKey, publicKey } = await generateKeyPair();
        signed = encode(privateKey);
        await SecureStore.setItemAsync(`spk_${userId}`, signed);
        await api.keys.register(encode(publicKey), 'signed_prekey');
      }

      const { count } = await api.keys.prekeyCount();
      if (count < 50) {
        const keys = await Promise.all(Array.from({ length: 100 }, generateKeyPair));
        await api.keys.registerPrekeys(keys.map((k) => encode(k.publicKey)));
      }
    };
    init();
  }, [userId]);
};
