import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin';

export type AuthedRequest = Request & {
  userId?: string;
  accessToken?: string;
};

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = header.slice(7);
  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.userId = data.user.id;
  req.accessToken = token;
  next();
}

/** Resolve profiles.id from auth user id */
export async function getProfileIdByUserId(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.id ?? null;
}

export function asyncHandler(
  fn: (req: AuthedRequest, res: Response, next: NextFunction) => Promise<void | Response>
) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
