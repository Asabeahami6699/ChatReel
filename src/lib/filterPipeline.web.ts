/**
 * WebGL + MediaPipe filter pipeline (web only).
 * Three canvases: WebGL color shaders, 2D AR overlay, 2D output composite.
 * Photos use toBlob() on the output canvas; video recording uses captureStream().
 *
 * MediaPipe is loaded from CDN at runtime — Metro cannot transform the npm
 * package (dynamic import(t.toString()) inside vision_bundle.mjs).
 */

// ============================================================================
// TYPES
// ============================================================================

type FaceLandmark = { x: number; y: number; z?: number };

type FaceLandmarkerResult = {
  faceLandmarks: FaceLandmark[][];
};

type FaceLandmarkerLike = {
  detectForVideo: (video: HTMLVideoElement, timeMs: number) => FaceLandmarkerResult;
  detect: (image: HTMLImageElement | HTMLCanvasElement) => FaceLandmarkerResult;
  setOptions: (opts: { runningMode: 'IMAGE' | 'VIDEO' }) => void;
  close: () => void;
};

type MediaPipeVisionModule = {
  FilesetResolver: {
    forVisionTasks: (wasmPath: string) => Promise<unknown>;
  };
  FaceLandmarker: {
    createFromOptions: (
      vision: unknown,
      options: Record<string, unknown>
    ) => Promise<FaceLandmarkerLike>;
  };
};

const MEDIAPIPE_VERSION = '0.10.18';
const MEDIAPIPE_CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}`;

/** Bypass Metro static analysis — must not import npm @mediapipe/tasks-vision. */
async function loadMediaPipeVision(): Promise<MediaPipeVisionModule> {
  const url = `${MEDIAPIPE_CDN}/vision_bundle.mjs`;
  // new Function keeps Metro from trying to resolve/transform the CDN module
  const dynamicImport = new Function('u', 'return import(u)') as (
    u: string
  ) => Promise<MediaPipeVisionModule>;
  return dynamicImport(url);
}

// ============================================================================
// TYPES (public)
// ============================================================================

export type FilterType =
  | 'none'
  | 'beauty'
  | 'smooth'
  | 'vintage'
  | 'bw'
  | 'sepia'
  | 'neon'
  | 'pixelate'
  | 'swirl'
  | 'dog_ears'
  | 'cat_ears'
  | 'crown'
  | 'sunglasses'
  | 'big_eyes'
  | 'rainbow_vomit';

export type FilterConfig = {
  type: FilterType;
  intensity?: number;
};

export type FilterSnapshot = {
  blob: Blob;
  url: string;
  width: number;
  height: number;
};

export type FilterRecording = {
  recorder: MediaRecorder;
  stop: () => Promise<Blob>;
};

export type FilterState = {
  isLoaded: boolean;
  isRunning: boolean;
  filter: FilterConfig;
  fps: number;
  faceDetected: boolean;
};

// ============================================================================
// SHADERS
// ============================================================================

const VERT = `
  attribute vec2 a_pos;
  attribute vec2 a_uv;
  varying vec2 v_uv;
  void main() {
    gl_Position = vec4(a_pos, 0.0, 1.0);
    v_uv = a_uv;
  }
`;

const FRAG_NONE = `
  precision mediump float;
  varying vec2 v_uv;
  uniform sampler2D u_tex;
  void main() {
    gl_FragColor = texture2D(u_tex, v_uv);
  }
