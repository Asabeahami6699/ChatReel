import { Platform, useWindowDimensions, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MOBILE_BREAKPOINT } from '../navigation/navigationUtils';

/** Shared top-right toast placement; smaller on desktop web. */
export function useToastLayout() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= MOBILE_BREAKPOINT;
  const maxWidth = isDesktop ? 260 : Math.min(width - 24, 380);

  const wrapperStyle: ViewStyle = {
    position: 'absolute',
    top: insets.top + (isDesktop ? 12 : 8),
    // Paper Snackbar defaults to bottom: 0 — clear it on web + native.
    bottom: 'auto' as unknown as number,
    left: 'auto' as unknown as number,
    right: isDesktop ? 16 : 12,
    width: 'auto',
    maxWidth,
    alignItems: 'flex-end',
  };

  const snackbarStyle: ViewStyle = {
    margin: 0,
    marginHorizontal: 0,
    alignSelf: 'flex-end',
    maxWidth,
    borderRadius: isDesktop ? 10 : 12,
    paddingVertical: isDesktop ? 0 : 2,
    minWidth: isDesktop ? 140 : undefined,
  };

  const textStyle: TextStyle = {
    fontSize: isDesktop ? 12 : 14,
    fontWeight: '600',
    lineHeight: isDesktop ? 16 : 20,
  };

  return { isDesktop, maxWidth, wrapperStyle, snackbarStyle, textStyle };
}
