import React from 'react';
import type { ReelPlaybackStatus } from '../../components/ReelPlayer';

type Props = {
  uri: string;
  style?: object;
  muted: boolean;
  shouldPlay: boolean;
  onReady?: () => void;
  onPlaybackStatusUpdate?: (status: ReelPlaybackStatus) => void;
};

/** Native stub — HLS on native uses expo-video / direct URLs. */
export function WebHlsVideo(_props: Props) {
  return null;
}
