/**
 * One-time script: builds assets/reel-end.gif from the app logo.
 * Run: node scripts/create-reel-end-gif.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { buffer } from 'node:stream/consumers';
import { GifEncoder } from '@skyra/gifenc';
import { PNG } from 'pngjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const logo = PNG.sync.read(readFileSync(join(root, 'assets/favIconChat.png')));

const W = 180;
const H = 180;
const FRAMES = 18;
const FRAME_MS = 100;

function sampleLogo(x, y, scale, glow) {
  const cx = W / 2;
  const cy = H / 2;
  const lx = (x - cx) / scale + logo.width / 2;
  const ly = (y - cy) / scale + logo.height / 2;
  const ix = Math.floor(lx);
  const iy = Math.floor(ly);
  if (ix < 0 || iy < 0 || ix >= logo.width || iy >= logo.height) {
    const dist = Math.hypot(x - cx, y - cy) / (W * 0.42);
    const pulse = Math.max(0, 1 - dist);
    const g = Math.round(8 + glow * 28 * pulse);
    const b = Math.round(40 + glow * 180 * pulse);
    return [4, g, b, 255];
  }
  const idx = (logo.width * iy + ix) << 2;
  const a = logo.data[idx + 3] / 255;
  if (a < 0.05) {
    const dist = Math.hypot(x - cx, y - cy) / (W * 0.42);
    const pulse = Math.max(0, 1 - dist);
    const g = Math.round(8 + glow * 28 * pulse);
    const b = Math.round(40 + glow * 180 * pulse);
    return [4, g, b, 255];
  }
  const bg = [4, 12, 32];
  const r = logo.data[idx] * a + bg[0] * (1 - a);
  const g = logo.data[idx + 1] * a + bg[1] * (1 - a);
  const b = logo.data[idx + 2] * a + bg[2] * (1 - a);
  return [Math.round(r), Math.round(g), Math.round(b), 255];
}

function buildFrame(f) {
  const t = f / FRAMES;
  const scale = 0.82 + 0.18 * Math.sin(t * Math.PI * 2);
  const glow = 0.55 + 0.45 * Math.sin(t * Math.PI * 2 + 0.6);
  const rgba = new Uint8ClampedArray(W * H * 4);

  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const ring = Math.abs(Math.hypot(x - W / 2, y - H / 2) - 92);
      const ringGlow = ring < 3 ? Math.round((1 - ring / 3) * 90 * glow) : 0;
      const [r, g, b, a] = sampleLogo(x, y, scale * 1.15, glow);
      const i = (y * W + x) * 4;
      rgba[i] = Math.min(255, r + ringGlow * 0.2);
      rgba[i + 1] = Math.min(255, g + ringGlow * 0.35);
      rgba[i + 2] = Math.min(255, b + ringGlow);
      rgba[i + 3] = a;
    }
  }
  return rgba;
}

const encoder = new GifEncoder(W, H);
const stream = encoder.createReadStream();
encoder.setRepeat(0).setDelay(FRAME_MS).setQuality(12).start();

for (let f = 0; f < FRAMES; f += 1) {
  encoder.addFrame(buildFrame(f));
}

encoder.finish();
const gifBuffer = await buffer(stream);
writeFileSync(join(root, 'assets/reel-end.gif'), gifBuffer);
console.log('Wrote assets/reel-end.gif');
