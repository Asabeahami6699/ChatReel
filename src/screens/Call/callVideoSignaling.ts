export const CALL_VIDEO_TOPIC = 'call-video';

export type CallVideoSignal =
  | { type: 'video_request' }
  | { type: 'video_accept' }
  | { type: 'video_decline' }
  | { type: 'video_revert' };

export function encodeCallVideoSignal(signal: CallVideoSignal): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(signal));
}

export function decodeCallVideoSignal(payload: Uint8Array): CallVideoSignal | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(payload)) as CallVideoSignal;
    if (
      parsed?.type === 'video_request' ||
      parsed?.type === 'video_accept' ||
      parsed?.type === 'video_decline' ||
      parsed?.type === 'video_revert'
    ) {
      return parsed;
    }
  } catch {
    /* ignore malformed payloads */
  }
  return null;
}

export type PublishCallVideoSignal = (signal: CallVideoSignal) => void;
