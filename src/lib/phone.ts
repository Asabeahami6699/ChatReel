/**
 * Normalize phone numbers to E.164 for unique identity (client-side mirror).
 */

const E164_RE = /^\+[1-9][0-9]{7,14}$/;

export function isE164Phone(phone: string): boolean {
  return E164_RE.test(phone);
}

export function normalizePhoneToE164(
  input: string,
  defaultCountryCode = '+234'
): string | null {
  const raw = input.trim().replace(/[\s\-().]/g, '');
  if (!raw) return null;

  let digits: string;
  const country = defaultCountryCode.startsWith('+')
    ? defaultCountryCode
    : `+${defaultCountryCode}`;

  if (raw.startsWith('+')) {
    digits = raw.slice(1).replace(/\D/g, '');
    const candidate = `+${digits}`;
    return isE164Phone(candidate) ? candidate : null;
  }

  digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  const countryDigits = country.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length >= 10) {
    digits = digits.slice(1);
  } else if (digits.startsWith(countryDigits)) {
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
