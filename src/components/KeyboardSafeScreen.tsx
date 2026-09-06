import React, { useMemo } from 'react';
import { StyleProp, StyleSheet, ViewStyle } from 'react-native';
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

/** Layout props that must live on contentContainerStyle for ScrollView (RN web invariant). */
const CONTENT_ONLY_KEYS = new Set([
  'justifyContent',
  'alignItems',
  'alignContent',
  'flexDirection',
  'flexWrap',
  'gap',
  'rowGap',
  'columnGap',
]);

function splitScrollStyles(style: StyleProp<ViewStyle> | undefined): {
  outer: ViewStyle;
  content: ViewStyle;
} {
  const flat = StyleSheet.flatten(style) || {};
  const outer: ViewStyle = {};
  const content: ViewStyle = {};
  for (const [key, value] of Object.entries(flat)) {
    if (value === undefined) continue;
    if (CONTENT_ONLY_KEYS.has(key)) {
      (content as Record<string, unknown>)[key] = value;
    } else {
      (outer as Record<string, unknown>)[key] = value;
    }
  }
  return { outer, content };
}

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
  const { outer, content } = useMemo(() => splitScrollStyles(style), [style]);

  return (
    <KeyboardAwareScrollView
      style={[{ flex: 1 }, outer]}
      contentContainerStyle={[{ flexGrow: 1 }, content, contentContainerStyle]}
      bottomOffset={bottomOffset}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      bounces={bounces}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}
