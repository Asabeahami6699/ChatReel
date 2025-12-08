// hooks/useChat.ts
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import { encrypt, decrypt, deriveSharedSecret } from '../lib/crypto'
import * as SecureStore from 'expo-secure-store'

type Message = {
  id: string
  content: string
  sender_id: string
  created_at: string
  message_type: string
  file_url?: string
  plaintext?: boolean
  iv?: string
  ephemeral_public_key?: string
  decrypted?: string
  status?: 'sending' | 'sent' | 'failed'
}

export const useChat = (chatId: string, isGroup: boolean) => {
  const { user } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)

  const fetchMessages = async () => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .or(isGroup ? `group_id.eq.${chatId}` : `and(sender_id.eq.${user?.id},receiver_id.eq.${chatId}),and(sender_id.eq.${chatId},receiver_id.eq.${user?.id})`)
      .order('created_at', { ascending: true })
    setMessages(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchMessages()
  }, [chatId, isGroup])

  useEffect(() => {
    const channel = supabase
      .channel(`chat:${chatId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: isGroup ? `group_id=eq.${chatId}` : `receiver_id=eq.${user?.id}`,
      }, async (payload) => {
        const msg = payload.new
        if (msg.plaintext) {
          setMessages(prev => [...prev, { ...msg, decrypted: msg.content }])
          return
        }

        const myKey = await SecureStore.getItemAsync(`id_${user?.id}`)
        const shared = await deriveSharedSecret(myKey!, msg.ephemeral_public_key!)
        const decrypted = await decrypt(msg.content, msg.iv!, shared)
        setMessages(prev => [...prev, { ...msg, decrypted }])
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [chatId, isGroup, user?.id])

  const send = async (text: string) => {
    const tempId = Date.now().toString()
    const optimistic: Message = {
      id: tempId,
      content: text,
      sender_id: user!.id,
      created_at: new Date().toISOString(),
      status: 'sending',
    }
    setMessages(prev => [...prev, optimistic])

    try {
      let publicKeyB64: string
      if (isGroup) {
        // For simplicity: use first member's identity key
        const { data } = await supabase.from('group_members').select('user_id').eq('group_id', chatId).limit(1)
        const memberId = data![0].user_id
        const { data: key } = await supabase.from('public_keys').select('public_key').eq('user_id', memberId).eq('type', 'identity').single()
        publicKeyB64 = key.public_key
      } else {
        const { data } = await supabase.from('public_keys').select('public_key').eq('user_id', chatId).eq('type', 'identity').single()
        publicKeyB64 = data.public_key
      }

      const { privateKey: ephPriv, publicKey: ephPub } = await generateKeyPair()
      const shared = await deriveSharedSecret(ephPriv, publicKeyB64)
      const { iv, ciphertext } = await encrypt(text, shared)

      const { data } = await supabase
        .from('messages')
        .insert({
          sender_id: user!.id,
          receiver_id: isGroup ? null : chatId,
          group_id: isGroup ? chatId : null,
          content: ciphertext,
          iv,
          ephemeral_public_key: ephPub,
          plaintext: false,
        })
        .select()
        .single()

      setMessages(prev => prev.map(m => m.id === tempId ? { ...data, decrypted: text, status: 'sent' } : m))
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m))
    }
  }

  return { messages, loading, send }
}