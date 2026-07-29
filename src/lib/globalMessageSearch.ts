import { getMessageDisplayText } from './messageCrypto';
import { messageStorage } from '../utils/messageStorage';

export type GlobalSearchHit = {
  key: string;
  chatId: string;
  chatType: 'individual' | 'group';
  messageId: string;
  preview: string;
  createdAt: string;
  chatName?: string;
};

export async function searchMessagesAcrossChats(
  query: string,
  opts?: { limit?: number }
): Promise<GlobalSearchHit[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const limit = opts?.limit ?? 80;
  const index = await messageStorage.getChatIndex();
  const hits: GlobalSearchHit[] = [];

  for (const row of index) {
    if (hits.length >= limit) break;
    const messages = (await messageStorage.getMessages(row.chatId)) as Array<
      Record<string, unknown>
    >;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (hits.length >= limit) break;
      const m = messages[i];
      if (!m || typeof m.id !== 'string' || m.deleted_at) continue;
      const text = getMessageDisplayText(m as Parameters<typeof getMessageDisplayText>[0]);
      const fileName = typeof m.file_name === 'string' ? m.file_name : '';
      if (!`${text} ${fileName}`.toLowerCase().includes(q)) continue;
      hits.push({
        key: `${row.chatId}:${m.id}`,
        chatId: row.chatId,
        chatType: row.chatType,
        messageId: m.id,
        preview: (text || fileName || String(m.message_type || 'message')).slice(0, 160),
        createdAt: typeof m.created_at === 'string' ? m.created_at : '',
      });
    }
  }
  hits.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return hits;
}
