import React, { useContext, useEffect, useMemo } from 'react';
import { Platform, View } from 'react-native';
import { Provider as PaperProvider } from 'react-native-paper';
import { ChatSettingsContext } from '../context/ChatSettingsContext';
import { chatThemePresets } from '../lib/chatThemes';
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

/** Sync Android system navigation chrome with the active app theme. */
function useAndroidSystemChrome(backgroundColor: string, isDark: boolean) {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let alive = true;
    void (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const NavigationBar = require('expo-navigation-bar') as {
          setBackgroundColorAsync?: (color: string) => Promise<void>;
          setButtonStyleAsync?: (style: 'light' | 'dark') => Promise<void>;
          setVisibilityAsync?: (visibility: 'visible' | 'hidden') => Promise<void>;
        };
        // Do NOT call setStyle() — on several OEMs / edge-to-edge builds it resets
        // the nav bar to a light (white) scrim after an in-app theme switch.
        await NavigationBar.setButtonStyleAsync?.(isDark ? 'light' : 'dark');
        if (!alive) return;
        await NavigationBar.setBackgroundColorAsync?.(backgroundColor);
        if (!alive) return;
        // Re-apply after a tick — Appearance theme flips can race the first paint.
        await new Promise((r) => setTimeout(r, 50));
        if (!alive) return;
        await NavigationBar.setBackgroundColorAsync?.(backgroundColor);
        await NavigationBar.setButtonStyleAsync?.(isDark ? 'light' : 'dark');
      } catch {
        /* optional native module */
      }
    })();
    return () => {
      alive = false;
    };
  }, [backgroundColor, isDark]);
}

/**
 * Applies the selected chat theme to React Native Paper globally.
 * Must sit under ChatSettingsProvider.
 */
export function ThemedPaperProvider({ children }: { children: React.ReactNode }) {
  // Optional context: Fast Refresh / duplicate module graphs can briefly mount
  // this outside the provider; fall back instead of crashing the whole app.
  const settingsCtx = useContext(ChatSettingsContext);
  const theme = settingsCtx?.theme ?? chatThemePresets.blue;
  const paperTheme = useMemo(() => buildPaperTheme(theme), [theme]);
  useWebDocumentTheme(theme.listBg, theme.isDark);
  useAndroidSystemChrome(theme.listCardBg, theme.isDark);
  return (
    <PaperProvider theme={paperTheme}>
      <View style={{ flex: 1, backgroundColor: theme.listBg }}>{children}</View>
    </PaperProvider>
  );
}
