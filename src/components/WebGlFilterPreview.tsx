import React from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { MediaFilterFrame } from './MediaFilterFrame';
import type { ReelFilterId } from '../screens/Reel/reelFilters';

type Props = {
  uri: string;
  mediaType: 'image' | 'video';
  filterId?: ReelFilterId | string | null;
  style?: StyleProp<ViewStyle>;
  contentFit?: 'contain' | 'cover';
  muted?: boolean;
  volume?: number;
  shouldPlay?: boolean;
  isLooping?: boolean;
  onPlaybackStatusUpdate?: (status: unknown) => void;
  children?: React.ReactNode;
};

/**
 * Native fallback — CSS/overlay frame. Web uses WebGlFilterPreview.web.tsx.
 */
export function WebGlFilterPreview({
  filterId,
  style,
  children,
}: Props) {
  return (
    <MediaFilterFrame filterId={filterId} style={[styles.fill, style]}>
      {children}
    </MediaFilterFrame>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, width: '100%', height: '100%' },
});
