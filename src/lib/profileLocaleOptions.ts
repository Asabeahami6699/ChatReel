import { COUNTRIES } from './countries';

export type SelectOption = { value: string; label: string };

export const COUNTRY_OPTIONS: SelectOption[] = COUNTRIES.map(({ name }) => ({
  value: name,
  label: name,
}));

export const LANGUAGE_OPTIONS: SelectOption[] = [
  { value: 'en', label: 'English' },
  { value: 'en-NG', label: 'English (Nigeria)' },
  { value: 'en-GH', label: 'English (Ghana)' },
  { value: 'en-KE', label: 'English (Kenya)' },
  { value: 'en-ZA', label: 'English (South Africa)' },
  { value: 'tw', label: 'Twi' },
  { value: 'fr', label: 'French' },
  { value: 'sw', label: 'Swahili' },
  { value: 'ha', label: 'Hausa' },
  { value: 'yo', label: 'Yoruba' },
  { value: 'ig', label: 'Igbo' },
  { value: 'af', label: 'Afrikaans' },
  { value: 'zu', label: 'Zulu' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ar', label: 'Arabic' },
];

const COUNTRY_ALIASES: Record<string, string> = Object.fromEntries(
  COUNTRIES.flatMap(({ code, name }) => [
    [code.toLowerCase(), name],
    [name.toLowerCase(), name],
    ...(name === 'United States'
      ? ([
          ['us', name],
          ['usa', name],
          ['u.s.', name],
          ['u.s.a.', name],
        ] as const)
      : []),
    ...(name === 'United Kingdom'
      ? ([
          ['uk', name],
          ['u.k.', name],
          ['great britain', name],
        ] as const)
      : []),
    ...(name === 'Ivory Coast' ? ([['cote d\'ivoire', name], ['côte d\'ivoire', name]] as const) : []),
    ...(name === 'Czechia' ? ([['czech republic', name]] as const) : []),
    ...(name === 'Democratic Republic of the Congo'
      ? ([['drc', name], ['dr congo', name]] as const)
      : []),
  ])
);

/** Map stored profile country text to a dropdown value when possible. */
export function normalizeCountryValue(input?: string | null): string {
  if (!input?.trim()) return '';
  const trimmed = input.trim();
  const known = COUNTRY_OPTIONS.find(
    (opt) => opt.value.toLowerCase() === trimmed.toLowerCase()
  );
  if (known) return known.value;
  const alias = COUNTRY_ALIASES[trimmed.toLowerCase()];
  return alias ?? trimmed;
}

/** Map stored profile language text to a dropdown value when possible. */
export function normalizeLanguageValue(input?: string | null): string {
  if (!input?.trim()) return '';
  const trimmed = input.trim();
  const known = LANGUAGE_OPTIONS.find(
    (opt) =>
      opt.value.toLowerCase() === trimmed.toLowerCase() ||
      opt.label.toLowerCase() === trimmed.toLowerCase()
  );
  return known?.value ?? trimmed;
}

export function labelForOption(options: SelectOption[], value: string): string {
  if (!value) return '';
  return options.find((opt) => opt.value === value)?.label ?? value;
}

export function optionsWithCurrentValue(
  options: SelectOption[],
  value: string
): SelectOption[] {
  if (!value || options.some((opt) => opt.value === value)) return options;
  return [{ value, label: value }, ...options];
}
