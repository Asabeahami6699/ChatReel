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
import { api, ApiError, type GiftCatalogDTO, type ReelDTO } from '../../lib/api';
import { getCachedGiftCatalog, loadGiftCatalog, scheduleGiftCatalogPrefetch } from '../../lib/giftCatalogPrefetch';
import { REEL_ACCENT } from './reelTheme';

type Props = {
  visible: boolean;
  reel: ReelDTO | null;
  balanceCoins: number;
  onClose: () => void;
  onSent: (payload: { gift: GiftCatalogDTO; balanceCoins: number }) => void;
  onBuyCoins: () => void;
};

function makeIdempotencyKey(reelId: string, giftId: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  return `gift:${reelId}:${giftId}:${rand}`;
}

export function ReelGiftSheet({ visible, reel, balanceCoins, onClose, onSent, onBuyCoins }: Props) {
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
      // Refresh quietly in the background.
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
      if (!reel || sendingId) return;
      if (balanceCoins < gift.coin_price) {
        setError('Not enough coins');
        return;
      }
      setSendingId(gift.id);
      setError(null);
      try {
        const res = await api.gifts.send({
          reel_id: reel.id,
          gift_id: gift.id,
          idempotency_key: makeIdempotencyKey(reel.id, gift.id),
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
    [reel, sendingId, balanceCoins, onSent, onClose]
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Send a gift</Text>
            <View style={styles.balancePill}>
              <Ionicons name="logo-bitcoin" size={14} color="#fff" />
              <Text style={styles.balanceText}>{balanceCoins}</Text>
            </View>
          </View>
          <Text style={styles.subtitle} numberOfLines={1}>
            Support @{reel?.author?.display_name?.trim() || 'creator'}
          </Text>

          {loadingCatalog ? (
            <View style={styles.center}>
              <ActivityIndicator color={REEL_ACCENT} />
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.grid} keyboardShouldPersistTaps="handled">
              {catalog.map((gift) => {
                const affordable = balanceCoins >= gift.coin_price;
                const busy = sendingId === gift.id;
                return (
                  <TouchableOpacity
                    key={gift.id}
                    style={[styles.giftCard, !affordable && styles.giftCardDisabled]}
                    onPress={() => void sendGift(gift)}
                    disabled={!affordable || Boolean(sendingId)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.giftEmoji}>{gift.emoji}</Text>
                    <Text style={styles.giftName}>{gift.name}</Text>
                    <Text style={styles.giftPrice}>{gift.coin_price} coins</Text>
                    {busy ? <ActivityIndicator size="small" color="#fff" style={styles.busy} /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity style={styles.buyBtn} onPress={onBuyCoins} activeOpacity={0.88}>
            <Ionicons name="add-circle-outline" size={18} color="#fff" />
            <Text style={styles.buyBtnText}>Buy coins with Paystack</Text>
          </TouchableOpacity>
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
    maxHeight: '72%',
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
  balancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  balanceText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  subtitle: { color: '#888', fontSize: 13, paddingHorizontal: 20, marginBottom: 12 },
  center: { padding: 32, alignItems: 'center' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  giftCard: {
    width: '30%',
    minWidth: 96,
    flexGrow: 1,
    backgroundColor: '#222',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  giftCardDisabled: { opacity: 0.45 },
  giftEmoji: { fontSize: 32, marginBottom: 6 },
  giftName: { color: '#fff', fontSize: 12, fontWeight: '700' },
  giftPrice: { color: REEL_ACCENT, fontSize: 11, fontWeight: '700', marginTop: 4 },
  busy: { marginTop: 6 },
  error: { color: '#ff6b6b', textAlign: 'center', paddingHorizontal: 20, marginTop: 8 },
  buyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  buyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
