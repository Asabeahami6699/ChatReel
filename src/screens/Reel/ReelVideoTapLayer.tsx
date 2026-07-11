import React, { useMemo } from 'react';
import {
  Platform,
  Pressable as RNPressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

type Props = {
  style?: StyleProp<ViewStyle>;
  onPress: () => void;
  onLongPress?: () => void;
  delayLongPress?: number;
};

function WebTapLayer({ style, onPress, onLongPress, delayLongPress = 700 }: Props) {
  return (
    <RNPressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      style={[styles.overlay, style]}
    />
  );
}

function NativeTapLayer({ style, onPress, onLongPress, delayLongPress = 700 }: Props) {
  const gesture = useMemo(() => {
    const tap = Gesture.Tap()
      .maxDuration(250)
      .maxDistance(14)
      .onEnd((_e, success) => {
        if (success) runOnJS(onPress)();
      });

    if (!onLongPress) return tap;

    const longPress = Gesture.LongPress()
      .minDuration(delayLongPress)
      .maxDistance(14)
      .onStart(() => {
        runOnJS(onLongPress)();
      });

    return Gesture.Exclusive(longPress, tap);
  }, [onPress, onLongPress, delayLongPress]);

  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.overlay, style]} collapsable={false} />
    </GestureDetector>
  );
}

/**
 * Sibling overlay ABOVE the video (never wrap VideoView).
 * Native uses RNGH Tap/LongPress so vertical pans fail the tap and reach FlatList.
 * Wrapping with TouchableOpacity (RN or GH) still fights paging on many devices.
 */
export function ReelVideoTapLayer(props: Props) {
  if (Platform.OS === 'web') return <WebTapLayer {...props} />;
  return <NativeTapLayer {...props} />;
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 3,
  },
});
