import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, type PayoutRequestDTO, type WalletLedgerEntryDTO } from '../../lib/api';
import { useWallet } from '../../hooks/useWallet';
import { useReelPlaybackGate } from '../../hooks/useReelPlaybackGate';
import type { ReelsStackParamList } from '../../navigation/reelsNavigation';
import { REEL_ACCENT } from './reelTheme';
import { ReelBuyCoinsSheet } from './ReelBuyCoinsSheet';
import { ReelCashOutSheet } from './ReelCashOutSheet';

function formatEntryType(type: string): string {
  switch (type) {
    case 'welcome_bonus':
      return 'Welcome bonus';
    case 'gift_sent':
      return 'Gift sent';
    case 'gift_received':
      return 'Gift received';
    case 'purchase':
      return 'Coin purchase';
    case 'payout':
      return 'Cash out';
    case 'refund':
      return 'Refund';
    default:
      return type.replace(/_/g, ' ');
  }
}

function formatMinor(amountMinor: number, currency: string): string {
  const major = amountMinor / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(major);
  } catch {
    return `${currency} ${(amountMinor / 100).toFixed(2)}`;
  }
}

function payoutStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'processing':
      return 'Processing';
    case 'paid':
      return 'Paid';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status;
  }
}

export default function ReelCreatorWalletScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<ReelsStackParamList>>();
  const { wallet, loading, refresh, setBalanceCoins } = useWallet(true);
  const [entries, setEntries] = useState<WalletLedgerEntryDTO[]>([]);
  const [payouts, setPayouts] = useState<PayoutRequestDTO[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [cashOutOpen, setCashOutOpen] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const [eligMeta, setEligMeta] = useState<string | null>(null);

  useReelPlaybackGate('creator-wallet', true);

  const loadExtras = useCallback(async () => {
    setLedgerLoading(true);
    try {
      const [ledgerRes, payoutRes, elig] = await Promise.all([
        api.wallet.ledger({ limit: 40 }),
        api.wallet.payoutHistory(20).catch(() => ({ payouts: [] as PayoutRequestDTO[] })),
        api.wallet.payoutEligibility().catch(() => null),
      ]);
      setEntries(ledgerRes.entries);
      setPayouts(payoutRes.payouts);
      if (elig) {
        setEligMeta(
          `Min cash-out ${elig.min_coins.toLocaleString()} coins · ${elig.country_code} · ${elig.currency}`
        );
      }
    } catch {
      setEntries([]);
      setPayouts([]);
    } finally {
      setLedgerLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadExtras();
  }, [loadExtras, wallet.balance_coins, wallet.cashable_coins]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={10}
        >
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Creator wallet</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => void refresh()} hitSlop={10}>
          <Ionicons name="refresh" size={20} color="#888" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.balanceCard}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.balanceLabel}>Available balance</Text>
              <Text style={styles.balanceCoins}>{wallet.balance_coins.toLocaleString()} coins</Text>
              <View style={styles.statRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{wallet.cashable_coins ?? 0}</Text>
                  <Text style={styles.statLabel}>Cashable</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{wallet.lifetime_earned_coins}</Text>
                  <Text style={styles.statLabel}>Earned</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{wallet.lifetime_spent_coins}</Text>
                  <Text style={styles.statLabel}>Spent</Text>
                </View>
              </View>
              <Text style={styles.hint}>
                Cashable coins come from gifts you receive. Purchased and welcome coins stay in-app
                for gifting.
              </Text>
              {eligMeta ? <Text style={styles.eligMeta}>{eligMeta}</Text> : null}
            </>
          )}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => setCashOutOpen(true)}>
            <Ionicons name="cash-outline" size={18} color="#000" />
            <Text style={styles.primaryBtnText}>Cash out</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => setBuyOpen(true)}>
            <Ionicons name="add-circle-outline" size={18} color="#fff" />
            <Text style={styles.secondaryBtnText}>Buy coins</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Cash-out history</Text>
        {payouts.length === 0 ? (
          <Text style={styles.empty}>No cash-outs yet</Text>
        ) : (
          payouts.map((p) => (
            <View key={p.id} style={styles.row}>
              <View style={styles.rowLeft}>
                <Text style={styles.rowTitle}>
                  {p.amount_coins.toLocaleString()} coins →{' '}
                  {formatMinor(p.net_amount_minor, p.currency)}
                </Text>
                <Text style={styles.rowSub}>
                  {payoutStatusLabel(p.status)} · {new Date(p.created_at).toLocaleString()}
                </Text>
                {p.failure_reason ? (
                  <Text style={styles.rowFail}>{p.failure_reason}</Text>
                ) : null}
              </View>
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>Wallet activity</Text>
        {ledgerLoading && entries.length === 0 ? (
          <ActivityIndicator color="#666" style={{ marginVertical: 12 }} />
        ) : entries.length === 0 ? (
          <Text style={styles.empty}>No wallet activity yet</Text>
        ) : (
          entries.map((entry) => (
            <View key={entry.id} style={styles.row}>
              <View style={styles.rowLeft}>
                <Text style={styles.rowTitle}>{formatEntryType(entry.entry_type)}</Text>
                <Text style={styles.rowSub}>{new Date(entry.created_at).toLocaleString()}</Text>
              </View>
              <Text
                style={[
                  styles.delta,
                  entry.delta_coins >= 0 ? styles.positive : styles.negative,
                ]}
              >
                {entry.delta_coins >= 0 ? '+' : ''}
                {entry.delta_coins}
              </Text>
            </View>
          ))
        )}
      </ScrollView>

      <ReelCashOutSheet
        visible={cashOutOpen}
        onClose={() => setCashOutOpen(false)}
        onCompleted={(balanceCoins, cashableCoins) => {
          setBalanceCoins(balanceCoins, cashableCoins);
          void refresh();
          void loadExtras();
        }}
      />
      <ReelBuyCoinsSheet
        visible={buyOpen}
        onClose={() => setBuyOpen(false)}
        onPurchased={(balanceCoins) => {
          setBalanceCoins(balanceCoins);
          void refresh();
          void loadExtras();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0a0a0a' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },
  scroll: { flex: 1 },
  balanceCard: {
    marginHorizontal: 16,
    backgroundColor: '#161616',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  balanceLabel: { color: '#888', fontSize: 12, fontWeight: '600' },
  balanceCoins: { color: '#fff', fontSize: 32, fontWeight: '800', marginTop: 4 },
  statRow: { flexDirection: 'row', marginTop: 16, gap: 8 },
  statBox: {
    flex: 1,
    backgroundColor: '#1c1c1c',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  statValue: { color: '#fff', fontSize: 16, fontWeight: '800' },
  statLabel: { color: '#777', fontSize: 11, marginTop: 2 },
  hint: { color: '#666', fontSize: 12, lineHeight: 17, marginTop: 14 },
  eligMeta: { color: '#888', fontSize: 11, marginTop: 8 },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    marginTop: 14,
  },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: REEL_ACCENT,
    borderRadius: 12,
    paddingVertical: 13,
  },
  primaryBtnText: { color: '#000', fontWeight: '800', fontSize: 14 },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#222',
    borderRadius: 12,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: '#333',
  },
  secondaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  sectionTitle: {
    color: '#aaa',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 22,
    marginBottom: 6,
    paddingHorizontal: 16,
  },
  empty: { color: '#666', fontSize: 13, paddingHorizontal: 16, marginBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222',
  },
  rowLeft: { flex: 1, paddingRight: 12 },
  rowTitle: { color: '#fff', fontSize: 14, fontWeight: '600' },
  rowSub: { color: '#666', fontSize: 11, marginTop: 2 },
  rowFail: { color: '#f87171', fontSize: 11, marginTop: 3 },
  delta: { fontSize: 14, fontWeight: '800' },
  positive: { color: '#4ade80' },
  negative: { color: '#f87171' },
});
