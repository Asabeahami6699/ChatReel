import {
  DarkTheme as NavDarkTheme,
  DefaultTheme as NavDefaultTheme,
  type Theme as NavigationTheme,
} from '@react-navigation/native';
import {
  MD3DarkTheme,
  MD3LightTheme,
  type MD3Theme,
} from 'react-native-paper';
import type { ChatThemeTokens } from '../lib/chatThemes';

/** React Navigation theme — drives default screen/card backgrounds app-wide. */
export function buildNavigationTheme(theme: ChatThemeTokens): NavigationTheme {
  const base = theme.isDark ? NavDarkTheme : NavDefaultTheme;
  return {
    ...base,
    dark: theme.isDark,
    colors: {
      ...base.colors,
      primary: theme.primary,
      background: theme.listBg,
      card: theme.listCardBg,
      text: theme.listPrimaryText,
      border: theme.listBorder,
      notification: theme.primary,
    },
  };
}

/** React Native Paper theme — FAB, TextInput, IconButton, Snackbar, etc. */
export function buildPaperTheme(theme: ChatThemeTokens): MD3Theme {
  const base = theme.isDark ? MD3DarkTheme : MD3LightTheme;
  return {
    ...base,
    dark: theme.isDark,
    colors: {
      ...base.colors,
      primary: theme.primary,
      secondary: theme.accent,
      background: theme.listBg,
      surface: theme.listCardBg,
      surfaceVariant: theme.isDark ? '#111111' : '#f1f5f9',
      onSurface: theme.listPrimaryText,
      onBackground: theme.listPrimaryText,
      onSurfaceVariant: theme.listSecondaryText,
      outline: theme.listBorder,
      elevation: {
        ...base.colors.elevation,
        level0: theme.listBg,
        level1: theme.listCardBg,
        level2: theme.isDark ? '#111111' : '#ffffff',
        level3: theme.isDark ? '#161616' : '#ffffff',
        level4: theme.isDark ? '#1a1a1a' : '#ffffff',
        level5: theme.isDark ? '#1f1f1f' : '#ffffff',
      },
    },
  };
}
