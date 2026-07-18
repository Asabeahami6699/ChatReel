import { Platform } from 'react-native';
import { config } from './config';

/** Must match `scheme` in app.config.js */
export const INVITE_SCHEME = 'chatapp';

export function buildGroupInviteLink(token: string): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/invite/${token}`;
  }
  // Prefer HTTPS web URL so shared links open in browser / App Links
  if (config.webUrl) {
    return `${config.webUrl}/invite/${token}`;
  }
  return `${INVITE_SCHEME}://invite/${token}`;
}

/** Parse invite token from chatapp://, yourapp://, or https://…/invite/… URLs. */
export function parseInviteTokenFromUrl(url: string): string | null {
  try {
    const normalized = decodeURIComponent(url.trim());
    const match = normalized.match(/(?:^|\/)invite\/([0-9a-f]+)(?:[/?#]|$)/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function isInviteLink(url: string): boolean {
  return parseInviteTokenFromUrl(url) != null;
}
