// hooks/useChat.ts
import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { useAuth } from './useAuth';
import { useRealtimeTopic } from './useRealtimeTopic';
import { encrypt, decrypt, deriveSharedSecret, generateKeyPair, encode } from '../lib/crypto';
import * as SecureStore from 'expo-secure-store';

type Message = {
  id: string;
  content: string;
  sender_id: string;
  created_at: string;
  message_type: string;
  file_url?: string;
  plaintext?: boolean;
  iv?: string;
  ephemeral_public_key?: string;
  decrypted?: string;
  status?: 'sending' | 'sent' | 'failed';
};

export const useChat = (chatId: string, isGroup: boolean) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMessages = useCallback(async () => {
    try {
      const { messages: data } = await api.messages.list(chatId, isGroup);
      setMessages((data as Message[]) || []);
    } catch (err) {
      console.error('[useChat] fetch failed:', err);
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [chatId, isGroup]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useRealtimeTopic('messages', fetchMessages, Boolean(user?.id));

  const send = async (text: string) => {
    if (!user?.id) return;

    const tempId = Date.now().toString();
    const optimistic: Message = {
      id: tempId,
      content: text,
      sender_id: user.id,
      created_at: new Date().toISOString(),
      message_type: 'text',
      status: 'sending',
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      let publicKeyHex: string;
      if (isGroup) {
        const { members } = await api.groups.members(chatId);
        const memberId = (members[0]?.user_id as string) ?? user.id;
        const { public_key } = await api.keys.getIdentity(memberId);
        publicKeyHex = public_key;
      } else {
        const { public_key } = await api.keys.getIdentity(chatId);
        publicKeyHex = public_key;
      }

      const { privateKey: ephPriv, publicKey: ephPub } = await generateKeyPair();
      const shared = await deriveSharedSecret(encode(ephPriv), publicKeyHex);
      const { iv, ciphertext } = await encrypt(text, shared);

      const { message: data } = await api.messages.send({
        receiver_id: isGroup ? undefined : chatId,
        group_id: isGroup ? chatId : undefined,
        content: ciphertext,
        iv,
        ephemeral_public_key: encode(ephPub),
        plaintext: false,
        message_type: 'text',
      });

      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...(data as Message), decrypted: text, status: 'sent' } : m
        )
      );
    } catch (err) {
      console.error('[useChat] send failed:', err);
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m)));
    }
  };

  return { messages, loading, send };
};
