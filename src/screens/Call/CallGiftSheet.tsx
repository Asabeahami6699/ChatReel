import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, ApiError, type GiftCatalogDTO } from '../../lib/api';
import {
  getCachedGiftCatalog,
  loadGiftCatalog,
  scheduleGiftCatalogPrefetch,
} from '../../lib/giftCatalogPrefetch';

type Props = {
  visible: boolean;
  callId: string;
  recipientUserId: string;
  recipientName: string;
  balanceCoins: number;
  onClose: () => void;
  onSent: (payload: { gift: GiftCatalogDTO; balanceCoins: number }) => void;
  onBuyCoins: () => void;
};

function makeIdempotencyKey(callId: string, giftId: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  return `callgift:${callId}:${giftId}:${rand}`;
}

/** Tip a call host / peer using the same gift catalog as reels. */
export function CallGiftSheet({
  visible,
  callId,
  recipientUserId,
  recipientName,
  balanceCoins,
  onClose,
  onSent,
  onBuyCoins,
}: Props) {
  const cached = getCachedGiftCatalog();
  const [catalog, setCatalog] = useState<GiftCatalogDTO[]>(() => cached ?? []);
  const [loadingCatalog, setLoadingCatalog] = useState(() => !cached);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    const hit = getCachedGiftCatalog();
    if (hit?.length) {
      setCatalog(hit);
      setLoadingCatalog(false);
      void scheduleGiftCatalogPrefetch(0).then((gifts) => {
        if (gifts.length) setCatalog(gifts);
      });
      return;
    }
    setLoadingCatalog(true);
    void loadGiftCatalog()
      .then((gifts) => {
        setCatalog(gifts);
        if (!gifts.length) setError('Could not load gifts');
      })
      .catch(() => setError('Could not load gifts'))
      .finally(() => setLoadingCatalog(false));
  }, [visible]);

  const sendGift = useCallback(
    async (gift: GiftCatalogDTO) => {
      if (sendingId) return;
      if (balanceCoins < gift.coin_price) {
        setError('Not enough coins');
        return;
      }
      setSendingId(gift.id);
      setError(null);
      try {
        const res = await api.gifts.sendCall({
          call_id: callId,
          recipient_user_id: recipientUserId,
          gift_id: gift.id,
          idempotency_key: makeIdempotencyKey(callId, gift.id),
        });
        onSent({ gift: res.catalog ?? gift, balanceCoins: res.sender_balance_coins });
        onClose();
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Could not send gift';
        setError(msg);
      } finally {
        setSendingId(null);
      }
    },
    [balanceCoins, callId, onClose, onSent, recipientUserId, sendingId]
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Send a tip</Text>
            <View style={styles.balancePill}>
              <Ionicons name="logo-bitcoin" size={14} color="#fff" />
              <Text style={styles.balanceText}>{balanceCoins}</Text>
            </View>
          </View>
          <Text style={styles.subtitle} numberOfLines={1}>
            Tip {recipientName}
          </Text>

          {loadingCatalog ? (
            <View style={styles.center}>
              <ActivityIndicator color="#f59e0b" />
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.grid} keyboardShouldPersistTaps="handled">
              {catalog.map((gift) => {
                const affordable = balanceCoins >= gift.coin_price;
                const busy = sendingId === gift.id;
                return (
                  <TouchableOpacity
                    key={gift.id}
                    style={[styles.card, !affordable && styles.cardDisabled]}
                    disabled={!affordable || !!sendingId}
                    onPress={() => void sendGift(gift)}
                  >
                    <Text style={styles.emoji}>{gift.emoji}</Text>
                    <Text style={styles.name} numberOfLines={1}>
                      {gift.name}
                    </Text>
                    <Text style={styles.price}>
                      {busy ? '…' : `${gift.coin_price}`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity style={styles.buyBtn} onPress={onBuyCoins}>
            <Text style={styles.buyText}>Buy coins</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: '#111827',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingBottom: 28,
    maxHeight: '70%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#374151',
    marginTop: 10,
    marginBottom: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#fff', fontSize: 18, fontWeight: '800' },
  balancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1f2937',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  balanceText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  subtitle: { color: '#9ca3af', marginTop: 6, marginBottom: 12 },
  center: { paddingVertical: 40, alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 12 },
  card: {
    width: '30%',
    minWidth: 96,
    flexGrow: 1,
    backgroundColor: '#1f2937',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 4,
  },
  cardDisabled: { opacity: 0.45 },
  emoji: { fontSize: 28 },
  name: { color: '#e5e7eb', fontSize: 12, fontWeight: '600' },
  price: { color: '#fbbf24', fontSize: 12, fontWeight: '700' },
  error: { color: '#fca5a5', marginBottom: 8, fontWeight: '600' },
  buyBtn: {
    marginTop: 4,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#2563eb',
  },
  buyText: { color: '#fff', fontWeight: '800' },
});
