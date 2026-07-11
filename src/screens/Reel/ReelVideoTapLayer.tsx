import React from 'react';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';
import { TouchableOpacity as RNTouchableOpacity } from 'react-native';
import { TouchableOpacity as GHTouchableOpacity } from 'react-native-gesture-handler';

type Props = {
  style?: StyleProp<ViewStyle>;
  onPress: () => void;
  onLongPress?: () => void;
  delayLongPress?: number;
  children?: React.ReactNode;
};

/**
 * Full-bleed video tap target.
 * On native, RN TouchableOpacity often steals the vertical pan from FlatList;
 * gesture-handler's TouchableOpacity cooperates with scrolling instead.
 */
export function ReelVideoTapLayer({
  style,
  onPress,
  onLongPress,
  delayLongPress = 700,
  children,
}: Props) {
  const Touchable = Platform.OS === 'web' ? RNTouchableOpacity : GHTouchableOpacity;

  return (
    <Touchable
      activeOpacity={1}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      style={style}
    >
      {children}
    </Touchable>
  );
}
