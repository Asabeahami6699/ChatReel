import { Linking, Platform } from 'react-native';

const URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
const MENTION_REGEX = /(@[\w][\w.-]*)/g;

export type TextSegment = { type: 'text' | 'link' | 'mention'; value: string };

export function splitTextWithLinks(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let cursor = 0;
  const combined = new RegExp(
    `${URL_REGEX.source}|${MENTION_REGEX.source}`,
    'gi'
  );
  let match: RegExpExecArray | null;

  while ((match = combined.exec(text)) !== null) {
    if (match.index > cursor) {
      segments.push({ type: 'text', value: text.slice(cursor, match.index) });
    }
    const value = match[0];
    if (value.startsWith('@')) {
      segments.push({ type: 'mention', value });
    } else {
      segments.push({ type: 'link', value });
    }
    cursor = match.index + value.length;
  }

  if (cursor < text.length) {
    segments.push({ type: 'text', value: text.slice(cursor) });
  }

  return segments.length ? segments : [{ type: 'text', value: text }];
}

export async function openFileUrl(url: string): Promise<void> {
  const normalized = url.startsWith('http') ? url : `https://${url}`;
  const can = await Linking.canOpenURL(normalized);
  if (!can) throw new Error('Cannot open this file');
  await Linking.openURL(normalized);
}

export function formatLastSeen(iso?: string | null, status?: string | null): string {
  if (status === 'Online') return 'Online';
  if (!iso) return 'Offline';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'Last seen just now';
  if (diff < 3600_000) return `Last seen ${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `Last seen ${Math.floor(diff / 3600_000)}h ago`;
  return `Last seen ${d.toLocaleDateString()}`;
}

export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export const WALLPAPER_OPTIONS = [
  { id: 'default', color: '#f0f0f0', label: 'Default' },
  { id: 'mint', color: '#e8f5e9', label: 'Mint' },
  { id: 'lavender', color: '#ede7f6', label: 'Lavender' },
  { id: 'sand', color: '#fff8e1', label: 'Sand' },
  { id: 'sky', color: '#e3f2fd', label: 'Sky' },
];

export function isWithinMinutes(iso: string, minutes: number): boolean {
  return Date.now() - new Date(iso).getTime() <= minutes * 60_000;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string | undefined | null): boolean {
  return Boolean(value && UUID_RE.test(value));
}

export function buildForwardPayload(msg: {
  message_type?: string;
  content?: string;
  file_url?: string;
  file_name?: string;
  file_type?: string;
  audio_url?: string;
  audio_duration?: number;
  reel_id?: string;
  moment_id?: string;
}): Record<string, unknown> {
  const type = msg.message_type || 'text';
  const payload: Record<string, unknown> = { message_type: type };

  if (type === 'text') {
    const body = msg.content || '';
    payload.content = body.startsWith('Forwarded:') ? body : `Forwarded:\n${body}`;
  } else if (type === 'audio') {
    payload.content = 'Forwarded voice message';
    payload.audio_url = msg.audio_url?.split('?')[0];
    payload.audio_duration = msg.audio_duration;
    payload.file_name = msg.file_name;
    payload.file_type = msg.file_type;
  } else if (type === 'reel') {
    payload.content = msg.content || 'Forwarded reel';
    payload.reel_id = msg.reel_id;
  } else if (type === 'moment') {
    payload.content = msg.content || 'Forwarded moment';
    payload.moment_id = msg.moment_id;
  } else {
    payload.content = msg.file_name || msg.content || 'Forwarded file';
    payload.file_url = msg.file_url?.split('?')[0];
    payload.file_name = msg.file_name;
    payload.file_type = msg.file_type;
  }

  return payload;
}

export function formatGroupReadLabel(readCount?: number, memberCount?: number): string | null {
  if (!memberCount || memberCount <= 0) return null;
  if (!readCount) return null;
  if (readCount >= memberCount) return 'Read by all';
  return `Read by ${readCount}`;
}

export function replyPreviewText(msg: {
  message_type?: string;
  content?: string;
  file_name?: string;
}): string {
  switch (msg.message_type) {
    case 'audio':
      return 'Voice message';
    case 'image':
      return 'Photo';
    case 'video':
      return 'Video';
    case 'file':
      return msg.file_name || 'Document';
    case 'reel':
      return 'Reel';
    case 'moment':
      return 'Moment';
    default:
      return msg.content || 'Message';
  }
}
