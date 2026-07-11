import React from 'react';
import { View, type ViewProps } from 'react-native';

type WebPagerProps = ViewProps & {
  initialPage?: number;
  orientation?: 'horizontal' | 'vertical';
  offscreenPageLimit?: number;
  onPageSelected?: (e: { nativeEvent: { position: number } }) => void;
};

/** Web stub — never import react-native-pager-view on web (native-only). */
export const PagerView = React.forwardRef<View, WebPagerProps>(function PagerViewWeb(
  { children, initialPage: _i, orientation: _o, offscreenPageLimit: _l, onPageSelected: _p, ...rest },
  ref
) {
  return (
    <View ref={ref} {...rest}>
      {children}
    </View>
  );
});
