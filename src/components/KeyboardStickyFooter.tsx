import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
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
 */
export function KeyboardStickyFooter({
  children,
  style,
  enabled = true,
  closedOffset,
}: Props) {
  const insets = useSafeAreaInsets();
  const closed = closedOffset ?? insets.bottom;

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
