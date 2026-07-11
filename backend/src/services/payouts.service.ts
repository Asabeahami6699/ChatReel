import { supabaseAdmin } from '../lib/supabaseAdmin';
import { resolveCountryCode, type SupportedCountryCode } from './countryCodes';
import { ensureWalletAccount, getWalletBalance } from './gifts.service';
import {
  createPaystackTransferRecipient,
  initiatePaystackTransfer,
  isPaystackProviderAvailable,
  listPaystackBanks,
  paystackRecipientType,
  resolvePaystackAccount,
  type PaystackBank,
} from './paystack.service';

export type PayoutThresholdRow = {
  country_code: string;
  currency: string;
  min_amount_minor: number;
  coin_to_fiat_minor: number;
  fee_flat_minor: number;
  fee_bps: number;
  active: boolean;
};

export type PayoutRecipientRow = {
  id: string;
  profile_id: string;
  country_code: string;
  currency: string;
  recipient_type: string;
  account_name: string;
  account_number: string;
  bank_code: string;
  bank_name: string | null;
  paystack_recipient_code: string;
  active: boolean;
  created_at: string;
};

export type PayoutRequestRow = {
  id: string;
  profile_id: string;
  recipient_id: string;
  amount_coins: number;
  amount_minor: number;
  fee_minor: number;
  net_amount_minor: number;
  currency: string;
  country_code: string;
  status: string;
  paystack_transfer_code: string | null;
  paystack_transfer_reference: string | null;
  idempotency_key: string;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
};

