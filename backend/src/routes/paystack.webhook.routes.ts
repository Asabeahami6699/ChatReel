import { Router } from 'express';
import express from 'express';
import { asyncHandler } from '../middleware/auth';
import {
  handlePaystackWebhookEvent,
  verifyPaystackWebhookSignature,
} from '../services/paystack.service';

/** Mount this router BEFORE express.json() in app.ts */
const router = Router();

router.post(
  '/paystack/webhook',
  express.raw({ type: 'application/json' }),
  asyncHandler(async (req, res) => {
    const rawBody = req.body as Buffer;
    const signature = req.headers['x-paystack-signature'] as string | undefined;
    if (!verifyPaystackWebhookSignature(rawBody, signature)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
    const event = JSON.parse(rawBody.toString('utf8')) as {
      event: string;
      data?: { reference?: string; status?: string };
    };
    await handlePaystackWebhookEvent(event);
    return res.sendStatus(200);
  })
);

export default router;
