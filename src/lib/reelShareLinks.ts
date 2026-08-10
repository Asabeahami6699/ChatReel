import { Platform } from 'react-native';
import { config } from './config';

const UUID_RE =
  '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/** HTTPS share link — clickable in WhatsApp, SMS, browser, etc. */
export function buildReelShareLink(reelId: string): string {
  const id = encodeURIComponent(reelId);
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/reel/${id}`;
  }
  const base = (config.webUrl || 'https://chat-reel.vercel.app').replace(/\/$/, '');
  return `${base}/reel/${id}`;
}

/** Custom-scheme fallback (installed app / QR). Prefer HTTPS for sharing. */
export function buildReelDeepLink(reelId: string): string {
  return `chatapp://reel/${encodeURIComponent(reelId)}`;
}

/** Parse reel id from chatapp://reel/… or https://…/reel/… */
export function parseReelIdFromUrl(url: string): string | null {
  try {
    const normalized = decodeURIComponent(url.trim());
    const match = normalized.match(
      new RegExp(`(?:^|[/:])reel\\/(${UUID_RE})(?:[/?#]|$)`, 'i')
    );
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function buildReelShareMessage(
  reelId: string,
  caption?: string | null
): { url: string; message: string; title: string } {
  const url = buildReelShareLink(reelId);
  const text = caption?.trim();
  return {
    title: 'Share reel',
    url,
    message: text ? `${text}\n\n${url}` : `Check out this reel on ChatReel\n\n${url}`,
  };
}
