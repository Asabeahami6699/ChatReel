/** ISO 3166-1 alpha-2 country codes supported for coin packages. */
export type SupportedCountryCode = 'NG' | 'GH' | 'KE' | 'ZA';

export type PaymentProvider = 'paystack' | 'stripe';

const COUNTRY_NAME_TO_CODE: Record<string, SupportedCountryCode> = {
  ghana: 'GH',
  nigeria: 'NG',
  kenya: 'KE',
  'south africa': 'ZA',
};

const PAYSTACK_COUNTRIES = new Set<SupportedCountryCode>(['NG', 'GH', 'KE', 'ZA']);

const DEFAULT_COUNTRY: SupportedCountryCode = 'NG';

const LOCALE_BY_COUNTRY: Record<string, string> = {
  NG: 'en-NG',
  GH: 'en-GH',
  KE: 'en-KE',
  ZA: 'en-ZA',
};

const CURRENCY_BY_COUNTRY: Record<SupportedCountryCode, string> = {
  NG: 'NGN',
  GH: 'GHS',
  KE: 'KES',
  ZA: 'ZAR',
};

/** Normalize free-text profile country to a 2-letter code when possible. */
export function normalizeCountryCode(input?: string | null): SupportedCountryCode | null {
  if (!input?.trim()) return null;
  const trimmed = input.trim();
  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    return trimmed.toUpperCase() as SupportedCountryCode;
  }
  return COUNTRY_NAME_TO_CODE[trimmed.toLowerCase()] ?? null;
}

export function resolveCountryCode(input?: string | null): SupportedCountryCode {
  return normalizeCountryCode(input) ?? DEFAULT_COUNTRY;
}

export function localeForCountry(countryCode: string): string {
  return LOCALE_BY_COUNTRY[countryCode.toUpperCase()] ?? 'en';
}

/** Default fiat currency for a country when no packages exist yet. */
export function currencyForCountry(countryCode: string): string {
  const code = countryCode.toUpperCase() as SupportedCountryCode;
  return CURRENCY_BY_COUNTRY[code] ?? CURRENCY_BY_COUNTRY[DEFAULT_COUNTRY];
}

/** Pick payment provider from country. Stripe is reserved for future international support. */
export function paymentProviderForCountry(countryCode: string): PaymentProvider {
  const code = countryCode.toUpperCase();
  if (PAYSTACK_COUNTRIES.has(code as SupportedCountryCode)) {
    return 'paystack';
  }
  return 'stripe';
}

export { DEFAULT_COUNTRY, PAYSTACK_COUNTRIES };
