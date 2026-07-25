/**
 * Idle prefetch of recent chat threads so opening a room paints from memory/disk
 * instead of waiting on the network.
 *
 * Conditions kept deliberately conservative so app/list loading never slows down:
 * - Runs only after interactions settle and the list has painted
 * - Requires an active app state and a usable connection
 * - Smaller budget on cellular / expensive connections, skipped on 2g
 * - Low concurrency, per-chat yields, and a hard wall-clock budget
 * - Skips the chat that is currently open, cools down repeat fetches
 * - Text/metadata only (never downloads media)
 */

import { AppState, InteractionManager } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { api } from './api';
import { getActiveChatFocus } from './activeChatFocus';
import { rememberChatThread, recallChatThread } from './chatThreadCache';
import { decryptChatMessages, rememberDecryptedText } from './messageCrypto';
import { sessionStorage } from './sessionStorage';
import {
  deduplicateMessages,
  sanitizeChatMessages,
  type ChatMessage,
} from '../screens/Chat/chatRoomTypes';
import { messageStorage } from '../utils/messageStorage';

export type PrefetchChatTarget = {
  chatId: string;
  chatType: 'individual' | 'group';
  lastMessageAt?: string | null;
  unreadCount?: number;
};

type Budget = {
  chats: number;
  messagesPerChat: number;
  concurrency: number;
  /** Pause between chats to keep the JS thread free for scrolling. */
  yieldMs: number;
};

const WIFI_BUDGET: Budget = { chats: 8, messagesPerChat: 30, concurrency: 2, yieldMs: 120 };
const CELLULAR_BUDGET: Budget = { chats: 4, messagesPerChat: 20, concurrency: 1, yieldMs: 350 };

/** Hard stop so prefetch can never run long in the background. */
const RUN_TIME_BUDGET_MS = 20_000;
/** Don't re-hit the network for the same chat within this window. */
const CHAT_COOLDOWN_MS = 3 * 60 * 1000;
/** If memory already has a thread this fresh, skip network. */
const MEMORY_FRESH_MS = 90 * 1000;

const SLOW_CELLULAR = new Set(['2g', 'slow-2g', '3g']);

let runId = 0;
let inFlight: Promise<void> | null = null;
const lastNetworkPrefetchAt = new Map<string, number>();
const memoryFreshAt = new Map<string, number>();

function cacheKey(chatType: string, chatId: string) {
  return `${chatType}:${chatId}`;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
      (timer as { unref?: () => void }).unref?.();
    }
  });
}

/** Decide whether to prefetch at all, and how much, from the current connection. */
async function resolveBudget(): Promise<Budget | null> {
  try {
    const state = await NetInfo.fetch();
    if (state.isConnected === false) return null;
    if (state.isInternetReachable === false) return null;

    const details = (state.details ?? {}) as {
      isConnectionExpensive?: boolean;
      cellularGeneration?: string | null;
    };

    if (state.type === 'cellular') {
      const generation = (details.cellularGeneration || '').toLowerCase();
      if (SLOW_CELLULAR.has(generation)) return null;
      return CELLULAR_BUDGET;
    }

    if (details.isConnectionExpensive) return CELLULAR_BUDGET;
    if (state.type === 'wifi' || state.type === 'ethernet' || state.type === 'unknown') {
      return WIFI_BUDGET;
    }
    return CELLULAR_BUDGET;
  } catch {
    // NetInfo unavailable (e.g. web fallback) — use the cautious budget.
    return CELLULAR_BUDGET;
  }
}

function rankTargets(targets: PrefetchChatTarget[], max: number): PrefetchChatTarget[] {
  return [...targets]
    .filter((t) => Boolean(t.chatId))
    .sort((a, b) => {
      const aUnread = (a.unreadCount || 0) > 0 ? 1 : 0;
      const bUnread = (b.unreadCount || 0) > 0 ? 1 : 0;
      if (aUnread !== bUnread) return bUnread - aUnread;
      return String(b.lastMessageAt || '').localeCompare(String(a.lastMessageAt || ''));
    })
    .slice(0, max);
}

function shouldStop(thisRun: number, startedAt: number): boolean {
  if (thisRun !== runId) return true;
  if (AppState.currentState !== 'active') return true;
  if (Date.now() - startedAt > RUN_TIME_BUDGET_MS) return true;
  return false;
}

function isChatOpen(target: PrefetchChatTarget): boolean {
  const focus = getActiveChatFocus();
  return focus?.chatId === target.chatId && focus.chatType === target.chatType;
}

