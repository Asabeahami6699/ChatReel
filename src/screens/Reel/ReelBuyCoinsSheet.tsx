import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, ApiError, type CoinPackageDTO } from '../../lib/api';
import { REEL_ACCENT } from './reelTheme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onPurchased: (balanceCoins: number) => void;
};

function formatPrice(amountMinor: number, currency: string, countryCode?: string): string {
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

function countryLabel(code: string): string {
  switch (code.toUpperCase()) {
    case 'GH':
      return 'Ghana';
    case 'NG':
      return 'Nigeria';
    case 'KE':
      return 'Kenya';
    case 'ZA':
      return 'South Africa';
    default:
      return code;
  }
}

function readPaystackReferenceFromUrl(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  return params.get('reference') || params.get('trxref');
}

function stripPaystackParamsFromUrl(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('reference');
  url.searchParams.delete('trxref');
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
}

export function ReelBuyCoinsSheet({ visible, onClose, onPurchased }: Props) {
  const [packages, setPackages] = useState<CoinPackageDTO[]>([]);
  const [currency, setCurrency] = useState('NGN');
  const [resolvedCountry, setResolvedCountry] = useState('NG');
  const [fallbackUsed, setFallbackUsed] = useState(false);
  const [paymentProvider, setPaymentProvider] = useState<'paystack' | 'stripe'>('paystack');
  const [loading, setLoading] = useState(false);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [pendingReference, setPendingReference] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const pendingRef = useRef<string | null>(null);

  const verifyPurchase = useCallback(
    async (reference: string) => {
      setVerifying(true);
      setError(null);
      try {
        const res = await api.wallet.purchaseVerify(reference);
        onPurchased(res.balance_coins);
        setSuccessMsg(
          res.already_completed
            ? `Payment already credited — ${res.balance_coins} coins`
            : `+${res.coins_credited} coins added! Balance: ${res.balance_coins}`
        );
        setPendingReference(null);
        pendingRef.current = null;
        stripPaystackParamsFromUrl();
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Could not verify payment';
        setError(msg);
      } finally {
        setVerifying(false);
      }
    },
    [onPurchased]
  );

  useEffect(() => {
    if (!visible) return;
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    api.wallet
      .packages()
      .then((res) => {
        setPackages(res.packages);
        setCurrency(res.currency || 'NGN');
        setResolvedCountry(res.resolved_country || 'NG');
        setFallbackUsed(Boolean(res.fallback_used));
        setPaymentProvider(res.payment_provider || 'paystack');
      })
      .catch((err) => {
        const msg =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Could not load coin packages';
        setError(msg);
      })
      .finally(() => setLoading(false));

    const urlRef = readPaystackReferenceFromUrl();
    if (urlRef) {
      setPendingReference(urlRef);
      pendingRef.current = urlRef;
      void verifyPurchase(urlRef);
    }
  }, [visible, verifyPurchase]);

  useEffect(() => {
    if (!visible) return;
    const sub = AppState.addEventListener('change', (state) => {
      const ref = pendingRef.current;
      if (state === 'active' && ref) {
        void verifyPurchase(ref);
      }
    });
    return () => sub.remove();
  }, [visible, verifyPurchase]);

  const startPurchase = useCallback(
    async (pkg: CoinPackageDTO) => {
      if (buyingId) return;
      setBuyingId(pkg.id);
      setError(null);
      setSuccessMsg(null);
      try {
        const checkout = await api.wallet.purchaseInitialize(pkg.id);
        setPendingReference(checkout.reference);
        pendingRef.current = checkout.reference;
        await Linking.openURL(checkout.authorization_url);
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Could not start checkout';
        setError(msg);
      } finally {
        setBuyingId(null);
      }
    },
    [buyingId]
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Buy coins</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color="#888" />
            </TouchableOpacity>
          </View>
          <Text style={styles.subtitle}>
            {paymentProvider === 'paystack'
              ? `Pay with card or MoMo via Paystack · ${countryLabel(resolvedCountry)}`
              : `Card checkout · ${countryLabel(resolvedCountry)}`}
            {fallbackUsed ? ' (using default packages)' : ''}
          </Text>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={REEL_ACCENT} />
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.list}>
              {packages.map((pkg) => {
                const busy = buyingId === pkg.id;
                return (
                  <TouchableOpacity
                    key={pkg.id}
                    style={styles.packageRow}
                    onPress={() => void startPurchase(pkg)}
                    disabled={Boolean(buyingId) || verifying}
                    activeOpacity={0.85}
                  >
                    <View style={styles.packageLeft}>
                      <Ionicons name="logo-bitcoin" size={22} color="#fff" />
                      <View>
                        <Text style={styles.packageLabel}>{pkg.label}</Text>
                        <Text style={styles.packageCoins}>{pkg.coins} coins</Text>
                      </View>
                    </View>
                    <View style={styles.packageRight}>
                      <Text style={styles.packagePrice}>
                        {formatPrice(
                          pkg.amount_minor,
                          pkg.currency || currency,
                          pkg.country_code || resolvedCountry
                        )}
                      </Text>
                      {busy ? <ActivityIndicator size="small" color="#fff" /> : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {pendingReference ? (
            <TouchableOpacity
              style={styles.verifyBtn}
              onPress={() => void verifyPurchase(pendingReference)}
              disabled={verifying}
            >
              {verifying ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                  <Text style={styles.verifyText}>I completed payment — verify</Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}

          {successMsg ? <Text style={styles.success}>{successMsg}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    backgroundColor: '#141414',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 28,
    maxHeight: '75%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#333',
    marginTop: 10,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  title: { color: '#fff', fontSize: 18, fontWeight: '800' },
  subtitle: { color: '#888', fontSize: 13, paddingHorizontal: 20, marginBottom: 12 },
  center: { padding: 32, alignItems: 'center' },
  list: { paddingHorizontal: 16, gap: 10, paddingBottom: 8 },
  packageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#222',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#333',
  },
  packageLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  packageLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },
  packageCoins: { color: '#888', fontSize: 12, marginTop: 2 },
  packageRight: { alignItems: 'flex-end', gap: 6 },
  packagePrice: { color: REEL_ACCENT, fontSize: 14, fontWeight: '800' },
  verifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#1e3a5f',
    borderRadius: 12,
    paddingVertical: 14,
  },
  verifyText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  success: { color: '#4ade80', textAlign: 'center', paddingHorizontal: 20, marginTop: 10 },
  error: { color: '#ff6b6b', textAlign: 'center', paddingHorizontal: 20, marginTop: 10 },
});
