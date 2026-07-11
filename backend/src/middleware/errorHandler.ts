import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  console.error('[API Error]', err);

  if (
    err &&
    typeof err === 'object' &&
    'type' in err &&
    (err as { type?: string }).type === 'entity.too.large'
  ) {
    return res.status(413).json({
      error: 'File too large for this upload method. Try a smaller file.',
    });
  }

  if (err instanceof Error && err.message.startsWith('Zod')) {
    return res.status(400).json({ error: 'Validation failed', details: err.message });
  }

  const message = err instanceof Error ? err.message : 'Internal server error';
  const status =
    err && typeof err === 'object' && 'status' in err && typeof (err as { status: unknown }).status === 'number'
      ? (err as { status: number }).status
      : 500;
  return res.status(status).json({ error: message });
}
