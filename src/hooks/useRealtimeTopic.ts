import { useEffect, useRef } from 'react';
import {
  getRealtimeTopic,
  type RealtimeTopicName,
} from '../lib/realtimeHub';

/** Subscribe to a global realtime topic (hub must be running via RealtimeProvider). */
export function useRealtimeTopic(
  topic: RealtimeTopicName | null | undefined,
  onChange: () => void,
  enabled = true
) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!topic || !enabled) return;

    return getRealtimeTopic(topic).subscribe(() => {
      onChangeRef.current();
    });
  }, [topic, enabled]);
}
