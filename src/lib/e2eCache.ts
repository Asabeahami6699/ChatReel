/**
 * Durable caches for end-to-end encryption.
 *
 * Two problems these solve:
 *  - Identity public keys were memory-only, so every cold start needed a network
 *    round trip before a message could be decrypted.
 *  - Decrypted cleartext was memory-only, so a restart could re-show placeholder
 *    text for messages that had already been decrypted successfully.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const IDENTITY_KEY = '@e2e_identity_pub_v1';
const CLEARTEXT_KEY = '@e2e_cleartext_v1';

/** Identity keys are long-lived; refresh weekly to pick up rotations. */
const IDENTITY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CLEARTEXT_ENTRIES = 3000;
const FLUSH_DEBOUNCE_MS = 1200;

type IdentityEntry = { pub: string; at: number };

const identityPubs = new Map<string, IdentityEntry>();
const cleartexts = new Map<string, string>();

let hydration: Promise<void> | null = null;
let identityDirty = false;
let cleartextDirty = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushE2ECaches();
  }, FLUSH_DEBOUNCE_MS);
  if (typeof flushTimer === 'object' && flushTimer !== null && 'unref' in flushTimer) {
    (flushTimer as { unref?: () => void }).unref?.();
  }
}

export function hydrateE2ECaches(): Promise<void> {
  if (hydration) return hydration;
  hydration = (async () => {
    try {
      const [rawIdentity, rawCleartext] = await AsyncStorage.multiGet([
        IDENTITY_KEY,
        CLEARTEXT_KEY,
      ]);

      const identityJson = rawIdentity?.[1];
      if (identityJson) {
        const parsed = JSON.parse(identityJson) as Record<string, IdentityEntry>;
        const now = Date.now();
        for (const [userId, entry] of Object.entries(parsed)) {
          if (!entry?.pub) continue;
          if (now - (entry.at ?? 0) > IDENTITY_TTL_MS) continue;
          identityPubs.set(userId, entry);
        }
      }

      const cleartextJson = rawCleartext?.[1];
      if (cleartextJson) {
        const parsed = JSON.parse(cleartextJson) as Record<string, string>;
        for (const [messageId, text] of Object.entries(parsed)) {
          if (typeof text === 'string' && text) cleartexts.set(messageId, text);
        }
      }
    } catch {
      /* cache is best-effort */
    }
  })();
  return hydration;
}

export async function flushE2ECaches(): Promise<void> {
  const writes: Array<[string, string]> = [];
  if (identityDirty) {
    identityDirty = false;
    writes.push([IDENTITY_KEY, JSON.stringify(Object.fromEntries(identityPubs))]);
  }
  if (cleartextDirty) {
    cleartextDirty = false;
    writes.push([CLEARTEXT_KEY, JSON.stringify(Object.fromEntries(cleartexts))]);
  }
  if (!writes.length) return;
  try {
    await AsyncStorage.multiSet(writes);
  } catch {
    /* ignore quota errors */
  }
}

export function getCachedIdentityPub(userId: string): string | null {
  const entry = identityPubs.get(userId);
  if (!entry) return null;
  if (Date.now() - entry.at > IDENTITY_TTL_MS) {
    identityPubs.delete(userId);
    identityDirty = true;
    scheduleFlush();
    return null;
  }
  return entry.pub;
}

export function setCachedIdentityPub(userId: string, pub: string): void {
  if (!userId || !pub) return;
  const existing = identityPubs.get(userId);
  if (existing?.pub === pub) return;
  identityPubs.set(userId, { pub, at: Date.now() });
  identityDirty = true;
  scheduleFlush();
}

export function clearCachedIdentityPub(userId?: string): void {
  if (userId) identityPubs.delete(userId);
  else identityPubs.clear();
  identityDirty = true;
  scheduleFlush();
}

export function getCachedCleartext(messageId: string): string | undefined {
  return cleartexts.get(messageId);
}

export function setCachedCleartext(messageId: string, text: string): void {
  if (!messageId || !text) return;
  if (cleartexts.get(messageId) === text) return;
  // Re-insert so the oldest keys stay at the front for trimming.
  cleartexts.delete(messageId);
  cleartexts.set(messageId, text);
  while (cleartexts.size > MAX_CLEARTEXT_ENTRIES) {
    const oldest = cleartexts.keys().next().value;
    if (oldest === undefined) break;
    cleartexts.delete(oldest);
  }
  cleartextDirty = true;
  scheduleFlush();
}

export function clearCachedCleartexts(): void {
  cleartexts.clear();
  cleartextDirty = true;
  scheduleFlush();
}

