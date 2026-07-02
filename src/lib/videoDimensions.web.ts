/** Read video width/height from a local file URI (web). */
export async function probeVideoDimensions(
  uri: string
): Promise<{ width: number; height: number; duration?: number } | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.playsInline = true;
    video.onloadedmetadata = () => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      const duration = Number.isFinite(video.duration) ? video.duration : undefined;
      video.removeAttribute('src');
      video.load();
      if (width > 0 && height > 0) {
        resolve({ width, height, duration });
      } else {
        resolve(null);
      }
    };
    video.onerror = () => resolve(null);
    video.src = uri;
  });
}
