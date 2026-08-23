/** Minimum age to create a ChatReel account (COPPA-style floor). */
export const MIN_SIGNUP_AGE = 13;

/** YYYY-MM-DD */
export function toDateOnlyString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDateOnly(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== mo - 1 ||
    dt.getDate() !== d
  ) {
    return null;
  }
  return dt;
}

/** Age in whole years as of `now` (local calendar). */
export function ageFromDateOfBirth(dob: Date, now = new Date()): number {
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}

export function isOldEnoughToSignUp(dob: Date | string, now = new Date()): boolean {
  const date = typeof dob === 'string' ? parseDateOnly(dob) : dob;
  if (!date) return false;
  return ageFromDateOfBirth(date, now) >= MIN_SIGNUP_AGE;
}

/** Sensible default for the birthday picker (~18 years ago). */
export function defaultBirthdayPickerDate(now = new Date()): Date {
  return new Date(now.getFullYear() - 18, now.getMonth(), now.getDate());
}

export function maxBirthdayPickerDate(now = new Date()): Date {
  return now;
}

export function minBirthdayPickerDate(now = new Date()): Date {
  return new Date(now.getFullYear() - 120, 0, 1);
}

export const UNDERAGE_SIGNUP_MESSAGE =
  "Sorry, ChatReel isn't available for you yet.";
