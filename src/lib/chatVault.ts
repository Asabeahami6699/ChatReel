/**
 * Secret Space: PIN-gated vault for chats hidden from the main list.
 * Hidden chats never auto-unhide; access requires the vault code.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { getSecretItem, setSecretItem } from './keyStore';
import {
  chatListKey,
  loadHiddenChatKeys,
  saveHiddenChatKeys,
  type ChatListEntryKind,
} from './chatListHidden';

const PIN_HASH_KEY = 'chat_vault_pin_hash_v1';
const PIN_SALT_KEY = 'chat_vault_pin_salt_v1';
const ENTRIES_KEY = 'chat_vault_entries_v1';

export type VaultChatEntry = {
  kind: ChatListEntryKind;
  id: string;
  name: string;
  avatarUrl?: string | null;
  hiddenAt: string;
};

function entryKey(kind: ChatListEntryKind, id: string): string {
  return chatListKey(kind, id);
}

async function hashPin(pin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

export async function hasVaultPin(): Promise<boolean> {
  const hash = await getSecretItem(PIN_HASH_KEY);
  return Boolean(hash);
}

export async function setVaultPin(pin: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const digits = pin.replace(/\D/g, '');
  if (digits.length < 4 || digits.length > 6) {
    return { ok: false, error: 'Use a 4–6 digit code.' };
  }
  const salt = Array.from(Crypto.getRandomBytes(16), (x) =>
    x.toString(16).padStart(2, '0')
  ).join('');
  const hash = await hashPin(digits, salt);
  await setSecretItem(PIN_SALT_KEY, salt);
  await setSecretItem(PIN_HASH_KEY, hash);
  return { ok: true };
}

export async function verifyVaultPin(pin: string): Promise<boolean> {
  const digits = pin.replace(/\D/g, '');
  if (!digits) return false;
  const [salt, hash] = await Promise.all([
    getSecretItem(PIN_SALT_KEY),
    getSecretItem(PIN_HASH_KEY),
  ]);
  if (!salt || !hash) return false;
  const attempt = await hashPin(digits, salt);
  return attempt === hash;
}

/** Clear vault PIN so a new one can be set after security-question recovery. */
export async function clearVaultPin(): Promise<void> {
  try {
    await setSecretItem(PIN_HASH_KEY, '');
    await setSecretItem(PIN_SALT_KEY, '');
  } catch {
    /* ignore */
  }
}

export async function loadVaultEntries(): Promise<VaultChatEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(ENTRIES_KEY);
    if (!raw) {
      // Migrate legacy hide keys into vault shells.
      const keys = await loadHiddenChatKeys();
      if (keys.size === 0) return [];
      const migrated: VaultChatEntry[] = [];
      for (const key of keys) {
        const colon = key.indexOf(':');
        if (colon < 0) continue;
        const kind = key.slice(0, colon) as ChatListEntryKind;
        const id = key.slice(colon + 1);
        if ((kind !== 'individual' && kind !== 'group') || !id) continue;
        migrated.push({
          kind,
          id,
          name: kind === 'group' ? 'Hidden group' : 'Hidden chat',
          avatarUrl: null,
          hiddenAt: new Date().toISOString(),
        });
      }
      if (migrated.length) await saveVaultEntries(migrated);
      return migrated;
    }
    const parsed = JSON.parse(raw) as VaultChatEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveVaultEntries(entries: VaultChatEntry[]): Promise<void> {
  await AsyncStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
  const keys = new Set(entries.map((e) => entryKey(e.kind, e.id)));
  await saveHiddenChatKeys(keys);
}

export async function hideChatInVault(input: {
  kind: ChatListEntryKind;
  id: string;
  name: string;
  avatarUrl?: string | null;
}): Promise<VaultChatEntry[]> {
  const entries = await loadVaultEntries();
  const key = entryKey(input.kind, input.id);
  const next = entries.filter((e) => entryKey(e.kind, e.id) !== key);
  next.unshift({
    kind: input.kind,
    id: input.id,
    name: input.name || (input.kind === 'group' ? 'Group' : 'Chat'),
    avatarUrl: input.avatarUrl ?? null,
    hiddenAt: new Date().toISOString(),
  });
  await saveVaultEntries(next);
  return next;
}

export async function unhideChatFromVault(
  kind: ChatListEntryKind,
  id: string
): Promise<VaultChatEntry[]> {
  const entries = await loadVaultEntries();
  const next = entries.filter((e) => !(e.kind === kind && e.id === id));
  await saveVaultEntries(next);
  return next;
}

/** Digits-only search that might be a vault unlock attempt (4–6 digits). */
export function looksLikeVaultCode(text: string): boolean {
  return /^\d{4,6}$/.test(text.trim());
}
