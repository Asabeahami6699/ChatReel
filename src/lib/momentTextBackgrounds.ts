export type MomentTextBackground = {
  id: string;
  label: string;
  colors: readonly [string, string];
  darkText?: boolean;
};

export const MOMENT_TEXT_BACKGROUNDS: MomentTextBackground[] = [
  { id: 'ocean', label: 'Ocean', colors: ['#007AFF', '#5856D6'] },
  { id: 'sunset', label: 'Sunset', colors: ['#ff6b6b', '#feca57'] },
  { id: 'forest', label: 'Forest', colors: ['#11998e', '#38ef7d'] },
  { id: 'berry', label: 'Berry', colors: ['#8E2DE2', '#4A00E0'] },
  { id: 'midnight', label: 'Midnight', colors: ['#232526', '#414345'] },
  { id: 'peach', label: 'Peach', colors: ['#ffecd2', '#fcb69f'], darkText: true },
  { id: 'rose', label: 'Rose', colors: ['#f857a6', '#ff5858'] },
  { id: 'sky', label: 'Sky', colors: ['#56ccf2', '#2f80ed'] },
];

export function getTextBackground(id: string | null | undefined): MomentTextBackground {
  return MOMENT_TEXT_BACKGROUNDS.find((b) => b.id === id) ?? MOMENT_TEXT_BACKGROUNDS[0];
}
