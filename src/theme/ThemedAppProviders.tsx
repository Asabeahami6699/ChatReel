import React, { useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import { Provider as PaperProvider } from 'react-native-paper';
import { useChatSettings } from '../context/ChatSettingsContext';
import { buildPaperTheme } from './buildAppTheme';

/**
 * Paints the web document behind the React root. Without this the browser
 * keeps its white canvas, which shows through on overscroll and during the
 * gap before the bundle mounts.
 */
function useWebDocumentTheme(backgroundColor: string, isDark: boolean) {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const { documentElement, body } = document;
    documentElement.style.backgroundColor = backgroundColor;
    documentElement.style.colorScheme = isDark ? 'dark' : 'light';
    if (body) body.style.backgroundColor = backgroundColor;

    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = backgroundColor;
  }, [backgroundColor, isDark]);
}

/**
 * Applies the selected chat theme to React Native Paper globally.
 * Must sit under ChatSettingsProvider.
 */
export function ThemedPaperProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useChatSettings();
  const paperTheme = useMemo(() => buildPaperTheme(theme), [theme]);
  useWebDocumentTheme(theme.listBg, theme.isDark);
  return <PaperProvider theme={paperTheme}>{children}</PaperProvider>;
}
