/**
 * Normalize phone numbers to E.164 for unique identity.
 * Default country code is configurable (AUTH_DEFAULT_COUNTRY_CODE / EXPO_PUBLIC_DEFAULT_COUNTRY_CODE).
 */

const E164_RE = /^\+[1-9][0-9]{7,14}$/;

export function isE164Phone(phone: string): boolean {
  return E164_RE.test(phone);
}

/**
 * Convert user input to E.164.
 * Accepts: +2348012345678, 08012345678 (with default country), 2348012345678
 */
export function normalizePhoneToE164(
  input: string,
  defaultCountryCode = '+234'
): string | null {
  const raw = input.trim().replace(/[\s\-().]/g, '');
  if (!raw) return null;

  let digits: string;
  let country = defaultCountryCode.startsWith('+')
    ? defaultCountryCode
    : `+${defaultCountryCode}`;

  if (raw.startsWith('+')) {
    digits = raw.slice(1).replace(/\D/g, '');
    const candidate = `+${digits}`;
    return isE164Phone(candidate) ? candidate : null;
  }

  digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  // Local leading 0 → drop and prepend default country (e.g. 0801… → +234801…)
  const countryDigits = country.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length >= 10) {
    digits = digits.slice(1);
  } else if (digits.startsWith(countryDigits)) {
    // Already includes country digits without +
    const candidate = `+${digits}`;
    return isE164Phone(candidate) ? candidate : null;
  }

  const candidate = `+${countryDigits}${digits}`;
  return isE164Phone(candidate) ? candidate : null;
}

export function maskPhone(phone: string): string {
  if (!isE164Phone(phone)) return phone;
  const keepStart = Math.min(5, phone.length - 4);
  return `${phone.slice(0, keepStart)}${'•'.repeat(Math.max(0, phone.length - keepStart - 2))}${phone.slice(-2)}`;
}
