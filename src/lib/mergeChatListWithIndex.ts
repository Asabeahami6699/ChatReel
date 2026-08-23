import type { ChatIndexRow } from '../utils/messageStorage';
import { withoutGhostSelfChats } from './chatListSanitize';

/** Apply local chat_index previews/unread onto a profile-bearing chat list. */
export function mergeIndividualChatsWithIndex<
  T extends {
    user_id: string;
    name: string;
    avatar_url?: string;
    last_message?: string;
    last_message_at?: string;
    unread_count?: number;
    last_message_type?: string;
  },
>(chats: T[], index: ChatIndexRow[], myUserId?: string | null): T[] {
  const safeChats = withoutGhostSelfChats(chats, myUserId);
  const indexById = new Map(
    index
      .filter((r) => r.chatType === 'individual' && r.chatId !== myUserId)
      .map((r) => [r.chatId, r])
  );
  const chatById = new Map(safeChats.map((c) => [c.user_id, c]));
  const ids = new Set<string>([...chatById.keys(), ...indexById.keys()]);
  const rows: T[] = [];

  for (const id of ids) {
    const base = chatById.get(id);
    const idx = indexById.get(id);
    if (!base && !idx) continue;
    if (!base && idx) {
      // Index-only orphans (no server/profile row) used to appear as a fake
      // contact named "Chat". Groups already skip these — do the same here.
      // Cached API/storage rows above still cover real offline threads.
      continue;
    }
    if (base && !idx) {
      rows.push(base);
      continue;
    }
    const indexNewer =
      !base!.last_message_at ||
      String(idx!.lastMessageAt) >= String(base!.last_message_at);
    rows.push({
      ...base!,
      last_message: indexNewer
        ? idx!.lastMessagePreview || base!.last_message
        : base!.last_message,
      last_message_at: indexNewer ? idx!.lastMessageAt : base!.last_message_at,
      last_message_type: indexNewer
        ? idx!.lastMessageType ?? base!.last_message_type
        : base!.last_message_type,
      unread_count: idx!.unreadCount,
    });
  }

  rows.sort((a, b) =>
    String(b.last_message_at ?? '').localeCompare(String(a.last_message_at ?? ''))
  );
  return rows;
}

export function mergeGroupsWithIndex<
  T extends {
    id: string;
    name: string;
    avatar_url?: string | null;
    last_message?: string | null;
    last_message_at?: string | null;
    unread_count: number;
    last_message_type?: string | null;
  },
>(groups: T[], index: ChatIndexRow[]): T[] {
  const indexById = new Map(
    index.filter((r) => r.chatType === 'group').map((r) => [r.chatId, r])
  );
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const ids = new Set<string>([...groupById.keys(), ...indexById.keys()]);
  const rows: T[] = [];

  for (const id of ids) {
    const base = groupById.get(id);
    const idx = indexById.get(id);
    if (!base && !idx) continue;
    if (!base && idx) {
      // Unknown group metadata — keep out of list until server returns it.
      continue;
    }
    if (base && !idx) {
      rows.push(base);
      continue;
    }
    const indexNewer =
      !base!.last_message_at ||
      String(idx!.lastMessageAt) >= String(base!.last_message_at ?? '');
    rows.push({
      ...base!,
      last_message: indexNewer
        ? idx!.lastMessagePreview || base!.last_message
        : base!.last_message,
      last_message_at: indexNewer ? idx!.lastMessageAt : base!.last_message_at,
      last_message_type: indexNewer
        ? idx!.lastMessageType ?? base!.last_message_type
        : base!.last_message_type,
      unread_count: idx!.unreadCount,
    });
  }

  rows.sort((a, b) =>
    String(b.last_message_at ?? '').localeCompare(String(a.last_message_at ?? ''))
  );
  return rows;
}
