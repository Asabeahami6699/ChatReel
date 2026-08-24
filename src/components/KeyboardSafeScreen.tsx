import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewProps,
} from 'react-native-keyboard-controller';

type Props = {
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  bottomOffset?: number;
} & Pick<
  KeyboardAwareScrollViewProps,
  'keyboardShouldPersistTaps' | 'showsVerticalScrollIndicator' | 'bounces'
>;

/**
 * Scrollable screen that keeps focused TextInputs above the keyboard (auth, profile, settings).
 */
export function KeyboardSafeScreen({
  children,
  contentContainerStyle,
  style,
  bottomOffset = 24,
  keyboardShouldPersistTaps = 'handled',
  showsVerticalScrollIndicator = false,
  bounces = false,
}: Props) {
  return (
    <KeyboardAwareScrollView
      style={[{ flex: 1 }, style]}
      contentContainerStyle={[{ flexGrow: 1 }, contentContainerStyle]}
      bottomOffset={bottomOffset}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      bounces={bounces}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}
