import type { NavigationProp, ParamListBase } from '@react-navigation/native';

/** Keep LiveKit mounted while browsing under a transparent call modal / PiP. */
export function applyCallMinimizedChrome(
  navigation: NavigationProp<ParamListBase>,
  minimized: boolean
): void {
  navigation.setOptions(
    minimized
      ? {
          presentation: 'transparentModal',
          contentStyle: { backgroundColor: 'transparent' },
          animation: 'none',
          gestureEnabled: false,
          headerShown: false,
        }
      : {
          presentation: 'fullScreenModal',
          contentStyle: { backgroundColor: '#000' },
          gestureEnabled: false,
          headerShown: false,
        }
  );
}
