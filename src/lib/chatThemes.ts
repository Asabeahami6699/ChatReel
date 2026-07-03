/** Chat list / room colour presets. */
export type ChatThemeId = 'blue' | 'dark' | 'teal' | 'classic';

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
  listHeaderBg: '#121212',
  listHeaderText: '#FFFFFF',
  listBorder: '#2a2a2a',
  listBg: '#121212',
  listPrimaryText: '#FFFFFF',
  listSecondaryText: '#9ca3af',
  listCardBg: '#1e1e1e',
  sectionLabel: '#9ca3af',
  searchBg: '#262626',
  searchText: '#FFFFFF',
  searchPlaceholder: '#9ca3af',
  tabInactive: '#9ca3af',
  datePillBg: 'rgba(40, 40, 40, 0.95)',
  datePillText: '#d1d5db',
  inputBarBg: '#1a1a1a',
  inputFieldBg: '#262626',
  composerBorder: '#333333',
  scrollFabBg: '#262626',
  outgoingText: '#FFFFFF',
  incomingText: '#f3f4f6',
  outgoingMeta: 'rgba(255, 255, 255, 0.7)',
  incomingMeta: 'rgba(255, 255, 255, 0.45)',
  readReceipt: '#60a5fa',
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
    incomingBubble: '#262626',
    senderName: '#60a5fa',
    link: '#60a5fa',
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
