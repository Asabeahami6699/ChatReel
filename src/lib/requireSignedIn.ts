import { confirmToast } from './confirmToast';

type RequireSignedInOptions = {
  title?: string;
  message?: string;
  onLogin: () => void;
};

/**
 * Prompt guests to sign in before protected actions.
 * Returns true when the user is already signed in (caller may proceed).
 */
export function promptSignIn(options: RequireSignedInOptions): void {
  const message = options.title
    ? `${options.title}\n${options.message ?? 'Create an account or log in to continue.'}`
    : options.message ?? 'Create an account or log in to continue.';

  void confirmToast({
    message,
    confirmLabel: 'Login',
    cancelLabel: 'Continue as guest',
    destructive: false,
  }).then((shouldLogin) => {
    if (shouldLogin) options.onLogin();
  });
}
