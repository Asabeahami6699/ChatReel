/** Side-channel for in-call chat + reactions (separate from video upgrade signals). */
export const CALL_EXTRAS_TOPIC = 'call-extras';

export type CallReactionKind = 'heart' | 'clap' | 'fire' | 'wave';

export type CallExtrasSignal =
  | { type: 'chat'; text: string; name?: string; at: number }
  | { type: 'reaction'; kind: CallReactionKind; name?: string; at: number }
  | { type: 'gift'; emoji: string; name?: string; at: number }
  | { type: 'recording_request'; at: number }
  | { type: 'recording_consent'; allowed: boolean; at: number };

export function encodeCallExtrasSignal(signal: CallExtrasSignal): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(signal));
}

export function decodeCallExtrasSignal(payload: Uint8Array): CallExtrasSignal | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(payload)) as CallExtrasSignal;
    if (parsed?.type === 'chat' && typeof parsed.text === 'string') {
      return {
        type: 'chat',
        text: parsed.text.slice(0, 280),
        name: typeof parsed.name === 'string' ? parsed.name.slice(0, 40) : undefined,
        at: typeof parsed.at === 'number' ? parsed.at : Date.now(),
      };
    }
    if (
      parsed?.type === 'reaction' &&
      (parsed.kind === 'heart' ||
        parsed.kind === 'clap' ||
        parsed.kind === 'fire' ||
        parsed.kind === 'wave')
    ) {
      return {
        type: 'reaction',
        kind: parsed.kind,
        name: typeof parsed.name === 'string' ? parsed.name.slice(0, 40) : undefined,
        at: typeof parsed.at === 'number' ? parsed.at : Date.now(),
      };
    }
    if (parsed?.type === 'gift' && typeof parsed.emoji === 'string') {
      return {
        type: 'gift',
        emoji: parsed.emoji.slice(0, 8),
        name: typeof parsed.name === 'string' ? parsed.name.slice(0, 40) : undefined,
        at: typeof parsed.at === 'number' ? parsed.at : Date.now(),
      };
    }
    if (parsed?.type === 'recording_request') {
      return { type: 'recording_request', at: typeof parsed.at === 'number' ? parsed.at : Date.now() };
    }
    if (parsed?.type === 'recording_consent' && typeof parsed.allowed === 'boolean') {
      return {
        type: 'recording_consent',
        allowed: parsed.allowed,
        at: typeof parsed.at === 'number' ? parsed.at : Date.now(),
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export type PublishCallExtras = (signal: CallExtrasSignal) => void;
