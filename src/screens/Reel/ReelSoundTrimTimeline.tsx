import { ReelRangeTrimBar } from './ReelRangeTrimBar';
import { REEL_ACCENT } from './reelTheme';

type Props = {
  duration: number;
  startSec: number;
  endSec: number;
  previewSec: number;
  onStartChange: (sec: number) => void;
  onEndChange: (sec: number) => void;
  onPreviewChange: (sec: number) => void;
  onPreviewStart: () => void;
  onPreviewComplete?: (sec: number) => void;
};

/** Music clip trim — full track shown; drag handles to pick which section. */
export function ReelSoundTrimTimeline({
  duration,
  startSec,
  endSec,
  previewSec,
  onStartChange,
  onEndChange,
  onPreviewChange,
  onPreviewStart,
  onPreviewComplete,
}: Props) {
  return (
    <ReelRangeTrimBar
      duration={duration}
      rangeStart={startSec}
      rangeEnd={endSec}
      position={previewSec}
      title="Music clip"
      accentColor={REEL_ACCENT}
      onRangeStartChange={onStartChange}
      onRangeEndChange={onEndChange}
      onPositionChange={onPreviewChange}
      onScrubStart={onPreviewStart}
      onScrubEnd={onPreviewComplete}
      hint="Drag along the full track to choose which part of the song to use"
    />
  );
};
