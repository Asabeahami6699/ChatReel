/**
 * Native / non-web stub. Real WebGL pipeline lives in filterPipeline.web.ts.
 */
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
  recorder: { state: string; stop: () => void };
  stop: () => Promise<Blob>;
};

export type FilterState = {
  isLoaded: boolean;
  isRunning: boolean;
  filter: FilterConfig;
  fps: number;
  faceDetected: boolean;
};

export class FilterPipeline {
  constructor(_width = 640, _height = 480) {}
  async load() {}
  getOutputCanvas(): null {
    return null;
  }
  setSize(_w: number, _h: number) {}
  setFilter(_config: FilterConfig) {}
  getFilter(): FilterConfig {
    return { type: 'none' };
  }
  start(_video: unknown) {}
  stop() {}
  async filterImage(
    _image: unknown,
    _filter?: FilterConfig
  ): Promise<FilterSnapshot> {
    throw new Error('FilterPipeline is web-only');
  }
  renderSource(_source: unknown) {}
  snapshot(): Promise<FilterSnapshot> {
    return Promise.reject(new Error('FilterPipeline is web-only'));
  }
  startRecording(_audioStream?: MediaStream): FilterRecording {
    throw new Error('FilterPipeline is web-only');
  }
  getState(): FilterState {
    return {
      isLoaded: false,
      isRunning: false,
      filter: { type: 'none' },
      fps: 0,
      faceDetected: false,
    };
  }
  destroy() {}
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
