import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type WalletBalanceDTO } from '../lib/api';

const defaultBalance: WalletBalanceDTO = {
  balance_coins: 0,
  cashable_coins: 0,
  lifetime_earned_coins: 0,
  lifetime_spent_coins: 0,
  welcome_claimed: false,
};

export function useWallet(enabled = true) {
  const [wallet, setWallet] = useState<WalletBalanceDTO>(defaultBalance);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const welcomeAttempted = useRef(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.wallet.balance();
      setWallet(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load wallet');
      return null;
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  const ensureWelcomeCoins = useCallback(async () => {
    if (!enabled || welcomeAttempted.current) return;
    welcomeAttempted.current = true;
    try {
      const bal = await api.wallet.balance();
      if (bal.welcome_claimed) {
        setWallet(bal);
        return bal;
      }
      const claimed = await api.wallet.claimWelcome();
      setWallet((prev) => ({
        ...prev,
        balance_coins: claimed.balance_coins,
        welcome_claimed: true,
      }));
      return claimed;
    } catch {
      welcomeAttempted.current = false;
      return null;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void (async () => {
      await ensureWelcomeCoins();
      await refresh();
    })();
  }, [enabled, ensureWelcomeCoins, refresh]);

  const setBalanceCoins = useCallback((balance_coins: number, cashable_coins?: number) => {
    setWallet((prev) => ({
      ...prev,
      balance_coins,
      ...(cashable_coins !== undefined ? { cashable_coins } : {}),
    }));
  }, []);

  return {
    wallet,
    loading,
    error,
    refresh,
    setBalanceCoins,
  };
}
