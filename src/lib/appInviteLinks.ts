import { config } from './config';

/** Public HTTPS landing page — clickable in WhatsApp, SMS, etc. */
export function buildAppInviteLink(opts?: { fromUserId?: string | null }): string {
  const base = (config.webUrl || 'https://chat-reel.vercel.app').replace(/\/$/, '');
  if (opts?.fromUserId) {
    return `${base}/?ref=${encodeURIComponent(opts.fromUserId)}`;
  }
  return base;
}

/** Share text with the URL on its own line so messengers auto-link it. */
export function buildAppInviteShareMessage(opts?: {
  fromName?: string | null;
  fromUserId?: string | null;
}): { message: string; url: string; title: string } {
  const url = buildAppInviteLink({ fromUserId: opts?.fromUserId });
  const who = opts?.fromName?.trim();
  const intro = who
    ? `${who} invited you to ChatReel`
    : 'Join me on ChatReel';

  return {
    title: 'Invite to ChatReel',
    url,
    // URL must appear in `message` for Android/WhatsApp to make it tappable.
    message: `${intro}\nChat, calls, moments and reels — all in one app.\n\n${url}`,
  };
}
