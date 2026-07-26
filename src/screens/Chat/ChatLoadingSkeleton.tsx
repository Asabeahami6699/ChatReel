import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { USE_NATIVE_DRIVER } from '../../lib/animation';
import type { ChatThemeTokens } from '../../lib/chatThemes';

/**
 * Placeholder bubbles shown while a chat loads for the first time.
 *
 * A spinner reads as "nothing is here yet"; bubble shapes read as "your
 * conversation is about to appear", which is how the layout will actually
 * resolve. Widths are fixed rather than random so the skeleton never jitters
 * between renders.
 */

type Row = { outgoing: boolean; widthRatio: number; height: number };

const ROWS: Row[] = [
  { outgoing: false, widthRatio: 0.54, height: 38 },
  { outgoing: true, widthRatio: 0.42, height: 34 },
  { outgoing: false, widthRatio: 0.68, height: 56 },
  { outgoing: false, widthRatio: 0.33, height: 32 },
  { outgoing: true, widthRatio: 0.6, height: 44 },
  { outgoing: true, widthRatio: 0.29, height: 32 },
  { outgoing: false, widthRatio: 0.5, height: 38 },
];

export function ChatLoadingSkeleton({ theme }: { theme: ChatThemeTokens }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 750,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 750,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const opacity = useMemo(
    () => pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.7] }),
    [pulse]
  );

  return (
    <View style={styles.wrap} pointerEvents="none">
      {ROWS.map((row, index) => (
        <View
          key={index}
          style={[styles.row, row.outgoing ? styles.rowOutgoing : styles.rowIncoming]}
        >
          <Animated.View
            style={[
              styles.bubble,
              {
                opacity,
                height: row.height,
                width: `${Math.round(row.widthRatio * 100)}%`,
                backgroundColor: row.outgoing ? theme.outgoingBubble : theme.incomingBubble,
                borderBottomRightRadius: row.outgoing ? 4 : 16,
                borderBottomLeftRadius: row.outgoing ? 16 : 4,
              },
            ]}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingTop: 16 },
  row: { flexDirection: 'row', marginBottom: 10 },
  rowIncoming: { justifyContent: 'flex-start' },
  rowOutgoing: { justifyContent: 'flex-end' },
  bubble: {
    borderRadius: 16,
  },
});
