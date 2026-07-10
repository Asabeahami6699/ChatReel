import { supabaseAdmin } from '../lib/supabaseAdmin';

export type GiftCatalogRow = {
  id: string;
  slug: string;
  name: string;
  emoji: string;
  coin_price: number;
  sort_order: number;
  active: boolean;
};

export type WalletAccountRow = {
  profile_id: string;
  balance_coins: number;
  lifetime_earned_coins: number;
  lifetime_spent_coins: number;
  welcome_claimed_at: string | null;
};

export type WalletLedgerRow = {
  id: string;
  profile_id: string;
  delta_coins: number;
  balance_after: number;
  entry_type: string;
  reference_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type ReelGiftRow = {
  id: string;
  reel_id: string;
  sender_profile_id: string;
  recipient_profile_id: string;
  gift_id: string;
  coin_amount: number;
  creator_coins: number;
  platform_fee_coins: number;
  idempotency_key: string;
  created_at: string;
};

export async function listGiftCatalog(): Promise<GiftCatalogRow[]> {
  const { data, error } = await supabaseAdmin
    .from('gift_catalog')
    .select('id, slug, name, emoji, coin_price, sort_order, active')
    .eq('active', true)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as GiftCatalogRow[];
}

export async function ensureWalletAccount(profileId: string): Promise<WalletAccountRow> {
  const { error: rpcErr } = await supabaseAdmin.rpc('ensure_wallet_account', {
    p_profile_id: profileId,
  });
  if (rpcErr) throw new Error(rpcErr.message);

  const { data, error } = await supabaseAdmin
    .from('wallet_accounts')
    .select('profile_id, balance_coins, lifetime_earned_coins, lifetime_spent_coins, welcome_claimed_at')
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Wallet account unavailable');
  return data as WalletAccountRow;
}

export async function getWalletBalance(profileId: string): Promise<WalletAccountRow> {
  return ensureWalletAccount(profileId);
}

export async function claimWelcomeBonus(profileId: string): Promise<{
  already_claimed: boolean;
  balance_coins: number;
  bonus_coins?: number;
}> {
  const { data, error } = await supabaseAdmin.rpc('claim_welcome_wallet_bonus', {
    p_profile_id: profileId,
    p_bonus_coins: 100,
  });
  if (error) {
    if (error.message.includes('invalid_bonus')) {
      throw new Error('Invalid welcome bonus');
    }
    throw new Error(error.message);
  }
  return data as {
    already_claimed: boolean;
    balance_coins: number;
    bonus_coins?: number;
  };
}

export async function sendReelGiftSecure(input: {
  senderProfileId: string;
  reelId: string;
  giftId: string;
  idempotencyKey: string;
}): Promise<{
  duplicate: boolean;
  gift: ReelGiftRow;
  catalog?: GiftCatalogRow;
  sender_balance_coins: number;
  recipient_balance_coins?: number;
}> {
  const { data, error } = await supabaseAdmin.rpc('send_reel_gift', {
    p_sender_profile_id: input.senderProfileId,
    p_reel_id: input.reelId,
    p_gift_id: input.giftId,
    p_idempotency_key: input.idempotencyKey,
  });

  if (error) {
    const msg = error.message ?? '';
    if (msg.includes('insufficient_coins')) throw new Error('Insufficient coins');
    if (msg.includes('cannot_gift_self')) throw new Error('You cannot gift your own reel');
    if (msg.includes('gift_not_found')) throw new Error('Gift not found');
    if (msg.includes('reel_not_found')) throw new Error('Reel not found');
    if (msg.includes('invalid_idempotency_key')) throw new Error('Invalid request');
    throw new Error(msg || 'Could not send gift');
  }

  const payload = data as {
    duplicate: boolean;
    gift: ReelGiftRow;
    catalog?: GiftCatalogRow;
    sender_balance_coins: number;
    recipient_balance_coins?: number;
  };
  return payload;
}

export async function listWalletLedger(
  profileId: string,
  limit = 30,
  cursor?: string
): Promise<{ entries: WalletLedgerRow[]; next_cursor: string | null }> {
  let query = supabaseAdmin
    .from('wallet_ledger')
    .select('id, profile_id, delta_coins, balance_after, entry_type, reference_id, metadata, created_at')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 50));

  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const entries = (data ?? []) as WalletLedgerRow[];
  const next_cursor =
    entries.length >= Math.min(limit, 50) ? entries[entries.length - 1]?.created_at ?? null : null;
  return { entries, next_cursor };
}

export async function listReelGiftsForReel(
  reelId: string,
  limit = 20
): Promise<Array<ReelGiftRow & { gift?: GiftCatalogRow; sender?: { display_name: string | null } }>> {
  const { data, error } = await supabaseAdmin
    .from('reel_gifts')
    .select(
      `
      id, reel_id, sender_profile_id, recipient_profile_id, gift_id,
      coin_amount, creator_coins, platform_fee_coins, idempotency_key, created_at,
      gift:gift_catalog(id, slug, name, emoji, coin_price),
      sender:profiles!reel_gifts_sender_profile_id_fkey(display_name)
    `
    )
    .eq('reel_id', reelId)
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 50));
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const giftRaw = r.gift;
    const senderRaw = r.sender;
    return {
      ...(r as unknown as ReelGiftRow),
      gift: Array.isArray(giftRaw) ? (giftRaw[0] as GiftCatalogRow) : (giftRaw as GiftCatalogRow),
      sender: Array.isArray(senderRaw)
        ? (senderRaw[0] as { display_name: string | null })
        : (senderRaw as { display_name: string | null }),
    };
  });
}