async function warmFromDisk(
  target: PrefetchChatTarget,
  userId: string,
  local: ChatMessage[]
): Promise<void> {
  if (local.length === 0) return;
  const decryptedLocal = await decryptChatMessages(local, userId);
  for (const m of decryptedLocal) {
    if (m.decrypted) rememberDecryptedText(m.id, m.decrypted);
  }
  rememberChatThread(target.chatId, decryptedLocal);
  memoryFreshAt.set(cacheKey(target.chatType, target.chatId), Date.now());
}

async function prefetchOne(
  target: PrefetchChatTarget,
  userId: string,
  thisRun: number,
  budget: Budget
): Promise<void> {
  if (isChatOpen(target)) return;

  const key = cacheKey(target.chatType, target.chatId);
  const now = Date.now();

  if (now - (lastNetworkPrefetchAt.get(key) ?? 0) < CHAT_COOLDOWN_MS) {
    const mem = recallChatThread(target.chatId);
    if (mem?.length) rememberChatThread(target.chatId, mem);
    return;
  }

  const mem = recallChatThread(target.chatId);
  if (mem && mem.length > 0 && now - (memoryFreshAt.get(key) ?? 0) < MEMORY_FRESH_MS) {
    return;
  }

  const localRaw = (await messageStorage.getMessages(target.chatId)) as ChatMessage[];
  const local = sanitizeChatMessages(deduplicateMessages(localRaw));

  let remote: ChatMessage[] = [];
  try {
    const { messages } = await api.messages.list(
      target.chatId,
      target.chatType === 'group',
      budget.messagesPerChat
    );
    remote = sanitizeChatMessages(messages as ChatMessage[]);
    lastNetworkPrefetchAt.set(key, Date.now());
  } catch {
    // Offline / API error: still warm memory from disk.
    await warmFromDisk(target, userId, local);
    return;
  }

  if (thisRun !== runId || isChatOpen(target)) return;

  const pendingLocal = local.filter(
    (m) =>
      (String(m.id).startsWith('temp-') || m.client_message_id) &&
      ['pending', 'failed', 'sending'].includes(m._status || '')
  );

  const merged = deduplicateMessages([...remote, ...pendingLocal, ...local]);
  const decrypted = await decryptChatMessages(merged, userId);
  for (const m of decrypted) {
    if (m.decrypted) rememberDecryptedText(m.id, m.decrypted);
  }

  if (thisRun !== runId || isChatOpen(target)) return;

  await messageStorage.saveMessages(target.chatId, decrypted);
  rememberChatThread(target.chatId, decrypted);
  memoryFreshAt.set(key, Date.now());
}

async function runQueue(
  targets: PrefetchChatTarget[],
  userId: string,
  thisRun: number,
  budget: Budget,
  startedAt: number
) {
  const ranked = rankTargets(targets, budget.chats);
  let cursor = 0;

  const worker = async () => {
    while (cursor < ranked.length) {
      if (shouldStop(thisRun, startedAt)) return;
      const next = ranked[cursor++];
      if (!next) return;
      try {
        await prefetchOne(next, userId, thisRun, budget);
      } catch {
        /* silent per-chat */
      }
      await sleep(budget.yieldMs);
    }
  };

  const workers = Array.from({ length: Math.min(budget.concurrency, ranked.length) }, () =>
    worker()
  );
  await Promise.all(workers);
}

/**
 * Schedule prefetch after interactions + a short delay so Chat list paint stays snappy.
 * Calling again with a new list bumps the run id (previous work stops politely).
 */
export function scheduleChatThreadsPrefetch(
  targets: PrefetchChatTarget[],
  delayMs = 1200
): Promise<void> {
  const thisRun = ++runId;
  const snapshot = targets.map((t) => ({ ...t }));

  const promise = new Promise<void>((resolve) => {
    const start = () => {
      void (async () => {
        const startedAt = Date.now();
        try {
          if (thisRun !== runId) return;
          if (AppState.currentState !== 'active') return;
          if (!snapshot.length) return;

          const budget = await resolveBudget();
          if (!budget) return;

          const session = await sessionStorage.load();
          const userId = session?.user?.id;
          if (!userId || !session?.access_token) return;

          await runQueue(snapshot, userId, thisRun, budget, startedAt);
        } catch {
          /* silent */
        } finally {
          if (thisRun === runId) inFlight = null;
          resolve();
        }
      })();
    };

    InteractionManager.runAfterInteractions(() => {
      const timer = setTimeout(start, delayMs);
      if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
        (timer as { unref?: () => void }).unref?.();
      }
    });
  });

  inFlight = promise;
  return promise;
}

/** Bump run id so in-flight workers stop after their current chat. */
export function cancelChatThreadsPrefetch() {
  runId += 1;
  inFlight = null;
}

export function getChatThreadsPrefetchInFlight() {
  return inFlight;
}
