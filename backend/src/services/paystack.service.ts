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

export type PaystackBank = {
  name: string;
  code: string;
  type?: string;
  currency?: string;
  country?: string;
};

export type PaystackResolvedAccount = {
  account_number: string;
  account_name: string;
  bank_id?: number;
};

export type PaystackTransferRecipient = {
  recipient_code: string;
  type: string;
  name: string;
  details: {
    account_number: string;
    account_name: string | null;
    bank_code: string;
    bank_name: string | null;
  };
};

export type PaystackTransferResult = {
  transfer_code: string;
  reference: string;
  status: string;
  amount: number;
  currency: string;
};

const PAYSTACK_BANK_COUNTRY: Record<string, string> = {
  NG: 'nigeria',
  GH: 'ghana',
  KE: 'kenya',
  ZA: 'south africa',
};

export function paystackBankCountryParam(countryCode: string): string {
  return PAYSTACK_BANK_COUNTRY[countryCode.toUpperCase()] ?? 'nigeria';
}

export function paystackRecipientType(countryCode: string): 'nuban' | 'mobile_money' | 'basa' {
  switch (countryCode.toUpperCase()) {
    case 'GH':
    case 'KE':
      return 'mobile_money';
    case 'ZA':
      return 'basa';
    default:
      return 'nuban';
  }
}

export async function listPaystackBanks(input: {
  countryCode: string;
  currency: string;
}): Promise<PaystackBank[]> {
  if (!isPaystackConfigured()) {
    throw new Error('Paystack is not configured on the server');
  }
  const country = paystackBankCountryParam(input.countryCode);
  const url = new URL('https://api.paystack.co/bank');
  url.searchParams.set('country', country);
  url.searchParams.set('currency', input.currency);
  // Include mobile money providers for GH/KE
  if (input.countryCode === 'GH' || input.countryCode === 'KE') {
    url.searchParams.set('type', 'mobile_money');
  }

  const res = await fetch(url.toString(), { headers: paystackHeaders() });
  const json = (await res.json()) as {
    status: boolean;
    message: string;
    data?: PaystackBank[];
  };
  if (!json.status || !Array.isArray(json.data)) {
    throw new Error(json.message || 'Could not load banks');
  }
  if (json.data.length === 0 && (input.countryCode === 'GH' || input.countryCode === 'KE')) {
    // Retry without type filter if mobile_money list is empty
    const fallbackUrl = new URL('https://api.paystack.co/bank');
    fallbackUrl.searchParams.set('country', country);
    fallbackUrl.searchParams.set('currency', input.currency);
    const fallbackRes = await fetch(fallbackUrl.toString(), { headers: paystackHeaders() });
    const fallbackJson = (await fallbackRes.json()) as {
      status: boolean;
      message: string;
      data?: PaystackBank[];
    };
    if (fallbackJson.status && Array.isArray(fallbackJson.data)) {
      return fallbackJson.data.map((b) => ({
        name: b.name,
        code: b.code,
        type: b.type,
        currency: b.currency,
        country: b.country,
      }));
    }
  }
  return json.data.map((b) => ({
    name: b.name,
    code: b.code,
    type: b.type,
    currency: b.currency,
    country: b.country,
  }));
}

export async function resolvePaystackAccount(input: {
  accountNumber: string;
  bankCode: string;
}): Promise<PaystackResolvedAccount> {
  if (!isPaystackConfigured()) {
    throw new Error('Paystack is not configured on the server');
  }
  const url = new URL('https://api.paystack.co/bank/resolve');
  url.searchParams.set('account_number', input.accountNumber);
  url.searchParams.set('bank_code', input.bankCode);

  const res = await fetch(url.toString(), { headers: paystackHeaders() });
  const json = (await res.json()) as {
    status: boolean;
    message: string;
    data?: PaystackResolvedAccount;
  };
  if (!json.status || !json.data?.account_number) {
    throw new Error(json.message || 'Could not resolve account');
  }
  return json.data;
}

export async function createPaystackTransferRecipient(input: {
  type: 'nuban' | 'mobile_money' | 'basa';
  name: string;
  accountNumber: string;
  bankCode: string;
  currency: string;
}): Promise<PaystackTransferRecipient> {
  if (!isPaystackConfigured()) {
    throw new Error('Paystack is not configured on the server');
  }

  const res = await fetch('https://api.paystack.co/transferrecipient', {
    method: 'POST',
    headers: paystackHeaders(),
    body: JSON.stringify({
      type: input.type,
      name: input.name,
      account_number: input.accountNumber,
      bank_code: input.bankCode,
      currency: input.currency,
    }),
  });
  const json = (await res.json()) as {
    status: boolean;
    message: string;
    data?: PaystackTransferRecipient;
  };
  if (!json.status || !json.data?.recipient_code) {
    throw new Error(json.message || 'Could not create transfer recipient');
  }
  return json.data;
}

export async function initiatePaystackTransfer(input: {
  amountMinor: number;
  recipientCode: string;
  reference: string;
  reason: string;
  currency: string;
}): Promise<PaystackTransferResult> {
  if (!isPaystackConfigured()) {
    throw new Error('Paystack is not configured on the server');
  }

  const res = await fetch('https://api.paystack.co/transfer', {
    method: 'POST',
    headers: paystackHeaders(),
    body: JSON.stringify({
      source: 'balance',
      amount: input.amountMinor,
      recipient: input.recipientCode,
      reference: input.reference,
      reason: input.reason,
      currency: input.currency,
    }),
  });
  const json = (await res.json()) as {
    status: boolean;
    message: string;
    data?: {
      transfer_code: string;
      reference: string;
      status: string;
      amount: number;
      currency: string;
    };
  };
  if (!json.status || !json.data?.transfer_code) {
    throw new Error(json.message || 'Could not initiate transfer');
  }
  return {
    transfer_code: json.data.transfer_code,
    reference: json.data.reference,
    status: json.data.status,
    amount: json.data.amount,
    currency: json.data.currency,
  };
}

export async function handlePaystackWebhookEvent(event: {
  event: string;
  data?: {
    reference?: string;
    status?: string;
    transfer_code?: string;
    amount?: number;
    currency?: string;
  };
}): Promise<void> {
  if (
    event.event === 'transfer.success' ||
    event.event === 'transfer.failed' ||
    event.event === 'transfer.reversed'
  ) {
    const { handlePaystackTransferWebhook } = await import('./payouts.service');
    await handlePaystackTransferWebhook(event);
    return;
  }

  const { handleProviderWebhook } = await import('./coinPurchases.service');
  await handleProviderWebhook('paystack', event);
}
