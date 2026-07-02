import { api, type ReelDTO } from './api';

export type ReelChatTarget =
  | { chatType: 'individual'; chatId: string; chatName: string; avatarUrl?: string }
  | { chatType: 'group'; chatId: string; chatName: string; avatarUrl?: string };

export async function sendReelToChat(reel: ReelDTO, target: ReelChatTarget, note?: string) {
  const caption = reel.caption?.trim();
  const content = note?.trim() || caption || 'Shared a reel';

  await api.messages.send({
    message_type: 'reel',
    content,
    reel_id: reel.id,
    file_url: reel.thumbnail_url ?? reel.video_url,
    receiver_id: target.chatType === 'individual' ? target.chatId : undefined,
    group_id: target.chatType === 'group' ? target.chatId : undefined,
    plaintext: true,
  });
}
