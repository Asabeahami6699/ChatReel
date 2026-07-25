import React, { useMemo } from 'react';
import { Provider as PaperProvider } from 'react-native-paper';
import { useChatSettings } from '../context/ChatSettingsContext';
import { buildPaperTheme } from './buildAppTheme';

/**
 * Applies the selected chat theme to React Native Paper globally.
 * Must sit under ChatSettingsProvider.
 */
export function ThemedPaperProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useChatSettings();
  const paperTheme = useMemo(() => buildPaperTheme(theme), [theme]);
  return <PaperProvider theme={paperTheme}>{children}</PaperProvider>;
}
