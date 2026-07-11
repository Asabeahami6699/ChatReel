type ConfirmToastRequest = {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type PendingConfirm = ConfirmToastRequest & {
  resolve: (confirmed: boolean) => void;
};

type Listener = (pending: PendingConfirm | null) => void;

let pending: PendingConfirm | null = null;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l(pending));
}

/** Show a toast with Cancel / Confirm. Resolves true if user confirms. */
export function confirmToast(request: ConfirmToastRequest): Promise<boolean> {
  return new Promise((resolve) => {
    if (pending) {
      pending.resolve(false);
    }
    pending = {
      message: request.message,
      confirmLabel: request.confirmLabel ?? 'Delete',
      cancelLabel: request.cancelLabel ?? 'Cancel',
      destructive: request.destructive !== false,
      resolve,
    };
    emit();
  });
}

export function answerConfirmToast(confirmed: boolean): void {
  if (!pending) return;
  const current = pending;
  pending = null;
  emit();
  current.resolve(confirmed);
}

export function subscribeConfirmToast(listener: Listener): () => void {
  listeners.add(listener);
  listener(pending);
  return () => listeners.delete(listener);
}
