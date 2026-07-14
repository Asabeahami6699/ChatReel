import { Platform } from 'react-native';
import { ensureMicPermission } from './appAudio';

/**
 * Soft pre-flight for placing a call. Returns an error message if permissions
 * are missing, else null. Never throws.
 */
export async function ensureCallMediaPermissions(
  type: 'voice' | 'video'
): Promise<string | null> {
  try {
    const micOk = await ensureMicPermission();
    if (!micOk) {
      return 'Microphone permission is required for calls. Enable it in browser/device settings and try again.';
    }

    if (type === 'video') {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          stream.getTracks().forEach((t) => t.stop());
        } catch {
          return 'Camera permission is required for video calls. Allow camera access and try again.';
        }
      } else {
        try {
          // Lazy require — avoid crash if camera module unavailable on some builds.
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const Camera = require('expo-camera') as {
            Camera?: { requestCameraPermissionsAsync?: () => Promise<{ status: string }> };
            requestCameraPermissionsAsync?: () => Promise<{ status: string }>;
          };
          const req =
            Camera.requestCameraPermissionsAsync ??
            Camera.Camera?.requestCameraPermissionsAsync;
          if (req) {
            const { status } = await req();
            if (status !== 'granted') {
              return 'Camera permission is required for video calls. Enable it in Settings and try again.';
            }
          }
        } catch {
          /* module missing — LiveKit will prompt later */
        }
      }
    }
  } catch {
    /* soft fail — allow start; LiveKit will surface media errors */
  }
  return null;
}
