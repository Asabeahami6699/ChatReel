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
import { api, type WalletLedgerEntryDTO } from '../../lib/api';
import { useWallet } from '../../hooks/useWallet';
import { REEL_ACCENT } from './reelTheme';

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
    default:
      return type.replace(/_/g, ' ');
  }
}

export function ReelWalletPanel() {
  const { wallet, loading, refresh } = useWallet(true);
  const [entries, setEntries] = useState<WalletLedgerEntryDTO[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const loadLedger = useCallback(async () => {
    setLedgerLoading(true);
    try {
      const res = await api.wallet.ledger({ limit: 20 });
      setEntries(res.entries);
    } catch {
      setEntries([]);
    } finally {
      setLedgerLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLedger();
  }, [loadLedger, wallet.balance_coins]);

  return (
    <View style={styles.wrap}>
      <View style={styles.balanceCard}>
        <View style={styles.balanceRow}>
          <Ionicons name="wallet-outline" size={22} color={REEL_ACCENT} />
          <Text style={styles.balanceTitle}>Creator wallet</Text>
          <TouchableOpacity onPress={() => void refresh()} hitSlop={8}>
            <Ionicons name="refresh" size={18} color="#888" />
          </TouchableOpacity>
        </View>
        {loading ? (
          <ActivityIndicator color="#fff" style={{ marginTop: 8 }} />
        ) : (
          <>
            <Text style={styles.balanceCoins}>{wallet.balance_coins} coins</Text>
            <Text style={styles.balanceMeta}>
              Earned {wallet.lifetime_earned_coins} · Spent {wallet.lifetime_spent_coins}
            </Text>
            <Text style={styles.payoutHint}>
              Cash out via bank transfer — coming soon (Stripe Connect).
            </Text>
          </>
        )}
      </View>

      <Text style={styles.sectionTitle}>Recent activity</Text>
      {ledgerLoading && entries.length === 0 ? (
        <ActivityIndicator color="#666" />
      ) : entries.length === 0 ? (
        <Text style={styles.empty}>No wallet activity yet</Text>
      ) : (
        <ScrollView style={styles.ledger} nestedScrollEnabled>
          {entries.map((entry) => (
            <View key={entry.id} style={styles.ledgerRow}>
              <View style={styles.ledgerLeft}>
                <Text style={styles.ledgerType}>{formatEntryType(entry.entry_type)}</Text>
                <Text style={styles.ledgerDate}>
                  {new Date(entry.created_at).toLocaleString()}
                </Text>
              </View>
              <Text
                style={[
                  styles.ledgerDelta,
                  entry.delta_coins >= 0 ? styles.positive : styles.negative,
                ]}
              >
                {entry.delta_coins >= 0 ? '+' : ''}
                {entry.delta_coins}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8, marginBottom: 16 },
  balanceCard: {
    backgroundColor: '#161616',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginHorizontal: 16,
  },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  balanceTitle: { color: '#fff', fontSize: 15, fontWeight: '700', flex: 1 },
  balanceCoins: { color: '#fff', fontSize: 28, fontWeight: '800', marginTop: 10 },
  balanceMeta: { color: '#888', fontSize: 12, marginTop: 4 },
  payoutHint: { color: '#666', fontSize: 11, marginTop: 10, lineHeight: 16 },
  sectionTitle: {
    color: '#aaa',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  empty: { color: '#666', fontSize: 13, paddingHorizontal: 16 },
  ledger: { maxHeight: 220, paddingHorizontal: 16 },
  ledgerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222',
  },
  ledgerLeft: { flex: 1, paddingRight: 12 },
  ledgerType: { color: '#fff', fontSize: 13, fontWeight: '600' },
  ledgerDate: { color: '#666', fontSize: 11, marginTop: 2 },
  ledgerDelta: { fontSize: 14, fontWeight: '800' },
  positive: { color: '#4ade80' },
  negative: { color: '#f87171' },
});
