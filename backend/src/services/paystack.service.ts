import crypto from 'crypto';
import { env, isPaystackConfigured } from '../config/env';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import type { CoinPackageRow } from './coinPurchases.service';

type PaystackInitResponse = {
  status: boolean;
  message: string;
  data?: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
};

export type PaystackVerifiedPayment = {
  amount: number;
  currency: string;
  paid_at: string | null;
};

function paystackHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${env.paystack.secretKey}`,
    'Content-Type': 'application/json',
  };
}

export function isPaystackProviderAvailable(): boolean {
  return isPaystackConfigured();
}

export async function initializePaystackPurchase(input: {
  email: string;
  reference: string;
  package: CoinPackageRow;
  purchaseId: string;
  profileId: string;
}): Promise<{ authorization_url: string; reference: string; access_code: string }> {
  const callbackUrl = env.paystack.callbackUrl || undefined;
  const body = {
    email: input.email,
    amount: input.package.amount_minor,
    currency: input.package.currency,
    reference: input.reference,
    callback_url: callbackUrl,
    metadata: {
      profile_id: input.profileId,
      package_id: input.package.id,
      purchase_id: input.purchaseId,
      coins: input.package.coins,
      country_code: input.package.country_code,
    },
  };

  const res = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: paystackHeaders(),
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as PaystackInitResponse;
  if (!json.status || !json.data?.authorization_url) {
    await supabaseAdmin
      .from('coin_purchases')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', input.purchaseId);
    throw new Error(json.message || 'Paystack initialization failed');
  }

  return {
    authorization_url: json.data.authorization_url,
    reference: json.data.reference,
    access_code: json.data.access_code,
  };
}

export async function fetchPaystackVerifiedPayment(reference: string): Promise<PaystackVerifiedPayment> {
  if (!isPaystackConfigured()) {
    throw new Error('Paystack is not configured on the server');
  }

  const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: paystackHeaders(),
  });
  const json = (await res.json()) as {
    status: boolean;
    message: string;
    data?: {
      status: string;
      amount: number;
      currency: string;
      paid_at: string | null;
    };
  };

  if (!json.status || !json.data) {
    throw new Error(json.message || 'Could not verify payment');
  }

  if (json.data.status !== 'success') {
    throw new Error('Payment was not successful');
  }

  return {
    amount: json.data.amount,
    currency: json.data.currency,
    paid_at: json.data.paid_at,
  };
}

export function verifyPaystackWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  if (!isPaystackConfigured() || !signatureHeader) return false;
  const hash = crypto.createHmac('sha512', env.paystack.secretKey).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

export async function handlePaystackWebhookEvent(event: {
  event: string;
  data?: { reference?: string; status?: string };
}): Promise<void> {
  const { handleProviderWebhook } = await import('./coinPurchases.service');
  await handleProviderWebhook('paystack', event);
}
