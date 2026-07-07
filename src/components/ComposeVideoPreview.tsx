import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

export const COMPOSE_PREVIEW_HEIGHT = 380;

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  height?: number;
  /** Light-theme border (moments). Omit on dark reel composer. */
  bordered?: boolean;
};

/** Rounded card used for moment / reel compose video previews (cover, fixed height). */
export function ComposeVideoPreview({
  children,
  style,
  height = COMPOSE_PREVIEW_HEIGHT,
  bordered = false,
}: Props) {
  return (
    <View
      style={[
        styles.card,
        bordered && styles.cardBordered,
        { height },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#000',
    width: '100%',
  },
  cardBordered: {
    borderWidth: 1,
    borderColor: '#e2eaf3',
  },
});