`;

const FRAG_BEAUTY = `
  precision mediump float;
  varying vec2 v_uv;
  uniform sampler2D u_tex;
  uniform vec2 u_size;
  uniform float u_intensity;
  void main() {
    vec2 px = 1.0 / u_size;
    vec4 c = texture2D(u_tex, v_uv);
    vec4 blur = c * 0.2;
    blur += texture2D(u_tex, v_uv + vec2(-px.x, 0.0)) * 0.15;
    blur += texture2D(u_tex, v_uv + vec2( px.x, 0.0)) * 0.15;
    blur += texture2D(u_tex, v_uv + vec2(0.0, -px.y)) * 0.15;
    blur += texture2D(u_tex, v_uv + vec2(0.0,  px.y)) * 0.15;
    blur += texture2D(u_tex, v_uv + vec2(-px.x, -px.y)) * 0.05;
    blur += texture2D(u_tex, v_uv + vec2( px.x,  px.y)) * 0.05;
    blur += texture2D(u_tex, v_uv + vec2(-px.x,  px.y)) * 0.05;
    blur += texture2D(u_tex, v_uv + vec2( px.x, -px.y)) * 0.05;
    vec3 skin = vec3(1.04, 0.97, 0.94);
    vec3 outCol = mix(c.rgb, blur.rgb, u_intensity * 0.55);
    outCol = mix(outCol, outCol * skin, u_intensity * 0.25);
    gl_FragColor = vec4(outCol, c.a);
  }
`;

const FRAG_VINTAGE = `
  precision mediump float;
  varying vec2 v_uv;
  uniform sampler2D u_tex;
  uniform float u_intensity;
  void main() {
    vec4 c = texture2D(u_tex, v_uv);
    vec3 sepia = vec3(
      dot(c.rgb, vec3(0.393, 0.769, 0.189)),
      dot(c.rgb, vec3(0.349, 0.686, 0.168)),
      dot(c.rgb, vec3(0.272, 0.534, 0.131))
    );
    float vig = 1.0 - length(v_uv - 0.5) * 0.9;
    vec3 col = mix(c.rgb, sepia * vig, u_intensity);
    gl_FragColor = vec4(col, c.a);
  }
`;

const FRAG_BW = `
  precision mediump float;
  varying vec2 v_uv;
  uniform sampler2D u_tex;
  uniform float u_intensity;
  void main() {
    vec4 c = texture2D(u_tex, v_uv);
    float g = dot(c.rgb, vec3(0.299, 0.587, 0.114));
    vec3 col = mix(c.rgb, vec3(g), u_intensity);
    gl_FragColor = vec4(col, c.a);
  }
`;

const FRAG_SEPIA = `
  precision mediump float;
  varying vec2 v_uv;
  uniform sampler2D u_tex;
  uniform float u_intensity;
  void main() {
    vec4 c = texture2D(u_tex, v_uv);
    vec3 s = vec3(
      dot(c.rgb, vec3(0.393, 0.769, 0.189)),
      dot(c.rgb, vec3(0.349, 0.686, 0.168)),
      dot(c.rgb, vec3(0.272, 0.534, 0.131))
    );
    gl_FragColor = vec4(mix(c.rgb, s, u_intensity), c.a);
  }
`;

const FRAG_NEON = `
  precision mediump float;
  varying vec2 v_uv;
  uniform sampler2D u_tex;
  uniform vec2 u_size;
  uniform float u_intensity;
  void main() {
    vec4 c = texture2D(u_tex, v_uv);
    vec2 px = 1.0 / u_size;
    float e = 0.0;
    e += abs(texture2D(u_tex, v_uv + vec2(px.x, 0.0)).r - texture2D(u_tex, v_uv - vec2(px.x, 0.0)).r);
    e += abs(texture2D(u_tex, v_uv + vec2(0.0, px.y)).r - texture2D(u_tex, v_uv - vec2(0.0, px.y)).r);
    vec3 glow = vec3(0.1, 1.0, 0.4) * e * 3.5;
    vec3 col = mix(c.rgb, glow + c.rgb * 0.35, u_intensity);
    gl_FragColor = vec4(col, c.a);
  }
`;

const FRAG_PIXELATE = `
  precision mediump float;
  varying vec2 v_uv;
  uniform sampler2D u_tex;
  uniform vec2 u_size;
  uniform float u_intensity;
  void main() {
    float s = mix(1.0, 40.0, u_intensity);
    vec2 p = floor(v_uv * u_size / s) * s / u_size;
    gl_FragColor = texture2D(u_tex, p);
  }
