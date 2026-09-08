/**
 * Concatenate pause/resume voice segments into one playable clip (Web).
 * Byte-pasting WebM/Opus is invalid — decode with Web Audio, then export WAV.
 */

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const samples = buffer.length;
  const dataSize = samples * blockAlign;
  const headerSize = 44;
  const arrayBuffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(arrayBuffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buffer.getChannelData(ch));
  }

  let offset = 44;
  for (let i = 0; i < samples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i] ?? 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return arrayBuffer;
}

async function decodeUri(ctx: AudioContext, uri: string): Promise<AudioBuffer> {
  const res = await fetch(uri);
  if (!res.ok) {
    throw new Error(`Failed to fetch voice segment (${res.status})`);
  }
  const ab = await res.arrayBuffer();
  // decodeAudioData detaches the buffer on some browsers — copy first.
  return ctx.decodeAudioData(ab.slice(0));
}

export async function mergeVoiceSegments(uris: string[]): Promise<string | null> {
  const unique = uris.filter((uri, i, arr) => uri && arr.indexOf(uri) === i);
  if (unique.length === 0) return null;
  if (unique.length === 1) return unique[0];

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return unique[unique.length - 1];

  const ctx = new AudioCtx();
  try {
    const buffers: AudioBuffer[] = [];
    for (const uri of unique) {
      buffers.push(await decodeUri(ctx, uri));
    }

    const sampleRate = buffers[0].sampleRate;
    const numChannels = Math.max(...buffers.map((b) => b.numberOfChannels));
    const totalLength = buffers.reduce((sum, b) => sum + b.length, 0);
    const merged = ctx.createBuffer(numChannels, totalLength, sampleRate);

    let offset = 0;
    for (const buf of buffers) {
      for (let ch = 0; ch < numChannels; ch++) {
        const dest = merged.getChannelData(ch);
        const src = buf.getChannelData(Math.min(ch, buf.numberOfChannels - 1));
        dest.set(src, offset);
      }
      offset += buf.length;
    }

    const wav = audioBufferToWav(merged);
    return URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
  } catch (error) {
    console.warn('[mergeVoiceSegments] web merge failed — falling back to last segment', error);
    return unique[unique.length - 1];
  } finally {
    try {
      await ctx.close();
    } catch {
      /* ignore */
    }
  }
}
