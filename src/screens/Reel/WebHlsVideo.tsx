import React from 'react';
import type { ReelPlaybackStatus, ReelPlayerHandle } from '../../components/ReelPlayer';

type Props = {
  uri: string;
  style?: object;
  muted: boolean;
  volume?: number;
  shouldPlay: boolean;
  contentFit?: 'contain' | 'cover' | 'fill';
  onReady?: () => void;
  onPlaybackStatusUpdate?: (status: ReelPlaybackStatus) => void;
};

/** Native stub — HLS on native uses expo-video / direct URLs. */
export const WebHlsVideo = React.forwardRef<ReelPlayerHandle, Props>(function WebHlsVideo(_props, _ref) {
  return null;
});
