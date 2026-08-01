import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, requireAuth, type AuthedRequest } from '../middleware/auth';
import {
  complete2faChallenge,
  disableAccount2fa,
  enableAccount2fa,
  getAccount2fa,
  recover2faChallenge,
  resetPinWithAnswer,
  verifySecurityAnswer,
} from '../services/account2fa.service';

const router = Router();

const enableSchema = z.object({
  pin: z.string().min(4).max(12),
  security_question: z.string().trim().min(8).max(160),
  security_answer: z.string().trim().min(3).max(120),
});

const pinSchema = z.object({
  pin: z.string().min(4).max(12),
});

const challengeVerifySchema = z.object({
  challenge_token: z.string().min(16),
  pin: z.string().min(4).max(12),
  installation_id: z.string().min(8).max(128).optional(),
  device_label: z.string().max(80).optional(),
});

const challengeRecoverSchema = z.object({
  challenge_token: z.string().min(16),
  security_answer: z.string().trim().min(3).max(120),
  new_pin: z.string().min(4).max(12),
  installation_id: z.string().min(8).max(128).optional(),
  device_label: z.string().max(80).optional(),
});

const resetSchema = z.object({
  security_answer: z.string().trim().min(3).max(120),
  new_pin: z.string().min(4).max(12),
});

const verifyAnswerSchema = z.object({
  security_answer: z.string().trim().min(3).max(120),
});

router.get(
  '/status',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const row = await getAccount2fa(req.userId!);
    return res.json({
      enabled: Boolean(row?.enabled),
      security_question: row?.enabled ? row.security_question : null,
    });
  })
);

router.post(
  '/enable',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = enableSchema.parse(req.body);
    const result = await enableAccount2fa({
      userId: req.userId!,
      pin: body.pin,
      securityQuestion: body.security_question,
      securityAnswer: body.security_answer,
    });
    if (!result.ok) return res.status(400).json({ error: result.error });
    return res.json({ ok: true, enabled: true });
  })
);

router.post(
  '/disable',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = pinSchema.parse(req.body);
    const result = await disableAccount2fa(req.userId!, body.pin);
    if (!result.ok) return res.status(400).json({ error: result.error });
    return res.json({ ok: true, enabled: false });
  })
);

router.post(
  '/reset',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = resetSchema.parse(req.body);
    const result = await resetPinWithAnswer({
      userId: req.userId!,
      answer: body.security_answer,
      newPin: body.new_pin,
    });
    if (!result.ok) return res.status(400).json({ error: result.error });
    return res.json({ ok: true });
  })
);

/** Verify security answer while logged in (e.g. reset Secret Space vault PIN). */
router.post(
  '/verify-answer',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = verifyAnswerSchema.parse(req.body);
    const row = await getAccount2fa(req.userId!);
    if (!row?.enabled) {
      return res.status(400).json({ error: 'Two-step verification is not enabled on this account.' });
    }
    if (!verifySecurityAnswer(row, body.security_answer)) {
      return res.status(401).json({ error: 'Security answer is incorrect.' });
    }
    return res.json({ ok: true, security_question: row.security_question });
  })
);

/** Unauthenticated — completes login after password/OTP when 2FA is required. */
router.post(
  '/challenge/verify',
  asyncHandler(async (req, res) => {
    const body = challengeVerifySchema.parse(req.body);
    const result = await complete2faChallenge({
      challengeToken: body.challenge_token,
      pin: body.pin,
      installationId: body.installation_id,
      deviceLabel: body.device_label,
    });
    if (!result.ok) return res.status(401).json({ error: result.error });
    return res.json({ user: result.user, session: result.session });
  })
);

router.post(
  '/challenge/recover',
  asyncHandler(async (req, res) => {
    const body = challengeRecoverSchema.parse(req.body);
    const result = await recover2faChallenge({
      challengeToken: body.challenge_token,
      answer: body.security_answer,
      newPin: body.new_pin,
      installationId: body.installation_id,
      deviceLabel: body.device_label,
    });
    if (!result.ok) return res.status(401).json({ error: result.error });
    return res.json({ user: result.user, session: result.session });
  })
);

export default router;
