export type ChatReminderStatus = 'pending' | 'fired' | 'done' | 'cancelled';

export type ChatReminder = {
  id: string;
  chat_id: string;
  chat_type: 'individual' | 'group';
  message_id: string | null;
  remind_at: string;
  note: string | null;
  preview_text: string | null;
  chat_name: string | null;
  status: ChatReminderStatus;
  fired_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ReminderUrgency = 'scheduled' | 'soon' | 'due';

const SOON_MS = 3 * 60 * 60 * 1000;

export function reminderUrgency(remindAt: string, now = Date.now()): ReminderUrgency {
  const t = new Date(remindAt).getTime();
  if (Number.isNaN(t) || t <= now) return 'due';
  if (t - now <= SOON_MS) return 'soon';
  return 'scheduled';
}

/** Compact label for chat list / notification UI. */
export function formatReminderWhen(remindAt: string, now = Date.now()): string {
  const t = new Date(remindAt).getTime();
  if (Number.isNaN(t)) return 'Reminder';
  const diff = t - now;
  if (diff <= 0) return 'Due now';

  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `In ${Math.max(1, mins)}m`;

  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) {
    return remMins > 0 ? `In ${hours}h ${remMins}m` : `In ${hours}h`;
  }

  const d = new Date(t);
  const today = new Date(now);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const isTomorrow =
    d.getFullYear() === tomorrow.getFullYear() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getDate() === tomorrow.getDate();

  const timeStr = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  if (sameDay) return `Today · ${timeStr}`;
  if (isTomorrow) return `Tomorrow · ${timeStr}`;

  return (
    d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }) + ` · ${timeStr}`
  );
}

export function urgencyColor(urgency: ReminderUrgency, isDark: boolean): string {
  if (urgency === 'due') return '#E53935';
  if (urgency === 'soon') return '#F9A825';
  return isDark ? '#64B5F6' : '#1565C0';
}

/** Next reminder for a chat (soonest pending/fired). */
export function pickChatReminder(
  reminders: ChatReminder[],
  chatType: 'individual' | 'group',
  chatId: string
): ChatReminder | undefined {
  const matches = reminders.filter(
    (r) =>
      r.chat_type === chatType &&
      r.chat_id === chatId &&
      (r.status === 'pending' || r.status === 'fired')
  );
  if (!matches.length) return undefined;
  return matches.slice().sort((a, b) => a.remind_at.localeCompare(b.remind_at))[0];
}

function atLocalHour(base: Date, hour: number, minute = 0): Date {
  const d = new Date(base);
  d.setHours(hour, minute, 0, 0);
  return d;
}

export type ReminderPreset = {
  key: string;
  label: string;
  hint?: string;
  resolve: () => Date;
};

export function buildReminderPresets(now = new Date()): ReminderPreset[] {
  const tonight = atLocalHour(now, 20, 0);
  if (tonight.getTime() <= now.getTime() + 5 * 60_000) {
    tonight.setDate(tonight.getDate() + 1);
  }

  const tomorrowMorning = atLocalHour(now, 9, 0);
  tomorrowMorning.setDate(tomorrowMorning.getDate() + 1);

  return [
    {
      key: '30m',
      label: 'In 30 minutes',
      resolve: () => new Date(now.getTime() + 30 * 60_000),
    },
    {
      key: '1h',
      label: 'In 1 hour',
      resolve: () => new Date(now.getTime() + 60 * 60_000),
    },
    {
      key: '3h',
      label: 'In 3 hours',
      resolve: () => new Date(now.getTime() + 3 * 60 * 60_000),
    },
    {
      key: 'tonight',
      label: 'Tonight',
      hint: tonight.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
      resolve: () => tonight,
    },
    {
      key: 'tomorrow_9',
      label: 'Tomorrow at 9:00 AM',
      resolve: () => tomorrowMorning,
    },
  ];
}