function maskAccountNumber(accountNumber: string): string {
  const digits = accountNumber.replace(/\s+/g, '');
  if (digits.length <= 4) return digits;
  return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

function publicRecipient(row: PayoutRecipientRow) {
  return {
    id: row.id,
    country_code: row.country_code,
    currency: row.currency,
    recipient_type: row.recipient_type,
    account_name: row.account_name,
    account_number_masked: maskAccountNumber(row.account_number),
    bank_code: row.bank_code,
    bank_name: row.bank_name,
    created_at: row.created_at,
  };
}

async function getProfileCountry(profileId: string): Promise<SupportedCountryCode> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('country')
    .eq('id', profileId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return resolveCountryCode(data?.country);
}

export async function getPayoutThreshold(countryCode: string): Promise<PayoutThresholdRow> {
  const { data, error } = await supabaseAdmin
    .from('payout_thresholds')
    .select(
      'country_code, currency, min_amount_minor, coin_to_fiat_minor, fee_flat_minor, fee_bps, active'
    )
    .eq('country_code', countryCode)
    .eq('active', true)
    .maybeSingle();
  if (error) {
    if (error.code === '42P01' || error.message.toLowerCase().includes('payout_thresholds')) {
      throw new Error('Cash-out is not set up yet. Apply Supabase migration 031.');
    }
    throw new Error(error.message);
  }
  if (!data) throw new Error('Cash-out is not available in your country yet');
  return data as PayoutThresholdRow;
}

export function computePayoutQuote(input: {
  amountCoins: number;
  threshold: PayoutThresholdRow;
}): {
  amount_coins: number;
  amount_minor: number;
  fee_minor: number;
  net_amount_minor: number;
  currency: string;
  min_amount_minor: number;
  min_coins: number;
  meets_threshold: boolean;
} {
  const amountCoins = Math.floor(input.amountCoins);
  if (!Number.isFinite(amountCoins) || amountCoins <= 0) {
    throw new Error('Enter a valid coin amount');
  }

  const amountMinor = amountCoins * input.threshold.coin_to_fiat_minor;
  const feeMinor =
    input.threshold.fee_flat_minor + Math.floor((amountMinor * input.threshold.fee_bps) / 10_000);
  const netAmountMinor = amountMinor - feeMinor;
  if (netAmountMinor <= 0) {
    throw new Error('Amount is too small after fees');
  }

  const minCoins = Math.ceil(input.threshold.min_amount_minor / input.threshold.coin_to_fiat_minor);

  return {
    amount_coins: amountCoins,
    amount_minor: amountMinor,
    fee_minor: feeMinor,
    net_amount_minor: netAmountMinor,
    currency: input.threshold.currency,
    min_amount_minor: input.threshold.min_amount_minor,
    min_coins: minCoins,
    meets_threshold: amountMinor >= input.threshold.min_amount_minor,
  };
}

export async function getPayoutEligibility(profileId: string) {
  await ensureWalletAccount(profileId);
  const country = await getProfileCountry(profileId);
  const threshold = await getPayoutThreshold(country);
  const wallet = await getWalletBalance(profileId);
  const cashable = wallet.cashable_coins ?? 0;
  const minCoins = Math.ceil(threshold.min_amount_minor / threshold.coin_to_fiat_minor);
  const quote =
    cashable > 0
      ? computePayoutQuote({ amountCoins: cashable, threshold })
      : {
          amount_coins: 0,
          amount_minor: 0,
          fee_minor: 0,
          net_amount_minor: 0,
          currency: threshold.currency,
          min_amount_minor: threshold.min_amount_minor,
          min_coins: minCoins,
          meets_threshold: false,
        };

  const { data: openPayout } = await supabaseAdmin
    .from('payout_requests')
    .select('id, status, amount_coins, created_at')
    .eq('profile_id', profileId)
    .in('status', ['pending', 'processing'])
    .maybeSingle();

  return {
    country_code: country,
    currency: threshold.currency,
    cashable_coins: cashable,
    balance_coins: wallet.balance_coins,
    min_amount_minor: threshold.min_amount_minor,
    min_coins: minCoins,
    coin_to_fiat_minor: threshold.coin_to_fiat_minor,
    fee_flat_minor: threshold.fee_flat_minor,
    fee_bps: threshold.fee_bps,
    can_cash_out:
      isPaystackProviderAvailable() &&
      cashable >= minCoins &&
      !openPayout &&
      quote.meets_threshold,
    open_payout: openPayout ?? null,
    max_quote: quote,
    paystack_ready: isPaystackProviderAvailable(),
  };
}

export async function listPayoutBanksForProfile(profileId: string): Promise<{
  country_code: string;
  currency: string;
  recipient_type: string;
  banks: PaystackBank[];
}> {
  if (!isPaystackProviderAvailable()) {
    throw new Error('Paystack is not configured on the server');
  }
  const country = await getProfileCountry(profileId);
  const threshold = await getPayoutThreshold(country);
  const banks = await listPaystackBanks({
    countryCode: country,
    currency: threshold.currency,
  });
  return {
    country_code: country,
    currency: threshold.currency,
    recipient_type: paystackRecipientType(country),
    banks,
  };
}

export async function listPayoutRecipients(profileId: string) {
  const { data, error } = await supabaseAdmin
    .from('payout_recipients')
    .select(
      'id, profile_id, country_code, currency, recipient_type, account_name, account_number, bank_code, bank_name, paystack_recipient_code, active, created_at'
    )
    .eq('profile_id', profileId)
    .eq('active', true)
    .order('created_at', { ascending: false });
  if (error) {
    if (error.code === '42P01') {
      throw new Error('Cash-out is not set up yet. Apply Supabase migration 031.');
    }
    throw new Error(error.message);
  }
  return ((data ?? []) as PayoutRecipientRow[]).map(publicRecipient);
}

export async function createPayoutRecipient(input: {
  profileId: string;
  accountNumber: string;
  bankCode: string;
  bankName?: string;
  accountName?: string;
}) {
  if (!isPaystackProviderAvailable()) {
    throw new Error('Paystack is not configured on the server');
  }

  const country = await getProfileCountry(input.profileId);
  const threshold = await getPayoutThreshold(country);
  const recipientType = paystackRecipientType(country);
  const accountNumber = input.accountNumber.replace(/\s+/g, '');

  let accountName = input.accountName?.trim() || '';
  // Account resolve is most reliable for Nigerian NUBAN.
  if (recipientType === 'nuban') {
    const resolved = await resolvePaystackAccount({
      accountNumber,
      bankCode: input.bankCode,
    });
    accountName = resolved.account_name || accountName;
  }
  if (!accountName) {
    throw new Error('Account name is required');
  }

  const paystackRecipient = await createPaystackTransferRecipient({
    type: recipientType,
    name: accountName,
    accountNumber,
    bankCode: input.bankCode,
    currency: threshold.currency,
  });

  const { data: existing } = await supabaseAdmin
    .from('payout_recipients')
    .select('id')
    .eq('profile_id', input.profileId)
    .eq('account_number', accountNumber)
    .eq('bank_code', input.bankCode)
    .eq('active', true)
    .maybeSingle();

  if (existing?.id) {
    const { data, error } = await supabaseAdmin
      .from('payout_recipients')
      .update({
        account_name: accountName,
        bank_name: input.bankName ?? paystackRecipient.details.bank_name,
        paystack_recipient_code: paystackRecipient.recipient_code,
        currency: threshold.currency,
        country_code: country,
        recipient_type: recipientType,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select(
        'id, profile_id, country_code, currency, recipient_type, account_name, account_number, bank_code, bank_name, paystack_recipient_code, active, created_at'
      )
      .single();
    if (error) throw new Error(error.message);
    return publicRecipient(data as PayoutRecipientRow);
  }

  const { data, error } = await supabaseAdmin
    .from('payout_recipients')
    .insert({
      profile_id: input.profileId,
      country_code: country,
      currency: threshold.currency,
      recipient_type: recipientType,
      account_name: accountName,
      account_number: accountNumber,
      bank_code: input.bankCode,
      bank_name: input.bankName ?? paystackRecipient.details.bank_name,
      paystack_recipient_code: paystackRecipient.recipient_code,
    })
    .select(
      'id, profile_id, country_code, currency, recipient_type, account_name, account_number, bank_code, bank_name, paystack_recipient_code, active, created_at'
    )
    .single();
  if (error) throw new Error(error.message);
  return publicRecipient(data as PayoutRecipientRow);
}

export async function requestPayout(input: {
  profileId: string;
  recipientId: string;
  amountCoins: number;
  idempotencyKey: string;
}) {
  if (!isPaystackProviderAvailable()) {
    throw new Error('Paystack is not configured on the server');
  }

  const country = await getProfileCountry(input.profileId);
  const threshold = await getPayoutThreshold(country);
  const quote = computePayoutQuote({
    amountCoins: input.amountCoins,
    threshold,
  });
  if (!quote.meets_threshold) {
    throw new Error(
      `Minimum cash-out is ${quote.min_coins.toLocaleString()} coins (${formatMinor(quote.min_amount_minor, quote.currency)})`
    );
  }

  const wallet = await getWalletBalance(input.profileId);
  if ((wallet.cashable_coins ?? 0) < quote.amount_coins) {
    throw new Error('Not enough cashable coins (gift earnings only)');
  }

  const { data: recipient, error: recipientErr } = await supabaseAdmin
    .from('payout_recipients')
    .select(
      'id, profile_id, country_code, currency, recipient_type, account_name, account_number, bank_code, bank_name, paystack_recipient_code, active, created_at'
    )
    .eq('id', input.recipientId)
    .eq('profile_id', input.profileId)
    .eq('active', true)
    .maybeSingle();
  if (recipientErr) throw new Error(recipientErr.message);
  if (!recipient) throw new Error('Payout recipient not found');
  if (recipient.country_code !== country) {
    throw new Error('Recipient country does not match your profile country');
  }

  const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('request_wallet_payout', {
    p_profile_id: input.profileId,
    p_recipient_id: input.recipientId,
    p_amount_coins: quote.amount_coins,
    p_amount_minor: quote.amount_minor,
    p_fee_minor: quote.fee_minor,
    p_net_amount_minor: quote.net_amount_minor,
    p_currency: quote.currency,
    p_country_code: country,
    p_idempotency_key: input.idempotencyKey,
    p_metadata: {
      fee_bps: threshold.fee_bps,
      coin_to_fiat_minor: threshold.coin_to_fiat_minor,
    },
  });

  if (rpcError) {
    const msg = rpcError.message ?? '';
    if (msg.includes('insufficient_cashable_coins')) {
      throw new Error('Not enough cashable coins (gift earnings only)');
    }
    if (msg.includes('insufficient_coins')) throw new Error('Insufficient coins');
    if (msg.includes('payout_already_pending')) {
      throw new Error('You already have a cash-out in progress');
    }
    if (msg.includes('recipient_not_found')) throw new Error('Payout recipient not found');
    throw new Error(msg || 'Could not create payout');
  }

  const result = rpcData as {
    duplicate: boolean;
    payout: PayoutRequestRow;
    balance_coins: number;
    cashable_coins: number;
  };

  if (result.duplicate) {
    return {
      duplicate: true,
      payout: result.payout,
      balance_coins: result.balance_coins,
      cashable_coins: result.cashable_coins,
    };
  }

  const transferReference = `payout_${result.payout.id.replace(/-/g, '').slice(0, 24)}`;

  try {
    const transfer = await initiatePaystackTransfer({
      amountMinor: quote.net_amount_minor,
      recipientCode: (recipient as PayoutRecipientRow).paystack_recipient_code,
      reference: transferReference,
      reason: 'ChatReel creator cash-out',
      currency: quote.currency,
    });

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('payout_requests')
      .update({
        status: transfer.status === 'success' ? 'paid' : 'processing',
        paystack_transfer_code: transfer.transfer_code,
        paystack_transfer_reference: transfer.reference,
        updated_at: new Date().toISOString(),
      })
      .eq('id', result.payout.id)
      .select(
        'id, profile_id, recipient_id, amount_coins, amount_minor, fee_minor, net_amount_minor, currency, country_code, status, paystack_transfer_code, paystack_transfer_reference, idempotency_key, failure_reason, created_at, updated_at'
      )
      .single();
    if (updateErr) throw new Error(updateErr.message);

    return {
      duplicate: false,
      payout: updated as PayoutRequestRow,
      balance_coins: result.balance_coins,
      cashable_coins: result.cashable_coins,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Transfer initiation failed';
    await refundFailedPayout(result.payout.id, reason);
    throw new Error(reason);
  }
}

async function refundFailedPayout(payoutId: string, reason: string) {
  const { error } = await supabaseAdmin.rpc('refund_wallet_payout', {
    p_payout_id: payoutId,
    p_failure_reason: reason,
  });
  if (error) {
    console.error('[payouts] refund failed', payoutId, error.message);
  }
}

export async function listPayoutRequests(profileId: string, limit = 20) {
  const { data, error } = await supabaseAdmin
    .from('payout_requests')
    .select(
      'id, profile_id, recipient_id, amount_coins, amount_minor, fee_minor, net_amount_minor, currency, country_code, status, paystack_transfer_code, paystack_transfer_reference, idempotency_key, failure_reason, created_at, updated_at'
    )
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 50));
  if (error) {
    if (error.code === '42P01') return [];
    throw new Error(error.message);
  }
  return (data ?? []) as PayoutRequestRow[];
}

export async function handlePaystackTransferWebhook(event: {
  event: string;
  data?: {
    reference?: string;
    status?: string;
    transfer_code?: string;
  };
}): Promise<void> {
  const reference = event.data?.reference;
  const transferCode = event.data?.transfer_code;
  if (!reference && !transferCode) return;

  let query = supabaseAdmin
    .from('payout_requests')
    .select(
      'id, profile_id, status, amount_coins, paystack_transfer_reference, paystack_transfer_code'
    )
    .in('status', ['pending', 'processing']);

  if (reference) {
    query = query.eq('paystack_transfer_reference', reference);
  } else if (transferCode) {
    query = query.eq('paystack_transfer_code', transferCode);
  }

  const { data: payout, error } = await query.maybeSingle();
  if (error || !payout) return;

  if (event.event === 'transfer.success') {
    await supabaseAdmin
      .from('payout_requests')
      .update({ status: 'paid', updated_at: new Date().toISOString() })
      .eq('id', payout.id)
      .in('status', ['pending', 'processing']);
    return;
  }

  if (event.event === 'transfer.failed' || event.event === 'transfer.reversed') {
    await refundFailedPayout(
      payout.id,
      event.event === 'transfer.reversed' ? 'Transfer reversed' : 'Transfer failed'
    );
  }
}

function formatMinor(amountMinor: number, currency: string): string {
  const major = amountMinor / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(major);
  } catch {
    return `${currency} ${major.toFixed(2)}`;
  }
}

export { maskAccountNumber };
