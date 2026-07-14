import { Platform } from 'react-native';
import { showAppToast } from '../../lib/appToast';

/**
 * Background blur for LiveKit local camera.
 * Full processor support lands with `@livekit/track-processors`; until then, toast.
 */
export async function toggleCallBackgroundBlur(
  _enabled: boolean
): Promise<boolean> {
  if (Platform.OS !== 'web') {
    showAppToast('Background blur is not available on this device yet');
    return false;
  }
  showAppToast('Background blur coming soon — noise suppression is already on');
  return false;
}
