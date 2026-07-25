/** Chat list / room colour presets. */
export type ChatThemeId = 'blue' | 'dark' | 'night' | 'teal' | 'classic';

export type ChatThemeTokens = {
  id: ChatThemeId;
  label: string;
  isDark: boolean;
  /** Chat list top bar — neutral surface, not the accent header colour. */
  listHeaderBg: string;
  listHeaderText: string;
  listBorder: string;
  listBg: string;
  listPrimaryText: string;
  listSecondaryText: string;
  listCardBg: string;
  sectionLabel: string;
  searchBg: string;
  searchText: string;
  searchPlaceholder: string;
  /** Chat room header */
  headerBg: string;
  headerText: string;
  headerStatus: string;
  chatBg: string;
  primary: string;
  accent: string;
  tabActive: string;
  tabInactive: string;
  outgoingBubble: string;
  incomingBubble: string;
  outgoingText: string;
  incomingText: string;
  outgoingMeta: string;
  incomingMeta: string;
  readReceipt: string;
  inputBarBg: string;
  inputFieldBg: string;
  composerBorder: string;
  scrollFabBg: string;
  senderName: string;
  link: string;
  datePillBg: string;
  datePillText: string;
};

const lightList = {
  listHeaderBg: '#f8f9fa',
  listHeaderText: '#1a1a1a',
  listBorder: '#e9ecef',
  listBg: '#FFFFFF',
  listPrimaryText: '#1a1a1a',
  listSecondaryText: '#6b7280',
  listCardBg: '#FFFFFF',
  sectionLabel: '#64748b',
  searchBg: '#FFFFFF',
  searchText: '#111111',
  searchPlaceholder: '#666666',
  tabInactive: '#6b7280',
  datePillBg: 'rgba(255, 255, 255, 0.95)',
  datePillText: '#666666',
  inputBarBg: '#f0f0f0',
  inputFieldBg: '#FFFFFF',
  composerBorder: '#e0e0e0',
  scrollFabBg: '#FFFFFF',
  outgoingText: '#FFFFFF',
  incomingText: '#111111',
  outgoingMeta: 'rgba(255, 255, 255, 0.75)',
  incomingMeta: 'rgba(0, 0, 0, 0.45)',
  readReceipt: '#34B7F1',
};

const darkList = {
  listHeaderBg: '#000000',
  listHeaderText: '#FFFFFF',
  listBorder: '#2a2a2a',
  listBg: '#000000',
  listPrimaryText: '#FFFFFF',
  listSecondaryText: '#E5E7EB',
  listCardBg: '#000000',
  sectionLabel: '#E5E7EB',
  searchBg: '#111111',
  searchText: '#FFFFFF',
  searchPlaceholder: '#9ca3af',
  tabInactive: '#9ca3af',
  datePillBg: 'rgba(40, 40, 40, 0.95)',
  datePillText: '#d1d5db',
  inputBarBg: '#111111',
  inputFieldBg: '#1a1a1a',
  composerBorder: '#333333',
  scrollFabBg: '#1a1a1a',
  outgoingText: '#FFFFFF',
  incomingText: '#f3f4f6',
  outgoingMeta: 'rgba(255, 255, 255, 0.7)',
  incomingMeta: 'rgba(255, 255, 255, 0.45)',
  readReceipt: '#60a5fa',
};

/** Night = dark mode behaviour with a deep navy / indigo cast. */
const nightList = {
  listHeaderBg: '#05070f',
  listHeaderText: '#F8FAFC',
  listBorder: '#1e293b',
  listBg: '#05070f',
  listPrimaryText: '#F8FAFC',
  listSecondaryText: '#CBD5E1',
  listCardBg: '#0a0e1a',
  sectionLabel: '#94A3B8',
  searchBg: '#0f172a',
  searchText: '#F8FAFC',
  searchPlaceholder: '#64748b',
  tabInactive: '#94A3B8',
  datePillBg: 'rgba(15, 23, 42, 0.95)',
  datePillText: '#cbd5e1',
  inputBarBg: '#0f172a',
  inputFieldBg: '#1e293b',
  composerBorder: '#334155',
  scrollFabBg: '#1e293b',
  outgoingText: '#FFFFFF',
  incomingText: '#e2e8f0',
  outgoingMeta: 'rgba(255, 255, 255, 0.7)',
  incomingMeta: 'rgba(226, 232, 240, 0.5)',
  readReceipt: '#a5b4fc',
};

export const chatThemePresets: Record<ChatThemeId, ChatThemeTokens> = {
  blue: {
    id: 'blue',
    label: 'ChatReel Blue',
    isDark: false,
    ...lightList,
    headerBg: '#007AFF',
    headerText: '#FFFFFF',
    headerStatus: 'rgba(255, 255, 255, 0.85)',
    chatBg: '#f0f0f0',
    primary: '#007AFF',
    accent: '#1c6dfd',
    tabActive: '#007AFF',
    outgoingBubble: '#007AFF',
    incomingBubble: '#FFFFFF',
    senderName: '#007AFF',
    link: '#007AFF',
  },
  dark: {
    id: 'dark',
    label: 'Dark',
    isDark: true,
    ...darkList,
    headerBg: '#1a1a1a',
    headerText: '#FFFFFF',
    headerStatus: 'rgba(255, 255, 255, 0.7)',
    chatBg: '#0f0f0f',
    primary: '#60a5fa',
    accent: '#3b82f6',
    tabActive: '#60a5fa',
    outgoingBubble: '#2563eb',
    incomingBubble: '#000000',
    senderName: '#60a5fa',
    link: '#60a5fa',
  },
  night: {
    id: 'night',
    label: 'Night',
    isDark: true,
    ...nightList,
    headerBg: '#0b1220',
    headerText: '#F8FAFC',
    headerStatus: 'rgba(248, 250, 252, 0.7)',
    chatBg: '#070b14',
    primary: '#818cf8',
    accent: '#6366f1',
    tabActive: '#818cf8',
    outgoingBubble: '#4338ca',
    incomingBubble: '#0f172a',
    senderName: '#a5b4fc',
    link: '#a5b4fc',
  },
  teal: {
    id: 'teal',
    label: 'Teal',
    isDark: false,
    ...lightList,
    headerBg: '#0d9488',
    headerText: '#FFFFFF',
    headerStatus: 'rgba(255, 255, 255, 0.85)',
    chatBg: '#ecfdf5',
    primary: '#0d9488',
    accent: '#14b8a6',
    tabActive: '#0d9488',
    outgoingBubble: '#0d9488',
    incomingBubble: '#FFFFFF',
    senderName: '#0d9488',
    link: '#0d9488',
  },
  classic: {
    id: 'classic',
    label: 'Classic Green',
    isDark: false,
    ...lightList,
    headerBg: '#075E54',
    headerText: '#FFFFFF',
    headerStatus: 'rgba(255, 255, 255, 0.85)',
    chatBg: '#ECE5DD',
    primary: '#128C7E',
    accent: '#25D366',
    tabActive: '#128C7E',
    outgoingBubble: '#DCF8C6',
    incomingBubble: '#FFFFFF',
    senderName: '#128C7E',
    link: '#128C7E',
    outgoingText: '#111111',
    outgoingMeta: 'rgba(0, 0, 0, 0.45)',
  },
};

export function isChatThemeId(value: unknown): value is ChatThemeId {
  return typeof value === 'string' && value in chatThemePresets;
}
