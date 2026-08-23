/** Minimum age to create a ChatReel account (COPPA-style floor). */
export const MIN_SIGNUP_AGE = 13;

export const UNDERAGE_SIGNUP_MESSAGE =
  "Sorry, ChatReel isn't available for you yet.";

/** YYYY-MM-DD → local Date at noon to avoid TZ edge cases on the date. */
export function parseDateOnly(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? '').trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d, 12, 0, 0, 0);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== mo - 1 ||
    dt.getDate() !== d
  ) {
    return null;
  }
  // Reject future birthdays
  const today = new Date();
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  if (dt.getTime() > todayOnly.getTime()) return null;
  return dt;
}

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

/**
 * Validate signup DOB. Returns ISO date-only string or an error message.
 */
export function requireSignupDateOfBirth(
  raw: unknown
): { ok: true; dateOfBirth: string } | { ok: false; error: string; status: 400 | 403 } {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { ok: false, status: 400, error: 'Birthday is required to create an account.' };
  }
  const parsed = parseDateOnly(raw);
  if (!parsed) {
    return { ok: false, status: 400, error: 'Enter a valid birthday.' };
  }
  if (!isOldEnoughToSignUp(parsed)) {
    return { ok: false, status: 403, error: UNDERAGE_SIGNUP_MESSAGE };
  }
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return { ok: true, dateOfBirth: `${y}-${m}-${d}` };
}
