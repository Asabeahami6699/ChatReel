import crypto from 'crypto';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { ensureWalletAccount } from './gifts.service';
import {
  currencyForCountry,
  paymentProviderForCountry,
  resolveCountryCode,
  type PaymentProvider,
} from './countryCodes';
import {
  initializePaystackPurchase,
  isPaystackProviderAvailable,
  fetchPaystackVerifiedPayment,
} from './paystack.service';

export type CoinPackageRow = {
  id: string;
  slug: string;
  label: string;
  coins: number;
  amount_minor: number;
  currency: string;
  country_code: string;
  sort_order: number;
};

export type CoinPackagesResult = {
  packages: CoinPackageRow[];
  resolved_country: string;
  currency: string;
  payment_provider: PaymentProvider;
  fallback_used: boolean;
};

async function getProfileCountry(profileId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('country')
    .eq('id', profileId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return resolveCountryCode(data?.country);
}

async function listPackagesByCountry(countryCode: string): Promise<CoinPackageRow[]> {
  const withCountry = await supabaseAdmin
    .from('coin_packages')
    .select('id, slug, label, coins, amount_minor, currency, country_code, sort_order')
    .eq('active', true)
    .eq('country_code', countryCode)
    .order('sort_order', { ascending: true });

  if (!withCountry.error) {
    return (withCountry.data ?? []) as CoinPackageRow[];
  }

  const msg = withCountry.error.message ?? '';
  const missingColumn =
    withCountry.error.code === '42703' || msg.toLowerCase().includes('country_code');
  const missingTable =
    withCountry.error.code === '42P01' || msg.toLowerCase().includes('coin_packages');

  if (missingTable) {
    throw new Error('Coin shop is not set up yet. Apply Supabase migrations 028–030.');
  }

  if (missingColumn) {
    const legacy = await supabaseAdmin
      .from('coin_packages')
      .select('id, slug, label, coins, amount_minor, currency, sort_order')
      .eq('active', true)
      .order('sort_order', { ascending: true });
    if (legacy.error) throw new Error(legacy.error.message);
    return (legacy.data ?? []).map((row) => ({
      ...(row as Omit<CoinPackageRow, 'country_code'>),
      country_code: 'NG',
    }));
  }

  throw new Error(withCountry.error.message);
}

export async function listCoinPackagesForProfile(profileId: string): Promise<CoinPackagesResult> {
  const resolvedCountry = await getProfileCountry(profileId);
  let packages = await listPackagesByCountry(resolvedCountry);
  let fallbackUsed = false;

  if (packages.length === 0 && resolvedCountry !== 'NG') {
    packages = await listPackagesByCountry('NG');
    fallbackUsed = packages.length > 0;
  }

  if (packages.length === 0) {
    const all = await supabaseAdmin
      .from('coin_packages')
      .select('id, slug, label, coins, amount_minor, currency, country_code, sort_order')
      .eq('active', true)
      .order('sort_order', { ascending: true });
    if (!all.error && (all.data?.length ?? 0) > 0) {
      packages = all.data as CoinPackageRow[];
      fallbackUsed = true;
    }
  }

  const paymentProvider = paymentProviderForCountry(fallbackUsed ? 'NG' : resolvedCountry);
  const activeCountry = fallbackUsed ? 'NG' : resolvedCountry;
  const currency = packages[0]?.currency ?? currencyForCountry(activeCountry);

  return {
    packages,
    resolved_country: resolvedCountry,
    currency,
    payment_provider: paymentProvider,
    fallback_used: fallbackUsed,
  };
}

export async function getCoinPackageById(packageId: string): Promise<CoinPackageRow | null> {
  const { data, error } = await supabaseAdmin
    .from('coin_packages')
    .select('id, slug, label, coins, amount_minor, currency, country_code, sort_order')
    .eq('id', packageId)
    .eq('active', true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CoinPackageRow | null) ?? null;
}

function makePaymentReference(profileId: string, provider: PaymentProvider): string {
  const prefix = provider === 'paystack' ? 'cr' : 'cs';
  const rand = crypto.randomBytes(6).toString('hex');
  return `${prefix}_${profileId.slice(0, 8)}_${Date.now()}_${rand}`;
}

export async function initializeCoinPurchase(input: {
  profileId: string;
  email: string;
  packageId: string;
}): Promise<{
  authorization_url: string;
  reference: string;
  access_code: string;
  payment_provider: PaymentProvider;
}> {
  const pkg = await getCoinPackageById(input.packageId);
  if (!pkg) throw new Error('Coin package not found');

  const profileCountry = await getProfileCountry(input.profileId);
  const { packages, fallback_used: fallbackUsed } = await listCoinPackagesForProfile(input.profileId);
  const allowedIds = new Set(packages.map((p) => p.id));
  if (!allowedIds.has(pkg.id)) {
    throw new Error('Coin package is not available in your country');
  }

  const countryForProvider = fallbackUsed ? 'NG' : profileCountry;
  const provider = paymentProviderForCountry(countryForProvider);

  if (provider === 'stripe') {
    throw new Error('Card checkout for your region is coming soon');
  }
  if (!isPaystackProviderAvailable()) {
    throw new Error('Paystack is not configured on the server');
  }

  const reference = makePaymentReference(input.profileId, provider);

  const { data: purchase, error: insertErr } = await supabaseAdmin
    .from('coin_purchases')
    .insert({
      profile_id: input.profileId,
      package_id: pkg.id,
      payment_provider: provider,
      payment_reference: reference,
      amount_minor: pkg.amount_minor,
      currency: pkg.currency,
      coins: pkg.coins,
      status: 'pending',
    })
    .select('id')
    .single();
  if (insertErr) throw new Error(insertErr.message);

  const checkout = await initializePaystackPurchase({
    email: input.email,
    reference,
    package: pkg,
    purchaseId: purchase.id as string,
    profileId: input.profileId,
  });

  return { ...checkout, payment_provider: provider };
}

export async function verifyCoinPurchase(reference: string): Promise<{
  completed: boolean;
  already_completed: boolean;
  balance_coins: number;
  coins_credited: number;
}> {
  const { data: purchase, error: purchaseErr } = await supabaseAdmin
    .from('coin_purchases')
    .select('*')
    .eq('payment_reference', reference)
    .maybeSingle();
  if (purchaseErr) throw new Error(purchaseErr.message);
  if (!purchase) throw new Error('Purchase not found');

  const provider = purchase.payment_provider as PaymentProvider;

  if (purchase.status === 'completed') {
    return completeCoinPurchaseCredit({ purchase, reference });
  }

  if (provider === 'paystack') {
    try {
      const verified = await fetchPaystackVerifiedPayment(reference);
      if (verified.amount !== purchase.amount_minor) {
        throw new Error('Payment amount mismatch');
      }
      return completeCoinPurchaseCredit({
        purchase,
        reference,
        paidAt: verified.paid_at,
        providerMetadata: { paystack_reference: reference },
      });
    } catch (err) {
      await supabaseAdmin
        .from('coin_purchases')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', purchase.id as string);
      throw err;
    }
  }

  throw new Error(`Unsupported payment provider: ${provider}`);
}

export async function completeCoinPurchaseCredit(input: {
  purchase: Record<string, unknown>;
  reference: string;
  paidAt?: string | null;
  providerMetadata?: Record<string, unknown>;
}): Promise<{
  completed: boolean;
  already_completed: boolean;
  balance_coins: number;
  coins_credited: number;
}> {
  const purchase = input.purchase;
  const purchaseId = purchase.id as string;
  const profileId = purchase.profile_id as string;
  const coins = purchase.coins as number;

  if (purchase.status === 'completed') {
    const wallet = await ensureWalletAccount(profileId);
    return {
      completed: true,
      already_completed: true,
      balance_coins: wallet.balance_coins,
      coins_credited: coins,
    };
  }

  const provider = purchase.payment_provider as PaymentProvider;
  const idempotencyKey = `purchase:${provider}:${input.reference}`;

  const { error: rpcErr } = await supabaseAdmin.rpc('apply_wallet_entry', {
    p_profile_id: profileId,
    p_delta: coins,
    p_entry_type: 'purchase',
    p_reference_id: purchaseId,
    p_idempotency_key: idempotencyKey,
    p_metadata: {
      payment_reference: input.reference,
      payment_provider: provider,
      package_id: purchase.package_id,
      amount_minor: purchase.amount_minor,
      currency: purchase.currency,
      ...input.providerMetadata,
    },
  });
  if (rpcErr && !rpcErr.message.includes('duplicate')) {
    throw new Error(rpcErr.message);
  }

  await supabaseAdmin
    .from('coin_purchases')
    .update({
      status: 'completed',
      paid_at: input.paidAt ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', purchaseId);

  const wallet = await ensureWalletAccount(profileId);
  return {
    completed: true,
    already_completed: false,
    balance_coins: wallet.balance_coins,
    coins_credited: coins,
  };
}

export async function handleProviderWebhook(
  provider: PaymentProvider,
  event: { event: string; data?: { reference?: string; status?: string } }
): Promise<void> {
  if (provider === 'paystack') {
    if (event.event !== 'charge.success') return;
    const reference = event.data?.reference;
    if (!reference || event.data?.status !== 'success') return;
    await verifyCoinPurchase(reference);
  }
}
