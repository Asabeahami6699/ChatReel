import { ReelRangeTrimBar, type ReelRangeTrimBarProps } from './ReelRangeTrimBar';

type Props = {
  duration: number;
  trimStart: number;
  trimEnd: number;
  position: number;
  onTrimStartChange: (sec: number) => void;
  onTrimEndChange: (sec: number) => void;
  onScrubStart: () => void;
  /** Fires while dragging inside the selection (playhead sync). */
  onScrubMove?: (sec: number) => void;
  onScrubComplete: (sec: number) => void;
  onTrimStartComplete?: (sec: number) => void;
};

/** Video clip trim — single bar with draggable start/end handles. */
export function ReelTrimTimeline({
  duration,
  trimStart,
  trimEnd,
  position,
  onTrimStartChange,
  onTrimEndChange,
  onScrubStart,
  onScrubMove,
  onScrubComplete,
  onTrimStartComplete,
}: Props) {
  const props: ReelRangeTrimBarProps = {
    duration,
    rangeStart: trimStart,
    rangeEnd: trimEnd,
    position,
    title: 'Trim clip',
    onRangeStartChange: onTrimStartChange,
    onRangeEndChange: onTrimEndChange,
    onRangeStartComplete: onTrimStartComplete,
    onPositionChange: (sec) => onScrubMove?.(sec),
    onScrubStart,
    onScrubEnd: onScrubComplete,
  };
  return <ReelRangeTrimBar {...props} />;
};
