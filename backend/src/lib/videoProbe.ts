import { spawn } from 'child_process';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

export type VideoDimensions = { width: number; height: number; duration?: number };

/** Parse width/height from `ffmpeg -i` stderr (no ffprobe binary required). */
export function probeVideoDimensionsFromPath(filePath: string): Promise<VideoDimensions> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegInstaller.path, ['-hide_banner', '-i', filePath], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    let stderr = '';
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on('error', reject);
    proc.on('close', () => {
      const parsed = parseFfmpegDimensions(stderr);
      if (parsed) resolve(parsed);
      else reject(new Error('Could not read video dimensions'));
    });
  });
}

export function probeVideoDimensionsFromUrl(url: string): Promise<VideoDimensions> {
  return probeVideoDimensionsFromPath(url);
}

function parseFfmpegDimensions(stderr: string): VideoDimensions | null {
  const streamMatch = stderr.match(/Video:[^\n]*?,\s*(\d{2,5})x(\d{2,5})/);
  if (!streamMatch) return null;

  const width = Number(streamMatch[1]);
  const height = Number(streamMatch[2]);
  if (!width || !height) return null;

  const durationMatch = stderr.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
  let duration: number | undefined;
  if (durationMatch) {
    duration =
      Number(durationMatch[1]) * 3600 +
      Number(durationMatch[2]) * 60 +
      Number(durationMatch[3]);
  }

  return { width, height, duration };
}
