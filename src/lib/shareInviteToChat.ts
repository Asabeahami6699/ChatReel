import { api } from './api';
import type { ReelChatTarget } from './shareReelToChat';

export async function sendInviteToChat(
  inviteLink: string,
  groupName: string,
  target: ReelChatTarget,
  note?: string
) {
  const prefix = note?.trim() || `Join my group "${groupName}"`;
  const content = `${prefix}\n${inviteLink}`;

  await api.messages.send({
    message_type: 'text',
    content,
    receiver_id: target.chatType === 'individual' ? target.chatId : undefined,
    group_id: target.chatType === 'group' ? target.chatId : undefined,
    plaintext: true,
  });
}
