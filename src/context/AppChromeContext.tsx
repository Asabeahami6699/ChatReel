import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { StatusBarStyle } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useChatSettings } from './ChatSettingsContext';

export type AppChromeState = {
  /** Top safe-area / status-bar strip color. */
  topBg: string;
  statusBarStyle: StatusBarStyle;
  /** When true, top strip is immersive (reels) — usually black. */
  immersive: boolean;
};

type AppChromeContextValue = AppChromeState & {
  setChrome: (next: Partial<AppChromeState>) => void;
  resetChrome: () => void;
};

const AppChromeContext = createContext<AppChromeContextValue | null>(null);

function defaultsFromTheme(theme: {
  listHeaderBg: string;
  isDark: boolean;
}): AppChromeState {
  return {
    topBg: theme.listHeaderBg,
    statusBarStyle: theme.isDark ? 'light-content' : 'dark-content',
    immersive: false,
  };
}

/**
 * Keeps the top safe-area strip + StatusBar readable across light/dark/night
 * and immersive surfaces (Reels).
 */
export function AppChromeProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useChatSettings();
  const base = useMemo(() => defaultsFromTheme(theme), [theme]);
  const [override, setOverride] = useState<Partial<AppChromeState> | null>(null);

  useEffect(() => {
    // Theme change: drop non-immersive overrides so base theme tokens apply.
    // Keep immersive (Reels) so light↔dark flips don't flash a light status strip.
    setOverride((prev) => (prev?.immersive ? prev : null));
  }, [theme.listHeaderBg, theme.isDark]);

  const setChrome = useCallback((next: Partial<AppChromeState>) => {
    setOverride((prev) => ({ ...(prev ?? {}), ...next }));
  }, []);

  const resetChrome = useCallback(() => {
    setOverride(null);
  }, []);

  const value = useMemo<AppChromeContextValue>(() => {
    const merged = { ...base, ...(override ?? {}) };
    return { ...merged, setChrome, resetChrome };
  }, [base, override, setChrome, resetChrome]);

  return <AppChromeContext.Provider value={value}>{children}</AppChromeContext.Provider>;
}

export function useAppChrome() {
  const ctx = useContext(AppChromeContext);
  if (!ctx) {
    // Fallback when provider missing (tests / early mount).
    return {
      topBg: '#000000',
      statusBarStyle: 'light-content' as StatusBarStyle,
      immersive: false,
      setChrome: () => undefined,
      resetChrome: () => undefined,
    };
  }
  return ctx;
}

/** Focus helper: immersive black chrome while a screen is focused. */
export function useImmersiveAppChrome(active: boolean) {
  const { setChrome, resetChrome } = useAppChrome();
  const { theme } = useChatSettings();
  useEffect(() => {
    if (!active) {
      resetChrome();
      return;
    }
    setChrome({
      topBg: '#000000',
      statusBarStyle: 'light-content',
      immersive: true,
    });
    return () => resetChrome();
    // Re-apply after theme flips so parent theme sync can't leave a light strip on Reels.
  }, [active, setChrome, resetChrome, theme.listHeaderBg, theme.isDark]);
}

/**
 * Accent headers (chat room, contact, settings, etc.): paint the shell strip
 * with the same color as the screen header and use light status icons.
 */
export function useHeaderChrome(
  topBg: string,
  statusBarStyle: StatusBarStyle = 'light-content'
) {
  const { setChrome, resetChrome } = useAppChrome();
  const isFocused = useIsFocused();
  useEffect(() => {
    if (!isFocused) return;
    setChrome({ topBg, statusBarStyle, immersive: false });
    return () => resetChrome();
  }, [isFocused, topBg, statusBarStyle, setChrome, resetChrome]);
}
