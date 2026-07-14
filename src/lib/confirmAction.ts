import { confirmToast } from './confirmToast';
import { showAppToast } from './appToast';

/**
 * On-screen confirm toast (Cancel / Confirm). Prefer this over Alert.alert / window.confirm.
 */
export function confirmAction(
  title: string,
  message: string,
  destructiveLabel = 'Delete'
): Promise<boolean> {
  const text = message?.trim() ? `${title}\n${message}` : title;
  return confirmToast({
    message: text,
    confirmLabel: destructiveLabel,
    cancelLabel: 'Cancel',
    destructive: true,
  });
}

/** On-screen error toast (replaces Alert.alert for errors). */
export function showErrorAlert(title: string, message: string): void {
  const text = message?.trim() ? `${title}: ${message}` : title;
  showAppToast(text, { isError: true, durationMs: 4500 });
}
