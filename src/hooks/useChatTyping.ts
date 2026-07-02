import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { ensureSupabaseSession } from '../lib/ensureSupabaseSession';

type TypingPayload = {
  user_id: string;
  display_name?: string;
};

type Options = {
  chatId: string;
  chatType: 'individual' | 'group';
  userId: string | undefined;
  displayName?: string;
  draft: string;
};

export function useChatTyping({
  chatId,
  chatType,
  userId,
  displayName,
  draft,
}: Options) {
  const [typingUsers, setTypingUsers] = useState<TypingPayload[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastBroadcastRef = useRef(0);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const channelName = `chat-typing:${chatType}:${chatId}`;

  const clearTypingUser = useCallback((uid: string) => {
    const t = timersRef.current.get(uid);
    if (t) clearTimeout(t);
    timersRef.current.delete(uid);
    setTypingUsers((prev) => prev.filter((u) => u.user_id !== uid));
  }, []);

  useEffect(() => {
    if (!chatId || !userId) return;

    let cancelled = false;

    void ensureSupabaseSession().then(() => {
      if (cancelled) return;

      const ch = supabase.channel(channelName, {
        config: { broadcast: { self: false } },
      });

      ch.on('broadcast', { event: 'typing' }, ({ payload }) => {
        const p = payload as TypingPayload;
        if (!p?.user_id || p.user_id === userId) return;

        setTypingUsers((prev) => {
          const exists = prev.some((u) => u.user_id === p.user_id);
          if (exists) return prev;
          return [...prev, p];
        });

        const existing = timersRef.current.get(p.user_id);
        if (existing) clearTimeout(existing);
        timersRef.current.set(
          p.user_id,
          setTimeout(() => clearTypingUser(p.user_id), 3500)
        );
      });

      ch.subscribe();
      channelRef.current = ch;
    });

    return () => {
      cancelled = true;
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current.clear();
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      setTypingUsers([]);
    };
  }, [channelName, chatId, userId, clearTypingUser]);

  useEffect(() => {
    if (!userId || !channelRef.current) return;
    const trimmed = draft.trim();
    if (!trimmed) return;

    const now = Date.now();
    if (now - lastBroadcastRef.current < 1200) return;
    lastBroadcastRef.current = now;

    void channelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { user_id: userId, display_name: displayName } satisfies TypingPayload,
    });
  }, [draft, userId, displayName]);

  const typingLabel =
    typingUsers.length === 0
      ? null
      : typingUsers.length === 1
        ? `${typingUsers[0].display_name || 'Someone'} is typing…`
        : `${typingUsers.length} people are typing…`;

  return { typingLabel };
}
