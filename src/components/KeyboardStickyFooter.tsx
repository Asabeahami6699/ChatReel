import React from 'react';
import { Platform, StyleProp, View, ViewStyle } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  enabled?: boolean;
  /** Extra offset when keyboard is closed (defaults to home-indicator inset). */
  closedOffset?: number;
};

/**
 * Pins a composer / toolbar to the top of the keyboard (chat input, comment bar, etc.).
 *
 * On Android the app uses `softwareKeyboardLayoutMode: 'resize'` + `useResizeMode()`,
 * so the window already shrinks with the keyboard. Applying KeyboardStickyView on top
 * of that can translate the composer off-screen (input “missing” on device builds).
 */
export function KeyboardStickyFooter({
  children,
  style,
  enabled = true,
  closedOffset,
}: Props) {
  const insets = useSafeAreaInsets();
  const closed = closedOffset ?? insets.bottom;

  if (Platform.OS === 'android' || Platform.OS === 'web') {
    return <View style={[{ paddingBottom: closed }, style]}>{children}</View>;
  }

  return (
    <KeyboardStickyView
      enabled={enabled}
      offset={{ closed, opened: 0 }}
      style={style}
    >
      {children}
    </KeyboardStickyView>
  );
}
