import { Alert, Platform } from 'react-native';

/** Cross-platform confirm dialog (Alert is unreliable on web). */
export function confirmAction(
  title: string,
  message: string,
  destructiveLabel = 'Delete'
): Promise<boolean> {
  if (Platform.OS === 'web') {
    const text = message ? `${title}\n\n${message}` : title;
    return Promise.resolve(globalThis.confirm?.(text) ?? true);
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: destructiveLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

/** Cross-platform error alert. */
export function showErrorAlert(title: string, message: string): void {
  if (Platform.OS === 'web') {
    globalThis.alert?.(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}