`;

const FRAG_SWIRL = `
  precision mediump float;
  varying vec2 v_uv;
  uniform sampler2D u_tex;
  uniform float u_intensity;
  void main() {
    vec2 uv = v_uv - 0.5;
    float d = length(uv);
    float a = atan(uv.y, uv.x);
    float sw = u_intensity * 3.14159 * (1.0 - d);
    float cs = cos(sw), sn = sin(sw);
    vec2 r = vec2(uv.x * cs - uv.y * sn, uv.x * sn + uv.y * cs);
    gl_FragColor = texture2D(u_tex, r + 0.5);
  }
`;

type GLProgram = {
  program: WebGLProgram;
  aPos: number;
  aUv: number;
  uTex: WebGLUniformLocation | null;
  uSize: WebGLUniformLocation | null;
  uIntensity: WebGLUniformLocation | null;
};

function compile(gl: WebGLRenderingContext, name: string, fragSrc: string): GLProgram {
  const vs = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(vs, VERT);
  gl.compileShader(vs);

  const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(fs, fragSrc);
  gl.compileShader(fs);

  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);

  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('Shader link error:', name, gl.getProgramInfoLog(prog));
  }

  return {
    program: prog,
    aPos: gl.getAttribLocation(prog, 'a_pos'),
    aUv: gl.getAttribLocation(prog, 'a_uv'),
    uTex: gl.getUniformLocation(prog, 'u_tex'),
    uSize: gl.getUniformLocation(prog, 'u_size'),
    uIntensity: gl.getUniformLocation(prog, 'u_intensity'),
  };
}

class FaceTracker {
  landmarker: FaceLandmarkerLike | null = null;
  loaded = false;

  async init() {
    const { FilesetResolver, FaceLandmarker } = await loadMediaPipeVision();
    const vision = await FilesetResolver.forVisionTasks(`${MEDIAPIPE_CDN}/wasm`);
    this.landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numFaces: 1,
    });
    this.loaded = true;
  }

  detectVideo(video: HTMLVideoElement, timeMs: number): FaceLandmarkerResult | null {
    if (!this.landmarker) return null;
    try {
      return this.landmarker.detectForVideo(video, timeMs);
    } catch {
      return null;
    }
  }

  detectImage(image: HTMLImageElement | HTMLCanvasElement): FaceLandmarkerResult | null {
    if (!this.landmarker) return null;
    try {
      this.landmarker.setOptions({ runningMode: 'IMAGE' });
      const result = this.landmarker.detect(image);
      this.landmarker.setOptions({ runningMode: 'VIDEO' });
      return result;
    } catch {
      try {
        this.landmarker.setOptions({ runningMode: 'VIDEO' });
      } catch {
        /* ignore */
      }
      return null;
    }
  }

  destroy() {
    this.landmarker?.close();
    this.landmarker = null;
    this.loaded = false;
  }
}

export class FilterPipeline {
  private glCanvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private overlayCanvas: HTMLCanvasElement;
  private overlayCtx: CanvasRenderingContext2D;
  private outputCanvas: HTMLCanvasElement;
  private outputCtx: CanvasRenderingContext2D;

  private tracker = new FaceTracker();
  private programs = new Map<string, GLProgram>();
  private texture: WebGLTexture | null = null;
  private posBuffer!: WebGLBuffer;
  private uvBuffer!: WebGLBuffer;

  private animId = 0;
  private lastTime = 0;
  private frameCount = 0;
  private fps = 0;

  private currentFilter: FilterConfig = { type: 'none', intensity: 1.0 };
  private faceResult: FaceLandmarkerResult | null = null;
  private isRunning = false;
  private sourceVideo: HTMLVideoElement | null = null;

  private recorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];

  constructor(width = 640, height = 480) {
    if (typeof document === 'undefined') {
      throw new Error('FilterPipeline requires a browser document');
    }

    this.glCanvas = document.createElement('canvas');
    this.glCanvas.width = width;
    this.glCanvas.height = height;
    const gl = this.glCanvas.getContext('webgl', { alpha: false, antialias: false });
    if (!gl) throw new Error('WebGL not supported');
    this.gl = gl;

    this.overlayCanvas = document.createElement('canvas');
    this.overlayCanvas.width = width;
    this.overlayCanvas.height = height;
    this.overlayCtx = this.overlayCanvas.getContext('2d')!;

    this.outputCanvas = document.createElement('canvas');
    this.outputCanvas.width = width;
    this.outputCanvas.height = height;
    this.outputCtx = this.outputCanvas.getContext('2d')!;

    this.initGL();
  }

  private initGL() {
    const gl = this.gl;
    const pos = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    const uv = new Float32Array([0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0]);

    this.posBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);

    this.uvBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);

    this.programs.set('none', compile(gl, 'none', FRAG_NONE));
    this.programs.set('beauty', compile(gl, 'beauty', FRAG_BEAUTY));
    this.programs.set('vintage', compile(gl, 'vintage', FRAG_VINTAGE));
    this.programs.set('bw', compile(gl, 'bw', FRAG_BW));
    this.programs.set('sepia', compile(gl, 'sepia', FRAG_SEPIA));
    this.programs.set('neon', compile(gl, 'neon', FRAG_NEON));
    this.programs.set('pixelate', compile(gl, 'pixelate', FRAG_PIXELATE));
    this.programs.set('swirl', compile(gl, 'swirl', FRAG_SWIRL));

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  async load() {
    try {
      await this.tracker.init();
    } catch (err) {
      console.warn('[FilterPipeline] Face tracker unavailable; AR filters disabled', err);
    }
  }

  getOutputCanvas() {
    return this.outputCanvas;
  }

  setSize(width: number, height: number) {
    if (width <= 0 || height <= 0) return;
    this.glCanvas.width = width;
    this.glCanvas.height = height;
    this.overlayCanvas.width = width;
    this.overlayCanvas.height = height;
    this.outputCanvas.width = width;
    this.outputCanvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  setFilter(config: FilterConfig) {
    this.currentFilter = { intensity: 1.0, ...config };
  }

  getFilter(): FilterConfig {
    return { ...this.currentFilter };
  }

  private render(source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement) {
    const w = this.glCanvas.width;
    const h = this.glCanvas.height;
    const gl = this.gl;

    if (!this.texture) {
      this.texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

    const progName = this.getProgramName(this.currentFilter.type);
    const p = this.programs.get(progName);
    if (!p) return;

    gl.useProgram(p.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.enableVertexAttribArray(p.aPos);
    gl.vertexAttribPointer(p.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    gl.enableVertexAttribArray(p.aUv);
    gl.vertexAttribPointer(p.aUv, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(p.uTex, 0);
    if (p.uSize !== null) gl.uniform2f(p.uSize, w, h);
    if (p.uIntensity !== null) gl.uniform1f(p.uIntensity, this.currentFilter.intensity ?? 1.0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    if (this.isOverlayFilter(this.currentFilter.type)) {
      this.renderOverlay(w, h);
    } else {
      this.overlayCtx.clearRect(0, 0, w, h);
    }

    this.outputCtx.clearRect(0, 0, w, h);
    this.outputCtx.drawImage(this.glCanvas, 0, 0, w, h);
    if (this.isOverlayFilter(this.currentFilter.type)) {
      this.outputCtx.drawImage(this.overlayCanvas, 0, 0, w, h);
    }
  }

  private getProgramName(type: FilterType): string {
    switch (type) {
      case 'beauty':
      case 'smooth':
        return 'beauty';
      case 'vintage':
        return 'vintage';
      case 'bw':
        return 'bw';
      case 'sepia':
        return 'sepia';
      case 'neon':
        return 'neon';
      case 'pixelate':
        return 'pixelate';
      case 'swirl':
        return 'swirl';
      default:
        return 'none';
    }
  }

  private isOverlayFilter(type: FilterType): boolean {
    return [
      'dog_ears',
      'cat_ears',
      'crown',
      'sunglasses',
      'big_eyes',
      'rainbow_vomit',
    ].includes(type);
  }

  private renderOverlay(w: number, h: number) {
    const ctx = this.overlayCtx;
    ctx.clearRect(0, 0, w, h);

    const faces = this.faceResult?.faceLandmarks;
    if (!faces || faces.length === 0) return;

    const face = faces[0];
    const type = this.currentFilter.type;
    const FOREHEAD = 10;
    const NOSE_TIP = 1;
    const LEFT_EYE = 33;
    const RIGHT_EYE = 263;
    const MOUTH = 13;

    const toScreen = (idx: number) => {
      const p = face[idx];
      return p ? { x: p.x * w, y: p.y * h } : null;
    };

    switch (type) {
      case 'dog_ears': {
        const head = toScreen(FOREHEAD);
        const nose = toScreen(NOSE_TIP);
        if (head) this.drawEmoji(ctx, head.x, head.y - 40, '🐶', 60);
        if (nose) this.drawEmoji(ctx, nose.x, nose.y, '🐽', 35);
        break;
      }
      case 'cat_ears': {
        const head = toScreen(FOREHEAD);
        const nose = toScreen(NOSE_TIP);
        if (head) {
          this.drawEmoji(ctx, head.x - 35, head.y - 35, '🐱', 50);
          this.drawEmoji(ctx, head.x + 35, head.y - 35, '🐱', 50);
        }
        if (nose) this.drawEmoji(ctx, nose.x, nose.y, '👃', 25);
        break;
      }
      case 'crown': {
        const head = toScreen(FOREHEAD);
        if (head) this.drawEmoji(ctx, head.x, head.y - 45, '👑', 70);
        break;
      }
      case 'sunglasses': {
        const le = toScreen(LEFT_EYE);
        const re = toScreen(RIGHT_EYE);
        if (le && re) {
          const cx = (le.x + re.x) / 2;
          const cy = (le.y + re.y) / 2;
          const dist = Math.hypot(re.x - le.x, re.y - le.y);
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(Math.atan2(re.y - le.y, re.x - le.x));
          ctx.font = `${dist * 1.3}px serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('🕶️', 0, 0);
          ctx.restore();
        }
        break;
      }
      case 'big_eyes': {
        const le = toScreen(LEFT_EYE);
        const re = toScreen(RIGHT_EYE);
        [le, re].forEach((eye) => {
          if (!eye) return;
          ctx.beginPath();
          ctx.arc(eye.x, eye.y, 22, 0, Math.PI * 2);
          ctx.fillStyle = 'white';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(eye.x, eye.y, 10, 0, Math.PI * 2);
          ctx.fillStyle = '#222';
          ctx.fill();
        });
        break;
      }
      case 'rainbow_vomit': {
        const mouth = toScreen(MOUTH);
        if (!mouth) return;
        const colors = ['#ff0000', '#ff7f00', '#ffff00', '#00ff00', '#0000ff', '#4b0082', '#9400d3'];
        for (let i = 0; i < 25; i++) {
          const ang = Math.PI + Math.random() * Math.PI;
          const dist = 30 + Math.random() * 90;
          const x = mouth.x + Math.cos(ang) * dist;
          const y = mouth.y + Math.sin(ang) * dist;
          ctx.beginPath();
          ctx.arc(x, y, 4 + Math.random() * 10, 0, Math.PI * 2);
          ctx.fillStyle = colors[i % colors.length];
          ctx.globalAlpha = 0.75;
          ctx.fill();
        }
        ctx.globalAlpha = 1.0;
        break;
      }
    }
  }

  private drawEmoji(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    emoji: string,
    size: number
  ) {
    ctx.font = `${size}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, x, y);
  }

  start(video: HTMLVideoElement) {
    if (this.isRunning) return;
    this.sourceVideo = video;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.loop();
  }

  stop() {
    this.isRunning = false;
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = 0;
    }
    this.sourceVideo = null;
  }

  private loop = () => {
    if (!this.isRunning) return;
    this.animId = requestAnimationFrame(this.loop);

    const video = this.sourceVideo;
    if (!video || video.readyState < 2) return;

    if (
      video.videoWidth > 0 &&
      video.videoHeight > 0 &&
      this.outputCanvas.width !== video.videoWidth
    ) {
      this.setSize(video.videoWidth, video.videoHeight);
    }

    const now = performance.now();
    if (this.tracker.loaded) {
      this.faceResult = this.tracker.detectVideo(video, now);
    }

    this.render(video);

    this.frameCount++;
    if (now - this.lastTime >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.lastTime = now;
    }
  };

  async filterImage(
    image: HTMLImageElement,
    filter?: FilterConfig
  ): Promise<FilterSnapshot> {
    if (filter) this.setFilter(filter);

    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    this.setSize(width, height);

    if (this.tracker.loaded) {
      this.faceResult = this.tracker.detectImage(image);
    }

    this.render(image);
    return this.snapshot();
  }

  /** Re-render current still/video frame after setFilter (image path). */
  renderSource(source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement) {
    this.render(source);
  }

  snapshot(): Promise<FilterSnapshot> {
    return new Promise((resolve, reject) => {
      this.outputCanvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Canvas toBlob failed'));
            return;
          }
          resolve({
            blob,
            url: URL.createObjectURL(blob),
            width: this.outputCanvas.width,
            height: this.outputCanvas.height,
          });
        },
        'image/jpeg',
        0.92
      );
    });
  }

  startRecording(audioStream?: MediaStream): FilterRecording {
    if (this.recorder && this.recorder.state !== 'inactive') {
      throw new Error('Recording already in progress');
    }

    const canvasStream = this.outputCanvas.captureStream(30);
    if (audioStream) {
      audioStream.getAudioTracks().forEach((t) => canvasStream.addTrack(t));
    }

    this.recordedChunks = [];
    const mimeType = this.getSupportedMimeType();
    this.recorder = new MediaRecorder(canvasStream, {
      mimeType,
      videoBitsPerSecond: 2_500_000,
    });

    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.recordedChunks.push(e.data);
    };
    this.recorder.start(100);

    return {
      recorder: this.recorder,
      stop: () => this.stopRecording(),
    };
  }

  private stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.recorder) {
        reject(new Error('No active recording'));
        return;
      }

      this.recorder.onstop = () => {
        const blob = new Blob(this.recordedChunks, {
          type: this.recorder!.mimeType,
        });
        this.recorder = null;
        this.recordedChunks = [];
        resolve(blob);
      };

      this.recorder.onerror = () => {
        reject(new Error('Recording error'));
      };

      this.recorder.stop();
    });
  }

  private getSupportedMimeType(): string {
    const types = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4',
    ];
    for (const t of types) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) {
        return t;
      }
    }
    return 'video/webm';
  }

  getState(): FilterState {
    return {
      isLoaded: this.tracker.loaded,
      isRunning: this.isRunning,
      filter: { ...this.currentFilter },
      fps: this.fps,
      faceDetected: !!this.faceResult && this.faceResult.faceLandmarks.length > 0,
    };
  }

  destroy() {
    this.stop();
    this.tracker.destroy();

    const gl = this.gl;
    for (const p of this.programs.values()) {
      gl.deleteProgram(p.program);
    }
    if (this.texture) gl.deleteTexture(this.texture);
    gl.deleteBuffer(this.posBuffer);
    gl.deleteBuffer(this.uvBuffer);
    this.programs.clear();
  }
}

export const FILTERS: Record<string, FilterConfig> = {
  none: { type: 'none' },
  beauty: { type: 'beauty', intensity: 0.7 },
  smooth: { type: 'smooth', intensity: 0.8 },
  vintage: { type: 'vintage', intensity: 0.9 },
  bw: { type: 'bw', intensity: 1.0 },
  sepia: { type: 'sepia', intensity: 0.9 },
  neon: { type: 'neon', intensity: 0.8 },
  pixelate: { type: 'pixelate', intensity: 0.6 },
  swirl: { type: 'swirl', intensity: 0.5 },
  dog: { type: 'dog_ears' },
  cat: { type: 'cat_ears' },
  crown: { type: 'crown' },
  glasses: { type: 'sunglasses' },
  bigEyes: { type: 'big_eyes' },
  rainbow: { type: 'rainbow_vomit' },
};
