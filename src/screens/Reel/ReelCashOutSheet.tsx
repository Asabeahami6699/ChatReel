import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  api,
  ApiError,
  type PayoutBankDTO,
  type PayoutEligibilityDTO,
  type PayoutRecipientDTO,
} from '../../lib/api';
import { useReelPlaybackGate } from '../../hooks/useReelPlaybackGate';
import { REEL_ACCENT } from './reelTheme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onCompleted: (balanceCoins: number, cashableCoins: number) => void;
};

function formatMinor(amountMinor: number, currency: string, countryCode?: string): string {
  const major = amountMinor / 100;
  const locale =
    countryCode === 'GH'
      ? 'en-GH'
      : countryCode === 'NG'
        ? 'en-NG'
        : countryCode === 'KE'
          ? 'en-KE'
          : countryCode === 'ZA'
            ? 'en-ZA'
            : undefined;
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(major);
  } catch {
    return `${currency} ${major.toFixed(2)}`;
  }
}

function newIdempotencyKey(): string {
  return `payout_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function ReelCashOutSheet({ visible, onClose, onCompleted }: Props) {
  const insets = useSafeAreaInsets();
  useReelPlaybackGate('cash-out-sheet', visible);

  const [eligibility, setEligibility] = useState<PayoutEligibilityDTO | null>(null);
  const [recipients, setRecipients] = useState<PayoutRecipientDTO[]>([]);
  const [banks, setBanks] = useState<PayoutBankDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [selectedRecipientId, setSelectedRecipientId] = useState<string | null>(null);
  const [amountCoins, setAmountCoins] = useState('');
  const [showAddRecipient, setShowAddRecipient] = useState(false);
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [savingRecipient, setSavingRecipient] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [elig, recip] = await Promise.all([
        api.wallet.payoutEligibility(),
        api.wallet.payoutRecipients(),
      ]);
      setEligibility(elig);
      setRecipients(recip.recipients);
      setSelectedRecipientId((prev) => prev ?? recip.recipients[0]?.id ?? null);
      if (elig.cashable_coins > 0) {
        setAmountCoins(String(elig.cashable_coins));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load cash-out');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    setSuccess(null);
    setError(null);
    setShowAddRecipient(false);
    void load();
  }, [visible, load]);

  const loadBanks = useCallback(async () => {
    try {
      const res = await api.wallet.payoutBanks();
      setBanks(res.banks);
      if (res.banks[0] && !bankCode) setBankCode(res.banks[0].code);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load banks');
    }
  }, [bankCode]);

  useEffect(() => {
    if (visible && showAddRecipient && banks.length === 0) {
      void loadBanks();
    }
  }, [visible, showAddRecipient, banks.length, loadBanks]);

  const quotePreview = useMemo(() => {
    if (!eligibility) return null;
    const coins = Math.floor(Number(amountCoins) || 0);
    if (coins <= 0) return null;
    const amountMinor = coins * eligibility.coin_to_fiat_minor;
    const feeMinor =
      eligibility.fee_flat_minor + Math.floor((amountMinor * eligibility.fee_bps) / 10_000);
    const net = amountMinor - feeMinor;
    return {
      coins,
      amountMinor,
      feeMinor,
      net,
      meets: amountMinor >= eligibility.min_amount_minor && coins <= eligibility.cashable_coins,
    };
  }, [amountCoins, eligibility]);

  const saveRecipient = async () => {
    if (!bankCode || !accountNumber.trim()) {
      setError('Enter bank and account number');
      return;
    }
    setSavingRecipient(true);
    setError(null);
    try {
      const res = await api.wallet.createPayoutRecipient({
        account_number: accountNumber.trim(),
        bank_code: bankCode,
        bank_name: banks.find((b) => b.code === bankCode)?.name,
        account_name: accountName.trim() || undefined,
      });
      setRecipients((prev) => [res.recipient, ...prev.filter((r) => r.id !== res.recipient.id)]);
      setSelectedRecipientId(res.recipient.id);
      setShowAddRecipient(false);
      setAccountNumber('');
      setAccountName('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save account');
    } finally {
      setSavingRecipient(false);
    }
  };

  const submitPayout = async () => {
    if (!selectedRecipientId || !quotePreview?.meets) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.wallet.requestPayout({
        recipient_id: selectedRecipientId,
        amount_coins: quotePreview.coins,
        idempotency_key: newIdempotencyKey(),
      });
      onCompleted(res.balance_coins, res.cashable_coins);
      setSuccess(
        res.payout.status === 'paid'
          ? 'Cash-out completed.'
          : 'Cash-out submitted. Funds usually arrive within 1 business day.'
      );
      setEligibility((prev) =>
        prev
          ? {
              ...prev,
              cashable_coins: res.cashable_coins,
              balance_coins: res.balance_coins,
              can_cash_out: false,
              open_payout: {
                id: res.payout.id,
                status: res.payout.status,
                amount_coins: res.payout.amount_coins,
                created_at: res.payout.created_at,
              },
            }
          : prev
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Cash-out failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}
          onPress={() => undefined}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Cash out</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color="#888" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator color="#fff" style={{ marginVertical: 24 }} />
          ) : (
            <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
              {eligibility ? (
                <>
                  <Text style={styles.cashable}>
                    {eligibility.cashable_coins.toLocaleString()} cashable coins
                  </Text>
                  <Text style={styles.meta}>
                    Min {eligibility.min_coins.toLocaleString()} coins (
                    {formatMinor(
                      eligibility.min_amount_minor,
                      eligibility.currency,
                      eligibility.country_code
                    )}
                    ). Gift earnings only — purchased coins stay in-app.
                  </Text>
                  {eligibility.open_payout ? (
                    <Text style={styles.warn}>
                      You have a cash-out in progress ({eligibility.open_payout.status}).
                    </Text>
                  ) : null}
                  {!eligibility.paystack_ready ? (
                    <Text style={styles.warn}>Paystack transfers are not configured on the server.</Text>
                  ) : null}
                </>
              ) : null}

              <Text style={styles.label}>Amount (coins)</Text>
              <TextInput
                style={styles.input}
                keyboardType="number-pad"
                value={amountCoins}
                onChangeText={setAmountCoins}
                placeholder="0"
                placeholderTextColor="#555"
              />
              {quotePreview && eligibility ? (
                <Text style={styles.quote}>
                  You receive{' '}
                  {formatMinor(quotePreview.net, eligibility.currency, eligibility.country_code)}{' '}
                  after{' '}
                  {formatMinor(quotePreview.feeMinor, eligibility.currency, eligibility.country_code)}{' '}
                  fee
                </Text>
              ) : null}

              <View style={styles.rowBetween}>
                <Text style={styles.label}>Payout account</Text>
                <TouchableOpacity onPress={() => setShowAddRecipient((v) => !v)}>
                  <Text style={styles.link}>
                    {showAddRecipient ? 'Cancel' : '+ Add account'}
                  </Text>
                </TouchableOpacity>
              </View>

              {showAddRecipient ? (
                <View style={styles.addBox}>
                  <Text style={styles.smallLabel}>Bank / provider</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bankRow}>
                    {banks.map((b) => (
                      <TouchableOpacity
                        key={`${b.code}-${b.name}`}
                        style={[styles.bankChip, bankCode === b.code && styles.bankChipOn]}
                        onPress={() => setBankCode(b.code)}
                      >
                        <Text
                          style={[styles.bankChipText, bankCode === b.code && styles.bankChipTextOn]}
                        >
                          {b.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <Text style={styles.smallLabel}>Account number</Text>
                  <TextInput
                    style={styles.input}
                    value={accountNumber}
                    onChangeText={setAccountNumber}
                    keyboardType="number-pad"
                    placeholder="Account / mobile money number"
                    placeholderTextColor="#555"
                  />
                  {eligibility?.country_code !== 'NG' ? (
                    <>
                      <Text style={styles.smallLabel}>Account name</Text>
                      <TextInput
                        style={styles.input}
                        value={accountName}
                        onChangeText={setAccountName}
                        placeholder="Name on account"
                        placeholderTextColor="#555"
                      />
                    </>
                  ) : null}
                  <TouchableOpacity
                    style={[styles.primaryBtn, savingRecipient && styles.btnDisabled]}
                    disabled={savingRecipient}
                    onPress={() => void saveRecipient()}
                  >
                    {savingRecipient ? (
                      <ActivityIndicator color="#000" />
                    ) : (
                      <Text style={styles.primaryBtnText}>Save account</Text>
                    )}
                  </TouchableOpacity>
                </View>
              ) : recipients.length === 0 ? (
                <Text style={styles.empty}>Add a bank or mobile money account to cash out.</Text>
              ) : (
                recipients.map((r) => (
                  <TouchableOpacity
                    key={r.id}
                    style={[
                      styles.recipientRow,
                      selectedRecipientId === r.id && styles.recipientRowOn,
                    ]}
                    onPress={() => setSelectedRecipientId(r.id)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.recipientName}>{r.account_name}</Text>
                      <Text style={styles.recipientMeta}>
                        {r.bank_name || r.bank_code} · {r.account_number_masked}
                      </Text>
                    </View>
                    {selectedRecipientId === r.id ? (
                      <Ionicons name="checkmark-circle" size={20} color={REEL_ACCENT} />
                    ) : null}
                  </TouchableOpacity>
                ))
              )}

              {error ? <Text style={styles.error}>{error}</Text> : null}
              {success ? <Text style={styles.success}>{success}</Text> : null}

              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  (!quotePreview?.meets || !selectedRecipientId || submitting) && styles.btnDisabled,
                ]}
                disabled={!quotePreview?.meets || !selectedRecipientId || submitting}
                onPress={() => void submitPayout()}
              >
                {submitting ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={styles.primaryBtnText}>Request cash-out</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#141414',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    maxHeight: '90%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#333',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  title: { color: '#fff', fontSize: 18, fontWeight: '800', flex: 1 },
  body: { paddingHorizontal: 16 },
  cashable: { color: '#fff', fontSize: 24, fontWeight: '800' },
  meta: { color: '#888', fontSize: 12, marginTop: 6, lineHeight: 17 },
  warn: { color: '#fbbf24', fontSize: 12, marginTop: 8, lineHeight: 17 },
  label: { color: '#aaa', fontSize: 12, fontWeight: '700', marginTop: 16, marginBottom: 6 },
  smallLabel: { color: '#888', fontSize: 11, fontWeight: '600', marginTop: 10, marginBottom: 4 },
  input: {
    backgroundColor: '#1c1c1c',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 12,
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  quote: { color: '#4ade80', fontSize: 12, marginTop: 8 },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  link: { color: REEL_ACCENT, fontSize: 13, fontWeight: '700' },
  addBox: {
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginTop: 8,
  },
  bankRow: { maxHeight: 44, marginBottom: 4 },
  bankChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#222',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  bankChipOn: { borderColor: REEL_ACCENT, backgroundColor: '#2a2218' },
  bankChipText: { color: '#ccc', fontSize: 12 },
  bankChipTextOn: { color: '#fff', fontWeight: '700' },
  empty: { color: '#666', fontSize: 13, marginTop: 8 },
  recipientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    backgroundColor: '#1a1a1a',
    marginTop: 8,
  },
  recipientRowOn: { borderColor: REEL_ACCENT },
  recipientName: { color: '#fff', fontSize: 14, fontWeight: '700' },
  recipientMeta: { color: '#888', fontSize: 12, marginTop: 2 },
  error: { color: '#f87171', fontSize: 13, marginTop: 12 },
  success: { color: '#4ade80', fontSize: 13, marginTop: 12 },
  primaryBtn: {
    marginTop: 16,
    marginBottom: 8,
    backgroundColor: REEL_ACCENT,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#000', fontSize: 15, fontWeight: '800' },
  btnDisabled: { opacity: 0.45 },
});
