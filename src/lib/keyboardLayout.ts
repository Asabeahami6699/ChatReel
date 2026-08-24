/**
 * Central keyboard helpers — use KeyboardSafeScreen (forms) and KeyboardStickyFooter (chat/composers).
 * Powered by react-native-keyboard-controller (KeyboardProvider in App.tsx).
 */
export { KeyboardSafeScreen } from '../components/KeyboardSafeScreen';
export { KeyboardStickyFooter } from '../components/KeyboardStickyFooter';

export {
  KeyboardAvoidingView,
  KeyboardAwareScrollView,
  KeyboardStickyView,
  useResizeMode,
} from 'react-native-keyboard-controller';
