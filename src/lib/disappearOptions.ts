/** Disappearing-message durations (timer starts when the message is read). */
export const DISAPPEAR_OPTIONS: { label: string; seconds: number | null }[] = [
  { label: 'Off', seconds: null },
  { label: '1 minute', seconds: 60 },
  { label: '30 minutes', seconds: 1800 },
  { label: '24 hours', seconds: 86400 },
  { label: '7 days', seconds: 604800 },
  { label: '30 days', seconds: 2592000 },
  { label: '90 days', seconds: 7776000 },
];

export function disappearLabel(seconds: number | null | undefined): string {
  if (!seconds) return 'Off';
  const hit = DISAPPEAR_OPTIONS.find((o) => o.seconds === seconds);
  return hit?.label ?? `${seconds}s`;
}
