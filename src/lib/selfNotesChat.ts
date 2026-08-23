import type { IndividualChat } from '../hooks/useIndividualChats';

export const SELF_NOTES_CHAT_NAME = 'Message yourself';

export function isSelfNotesChat(
  chatId: string | undefined | null,
  myUserId: string | undefined | null
): boolean {
  return Boolean(chatId && myUserId && chatId === myUserId);
}

/** WhatsApp-style "Message yourself" row — pinned at top of the chat list. */
export function buildSelfNotesChatRow(
  myUserId: string,
  opts?: {
    avatar_url?: string | null;
    last_message?: string | null;
    last_message_at?: string | null;
    unread_count?: number;
  }
): IndividualChat {
  return {
    id: myUserId,
    user_id: myUserId,
    name: SELF_NOTES_CHAT_NAME,
    avatar_url: opts?.avatar_url ?? undefined,
    is_self_notes: true,
    last_message: opts?.last_message ?? 'Save notes, links, and to-dos',
    last_message_at: opts?.last_message_at ?? undefined,
    unread_count: opts?.unread_count ?? 0,
  };
}

/** Keep intentional self-notes rows; drop orphan ghosts missing the flag. */
export function withoutGhostSelfChats<T extends { user_id: string; is_self_notes?: boolean }>(
  chats: T[],
  myUserId: string | undefined | null
): T[] {
  if (!myUserId) return chats;
  return chats.filter((c) => c.user_id !== myUserId || c.is_self_notes === true);
}

export function prependSelfNotesChat(
  chats: IndividualChat[],
  myUserId: string | undefined | null,
  selfRow?: IndividualChat | null
): IndividualChat[] {
  if (!myUserId || !selfRow) return chats;
  const rest = withoutGhostSelfChats(chats, myUserId).filter((c) => c.user_id !== myUserId);
  return [selfRow, ...rest];
}
