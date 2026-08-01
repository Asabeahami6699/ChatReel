import crypto from 'crypto';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { env } from '../config/env';

export type Account2faRow = {
  user_id: string;
  pin_hash: string;
  pin_salt: string;
  security_question: string;
  answer_hash: string;
  answer_salt: string;
  enabled: boolean;
};

type PendingChallenge = {
  userId: string;
  session: unknown;
  user: unknown;
  question: string;
  expiresAt: number;
};

const challenges = new Map<string, PendingChallenge>();
const CHALLENGE_TTL_MS = 10 * 60 * 1000;

function hmacSecret(): string {
  return env.supabaseServiceRoleKey || 'chatreel-2fa-dev';
}

function randomSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function hashSecret(value: string, salt: string): string {
  return crypto.createHmac('sha256', hmacSecret()).update(`${salt}:${value}`).digest('hex');
}

function normalizeAnswer(answer: string): string {
  return answer.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizePin(pin: string): string {
  return pin.replace(/\D/g, '');
}

export function isValidPin(pin: string): boolean {
  const digits = normalizePin(pin);
  return digits.length >= 4 && digits.length <= 6;
}

export async function getAccount2fa(userId: string): Promise<Account2faRow | null> {
  const { data, error } = await supabaseAdmin
    .from('account_2fa')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as Account2faRow;
}

export async function isTrustedDevice(userId: string, installationId: string): Promise<boolean> {
  if (!installationId || installationId.length < 8) return false;
  const { data } = await supabaseAdmin
    .from('account_trusted_devices')
    .select('id')
    .eq('user_id', userId)
    .eq('installation_id', installationId)
    .maybeSingle();
  if (!data) return false;
  void supabaseAdmin
    .from('account_trusted_devices')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', data.id);
  return true;
}

export async function trustDevice(
  userId: string,
  installationId: string,
  label?: string
): Promise<void> {
  if (!installationId || installationId.length < 8) return;
  await supabaseAdmin.from('account_trusted_devices').upsert(
    {
      user_id: userId,
      installation_id: installationId,
      label: label?.slice(0, 80) || null,
      trusted_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,installation_id' }
  );
}

export async function enableAccount2fa(opts: {
  userId: string;
  pin: string;
  securityQuestion: string;
  securityAnswer: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isValidPin(opts.pin)) return { ok: false, error: 'Use a 4–6 digit code.' };
  const question = opts.securityQuestion.trim();
  const answer = normalizeAnswer(opts.securityAnswer);
  if (question.length < 8) return { ok: false, error: 'Security question is too short.' };
  if (answer.length < 3) return { ok: false, error: 'Security answer is too short.' };

  const pinSalt = randomSalt();
  const answerSalt = randomSalt();
  const row = {
    user_id: opts.userId,
    pin_hash: hashSecret(normalizePin(opts.pin), pinSalt),
    pin_salt: pinSalt,
    security_question: question.slice(0, 160),
    answer_hash: hashSecret(answer, answerSalt),
    answer_salt: answerSalt,
    enabled: true,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin.from('account_2fa').upsert(row, { onConflict: 'user_id' });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function disableAccount2fa(
  userId: string,
  pin: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await getAccount2fa(userId);
  if (!row?.enabled) return { ok: true };
  if (hashSecret(normalizePin(pin), row.pin_salt) !== row.pin_hash) {
    return { ok: false, error: 'Incorrect code.' };
  }
  const { error } = await supabaseAdmin
    .from('account_2fa')
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export function verifyPin(row: Account2faRow, pin: string): boolean {
  return hashSecret(normalizePin(pin), row.pin_salt) === row.pin_hash;
}

export function verifySecurityAnswer(row: Account2faRow, answer: string): boolean {
  return hashSecret(normalizeAnswer(answer), row.answer_salt) === row.answer_hash;
}

export async function resetPinWithAnswer(opts: {
  userId: string;
  answer: string;
  newPin: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await getAccount2fa(opts.userId);
  if (!row?.enabled) return { ok: false, error: '2FA is not enabled.' };
  if (!verifySecurityAnswer(row, opts.answer)) {
    return { ok: false, error: 'Security answer is incorrect.' };
  }
  if (!isValidPin(opts.newPin)) return { ok: false, error: 'Use a 4–6 digit code.' };
  const pinSalt = randomSalt();
  const { error } = await supabaseAdmin
    .from('account_2fa')
    .update({
      pin_hash: hashSecret(normalizePin(opts.newPin), pinSalt),
      pin_salt: pinSalt,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', opts.userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** After password/OTP success: either pass through session or park a 2FA challenge. */
export async function gateSessionWith2fa(opts: {
  userId: string;
  user: unknown;
  session: unknown;
  installationId?: string | null;
}): Promise<
  | { requires_2fa: false; user: unknown; session: unknown }
  | {
      requires_2fa: true;
      challenge_token: string;
      security_question: string;
    }
> {
  const row = await getAccount2fa(opts.userId);
  if (!row?.enabled) {
    return { requires_2fa: false, user: opts.user, session: opts.session };
  }
  if (opts.installationId && (await isTrustedDevice(opts.userId, opts.installationId))) {
    return { requires_2fa: false, user: opts.user, session: opts.session };
  }

  const challengeToken = crypto.randomBytes(24).toString('hex');
  challenges.set(challengeToken, {
    userId: opts.userId,
    session: opts.session,
    user: opts.user,
    question: row.security_question,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  });

  return {
    requires_2fa: true,
    challenge_token: challengeToken,
    security_question: row.security_question,
  };
}

function takeChallenge(token: string): PendingChallenge | null {
  const entry = challenges.get(token);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    challenges.delete(token);
    return null;
  }
  return entry;
}

export async function complete2faChallenge(opts: {
  challengeToken: string;
  pin: string;
  installationId?: string | null;
  deviceLabel?: string;
}): Promise<
  | { ok: true; user: unknown; session: unknown }
  | { ok: false; error: string }
> {
  const challenge = takeChallenge(opts.challengeToken);
  if (!challenge) return { ok: false, error: 'Challenge expired. Sign in again.' };
  const row = await getAccount2fa(challenge.userId);
  if (!row?.enabled) {
    challenges.delete(opts.challengeToken);
    return { ok: true, user: challenge.user, session: challenge.session };
  }
  if (!verifyPin(row, opts.pin)) return { ok: false, error: 'Incorrect code.' };
  if (opts.installationId) {
    await trustDevice(challenge.userId, opts.installationId, opts.deviceLabel);
  }
  challenges.delete(opts.challengeToken);
  return { ok: true, user: challenge.user, session: challenge.session };
}

export async function recover2faChallenge(opts: {
  challengeToken: string;
  answer: string;
  newPin: string;
  installationId?: string | null;
  deviceLabel?: string;
}): Promise<
  | { ok: true; user: unknown; session: unknown }
  | { ok: false; error: string }
> {
  const challenge = takeChallenge(opts.challengeToken);
  if (!challenge) return { ok: false, error: 'Challenge expired. Sign in again.' };
  const reset = await resetPinWithAnswer({
    userId: challenge.userId,
    answer: opts.answer,
    newPin: opts.newPin,
  });
  if (!reset.ok) return reset;
  if (opts.installationId) {
    await trustDevice(challenge.userId, opts.installationId, opts.deviceLabel);
  }
  challenges.delete(opts.challengeToken);
  return { ok: true, user: challenge.user, session: challenge.session };
}

export function peekChallengeQuestion(challengeToken: string): string | null {
  const challenge = takeChallenge(challengeToken);
  return challenge?.question ?? null;
}
