import React, { useEffect, useState } from 'react';
import { Keyboard, Platform, StyleProp, View, ViewStyle } from 'react-native';
import {
  AndroidSoftInputModes,
  KeyboardController,
  KeyboardStickyView,
} from 'react-native-keyboard-controller';
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
 * Android: force ADJUST_NOTHING while mounted so window-resize cannot fight the lift,
 * then pin with KeyboardStickyView. Relying on `softwareKeyboardLayoutMode: 'resize'`
 * alone fails on many physical devices (edge-to-edge / translucent system bars).
 */
export function KeyboardStickyFooter({
  children,
  style,
  enabled = true,
  closedOffset,
}: Props) {
  const insets = useSafeAreaInsets();
  const closed = closedOffset ?? insets.bottom;
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    KeyboardController.setInputMode(AndroidSoftInputModes.SOFT_INPUT_ADJUST_NOTHING);
    return () => {
      KeyboardController.setDefaultMode();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, () => setKeyboardOpen(true));
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardOpen(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  if (Platform.OS === 'web') {
    return <View style={[{ paddingBottom: closed }, style]}>{children}</View>;
  }

  return (
    <KeyboardStickyView
      enabled={enabled}
      offset={{ closed: 0, opened: 0 }}
      style={[{ paddingBottom: keyboardOpen ? 0 : closed }, style]}
    >
      {children}
    </KeyboardStickyView>
  );
}
