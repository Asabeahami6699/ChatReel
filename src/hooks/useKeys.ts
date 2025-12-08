// hooks/useKeys.ts
import { useEffect } from 'react'
import * as SecureStore from 'expo-secure-store'
import { supabase } from '../lib/supabase'
import { generateKeyPair } from '../lib/crypto'

export const useKeys = (userId: string) => {
  useEffect(() => {
    const init = async () => {
      if (!userId) return

      // Identity Key
      let identity = await SecureStore.getItemAsync(`id_${userId}`)
      if (!identity) {
        const { privateKey, publicKey } = await generateKeyPair()
        await SecureStore.setItemAsync(`id_${userId}`, privateKey)
        await supabase.from('public_keys').insert({
          user_id: userId,
          public_key: publicKey,
          type: 'identity',
        })
      }

      // Signed Prekey
      let signed = await SecureStore.getItemAsync(`spk_${userId}`)
      if (!signed) {
        const { privateKey, publicKey } = await generateKeyPair()
        await SecureStore.setItemAsync(`spk_${userId}`, privateKey)
        await supabase.from('public_keys').insert({
          user_id: userId,
          public_key: publicKey,
          type: 'signed_prekey',
        })
      }

      // One-time Prekeys (100)
      const { data } = await supabase.from('one_time_prekeys').select('id').eq('user_id', userId)
      if ((data?.length || 0) < 50) {
        const keys = await Promise.all(Array.from({ length: 100 }, generateKeyPair))
        await supabase.from('one_time_prekeys').insert(
          keys.map(k => ({ user_id: userId, public_key: k.publicKey }))
        )
      }
    }
    init()
  }, [userId])
}