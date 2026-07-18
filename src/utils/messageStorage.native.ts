// src/utils/messageStorage.native.ts
//
// Native (iOS/Android) implementation of messageStorage backed by expo-sqlite.
// Metro platform resolution picks this file on native; messageStorage.ts
// remains the web/AsyncStorage fallback. Both files export an identical API.
//
// Known limitation: the current messageStorage API has no authenticated-owner
// parameter, so this database is device-scoped and shared across accounts on
// the same device (same behavior as the previous AsyncStorage implementation).
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SQLite from 'expo-sqlite';

export type MessageOutboxUpload = {
  kind: 'audio' | 'image' | 'video' | 'file';
  localUri: string;
  mime: string;
  fileName: string;
  audioDuration?: number;
  expires_at?: string | null;
  view_once?: boolean;
};

export type MessageOutboxItem = {
  client_message_id: string;
  chatId: string;
  chatType: 'individual' | 'group';
  /** Ready-to-POST body for text (or after upload). */
  payload: Record<string, unknown>;
  created_at: string;
  /** When set, flush uploads this local file before send. */
  upload?: MessageOutboxUpload;
};

const DB_NAME = 'chatreel_messages.db';
const SCHEMA_VERSION = 1;
const LEGACY_IMPORT_FLAG = 'legacy_asyncstorage_import_v1';

// Legacy AsyncStorage keys (must match messageStorage.ts).
const LEGACY_MESSAGES_PREFIX = 'messages_';
const LEGACY_LAST_SYNC_PREFIX = 'last_sync_';
const LEGACY_DRAFT_PREFIX = 'draft_';
const LEGACY_OUTBOX_KEY = 'message_send_outbox_v1';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
// All operations are serialized through this queue so multi-statement
// transactions on the single connection never interleave.
let opQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(work: (db: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> {
  const run = opQueue.then(async () => work(await getDb()));
  opQueue = run.catch(() => undefined);
  return run;
}

function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync('PRAGMA journal_mode = WAL;');
      await db.execAsync('PRAGMA foreign_keys = ON;');
      await migrateSchema(db);
      await importLegacyAsyncStorage(db);
      return db;
    })().catch((error) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

async function migrateSchema(db: SQLite.SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  if (version >= SCHEMA_VERSION) return;

  if (version < 1) {
    await db.execAsync(`
      BEGIN;
      CREATE TABLE IF NOT EXISTS messages (
        chat_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        payload TEXT NOT NULL,
        PRIMARY KEY (chat_id, position)
      );
      CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages (chat_id, position);
      CREATE TABLE IF NOT EXISTS chat_sync (
        chat_id TEXT PRIMARY KEY,
        last_sync INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS drafts (
        chat_id TEXT PRIMARY KEY,
        draft TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS outbox (
        client_message_id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL,
        created_at TEXT,
        item TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_outbox_chat ON outbox (chat_id);
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      PRAGMA user_version = ${SCHEMA_VERSION};
      COMMIT;
    `);
  }
}

/**
 * One-time import of legacy AsyncStorage data. Idempotent: existing SQLite
 * rows are never overwritten, and each legacy key is deleted only after its
 * own import succeeds. If any key fails, the completion flag stays unset so
 * the remaining keys are retried on the next launch.
 */
async function importLegacyAsyncStorage(db: SQLite.SQLiteDatabase) {
  try {
    const done = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM meta WHERE key = ?',
      [LEGACY_IMPORT_FLAG]
    );
    if (done?.value === 'done') return;

    const allKeys = await AsyncStorage.getAllKeys();
    const legacyKeys = allKeys.filter(
      (k) =>
        k.startsWith(LEGACY_MESSAGES_PREFIX) ||
        k.startsWith(LEGACY_LAST_SYNC_PREFIX) ||
        k.startsWith(LEGACY_DRAFT_PREFIX) ||
        k === LEGACY_OUTBOX_KEY
    );

    let allSucceeded = true;
    for (const key of legacyKeys) {
      try {
        const raw = await AsyncStorage.getItem(key);
        if (raw !== null) {
          await importLegacyKey(db, key, raw);
        }
        await AsyncStorage.removeItem(key);
      } catch (error) {
        allSucceeded = false;
        console.warn('⚠️ Legacy message-storage import failed for key:', key, error);
      }
    }

    if (allSucceeded) {
      await db.runAsync(
        'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)',
        [LEGACY_IMPORT_FLAG, 'done']
      );
    }
  } catch (error) {
    console.warn('⚠️ Legacy message-storage import skipped:', error);
  }
}

async function importLegacyKey(db: SQLite.SQLiteDatabase, key: string, raw: string) {
  if (key.startsWith(LEGACY_MESSAGES_PREFIX)) {
    const chatId = key.slice(LEGACY_MESSAGES_PREFIX.length);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Invalid legacy messages payload');
    const existing = await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM messages WHERE chat_id = ?',
      [chatId]
    );
    if ((existing?.n ?? 0) > 0) return; // SQLite already has newer data.
    await db.withTransactionAsync(async () => {
      for (let i = 0; i < parsed.length; i++) {
        await db.runAsync(
          'INSERT OR IGNORE INTO messages (chat_id, position, payload) VALUES (?, ?, ?)',
          [chatId, i, JSON.stringify(parsed[i])]
        );
      }
    });
  } else if (key.startsWith(LEGACY_LAST_SYNC_PREFIX)) {
    const chatId = key.slice(LEGACY_LAST_SYNC_PREFIX.length);
    const ts = parseInt(raw, 10);
    if (Number.isFinite(ts)) {
      await db.runAsync(
        'INSERT OR IGNORE INTO chat_sync (chat_id, last_sync) VALUES (?, ?)',
        [chatId, ts]
      );
    }
  } else if (key.startsWith(LEGACY_DRAFT_PREFIX)) {
    const chatId = key.slice(LEGACY_DRAFT_PREFIX.length);
    if (raw.trim()) {
      await db.runAsync(
        'INSERT OR IGNORE INTO drafts (chat_id, draft, updated_at) VALUES (?, ?, ?)',
        [chatId, raw, Date.now()]
      );
    }
  } else if (key === LEGACY_OUTBOX_KEY) {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Invalid legacy outbox payload');
    await db.withTransactionAsync(async () => {
      for (const item of parsed as MessageOutboxItem[]) {
        if (!item?.client_message_id) continue;
        await db.runAsync(
          'INSERT OR IGNORE INTO outbox (client_message_id, chat_id, created_at, item) VALUES (?, ?, ?, ?)',
          [item.client_message_id, item.chatId ?? '', item.created_at ?? null, JSON.stringify(item)]
        );
      }
    });
  }
}

function sanitizeMessage(m: any) {
  const copy = { ...m };
  if (copy.local_file_uri?.startsWith?.('blob:')) {
    delete copy.local_file_uri;
  }
  if (copy.local_audio_uri?.startsWith?.('blob:') && copy.audio_url) {
    delete copy.local_audio_uri;
  }
  return copy;
}

export const messageStorage = {
  /** Transactionally replaces the entire cached thread for one chat. */
  saveMessages: async (chatId: string, messages: any[]) => {
    try {
      const sanitized = messages.map(sanitizeMessage);
      await enqueue(async (db) => {
        await db.withTransactionAsync(async () => {
          await db.runAsync('DELETE FROM messages WHERE chat_id = ?', [chatId]);
          const stmt = await db.prepareAsync(
            'INSERT INTO messages (chat_id, position, payload) VALUES (?, ?, ?)'
          );
          try {
            for (let i = 0; i < sanitized.length; i++) {
              await stmt.executeAsync([chatId, i, JSON.stringify(sanitized[i])]);
            }
          } finally {
            await stmt.finalizeAsync();
          }
          await db.runAsync(
            'INSERT OR REPLACE INTO chat_sync (chat_id, last_sync) VALUES (?, ?)',
            [chatId, Date.now()]
          );
        });
      });
    } catch (error) {
      console.error('❌ Error saving messages locally:', error);
    }
  },

  getMessages: async (chatId: string) => {
    try {
      const rows = await enqueue((db) =>
        db.getAllAsync<{ payload: string }>(
          'SELECT payload FROM messages WHERE chat_id = ? ORDER BY position ASC',
          [chatId]
        )
      );
      const out: any[] = [];
      for (const row of rows) {
        try {
          out.push(JSON.parse(row.payload));
        } catch {
          /* skip corrupt row */
        }
      }
      return out;
    } catch (error) {
      console.error('❌ Error loading local messages:', error);
      return [];
    }
  },

  getLastSync: async (chatId: string) => {
    try {
      const row = await enqueue((db) =>
        db.getFirstAsync<{ last_sync: number }>(
          'SELECT last_sync FROM chat_sync WHERE chat_id = ?',
          [chatId]
        )
      );
      return row?.last_sync ?? 0;
    } catch (error) {
      console.error('❌ Error getting last sync:', error);
      return 0;
    }
  },

  clearMessages: async (chatId: string) => {
    try {
      await enqueue(async (db) => {
        await db.withTransactionAsync(async () => {
          await db.runAsync('DELETE FROM messages WHERE chat_id = ?', [chatId]);
          await db.runAsync('DELETE FROM chat_sync WHERE chat_id = ?', [chatId]);
        });
      });
    } catch (error) {
      console.error('❌ Error clearing local messages:', error);
    }
  },

  saveDraft: async (chatId: string, draft: string) => {
    try {
      await enqueue(async (db) => {
        if (draft.trim()) {
          await db.runAsync(
            'INSERT OR REPLACE INTO drafts (chat_id, draft, updated_at) VALUES (?, ?, ?)',
            [chatId, draft, Date.now()]
          );
        } else {
          await db.runAsync('DELETE FROM drafts WHERE chat_id = ?', [chatId]);
        }
      });
    } catch (error) {
      console.error('❌ Error saving draft:', error);
    }
  },

  getDraft: async (chatId: string): Promise<string> => {
    try {
      const row = await enqueue((db) =>
        db.getFirstAsync<{ draft: string }>(
          'SELECT draft FROM drafts WHERE chat_id = ?',
          [chatId]
        )
      );
      return row?.draft ?? '';
    } catch (error) {
      console.error('❌ Error loading draft:', error);
      return '';
    }
  },

  clearDraft: async (chatId: string) => {
    try {
      await enqueue((db) => db.runAsync('DELETE FROM drafts WHERE chat_id = ?', [chatId]));
    } catch (error) {
      console.error('❌ Error clearing draft:', error);
    }
  },

  /** Durable offline send queue (survives app restart). */
  enqueueOutbox: async (item: MessageOutboxItem) => {
    try {
      await enqueue(async (db) => {
        // Delete-then-insert (instead of REPLACE) so a re-enqueued item moves
        // to the end of the queue, matching the legacy array semantics.
        await db.withTransactionAsync(async () => {
          await db.runAsync('DELETE FROM outbox WHERE client_message_id = ?', [
            item.client_message_id,
          ]);
          await db.runAsync(
            'INSERT INTO outbox (client_message_id, chat_id, created_at, item) VALUES (?, ?, ?, ?)',
            [item.client_message_id, item.chatId, item.created_at ?? null, JSON.stringify(item)]
          );
        });
      });
    } catch (error) {
      console.error('❌ Error enqueueing outbox:', error);
    }
  },

  removeOutbox: async (clientMessageId: string) => {
    try {
      await enqueue((db) =>
        db.runAsync('DELETE FROM outbox WHERE client_message_id = ?', [clientMessageId])
      );
    } catch (error) {
      console.error('❌ Error removing outbox item:', error);
    }
  },

  getOutbox: async (chatId?: string): Promise<MessageOutboxItem[]> => {
    try {
      const rows = await enqueue((db) =>
        chatId
          ? db.getAllAsync<{ item: string }>(
              'SELECT item FROM outbox WHERE chat_id = ? ORDER BY rowid ASC',
              [chatId]
            )
          : db.getAllAsync<{ item: string }>('SELECT item FROM outbox ORDER BY rowid ASC')
      );
      const out: MessageOutboxItem[] = [];
      for (const row of rows) {
        try {
          out.push(JSON.parse(row.item) as MessageOutboxItem);
        } catch {
          /* skip corrupt row */
        }
      }
      return out;
    } catch (error) {
      console.error('❌ Error reading outbox:', error);
      return [];
    }
  },

  /** Clear all account-scoped chat state on sign-out. */
  clearAll: async () => {
    try {
      await enqueue(async (db) => {
        await db.withTransactionAsync(async () => {
          await db.runAsync('DELETE FROM messages');
          await db.runAsync('DELETE FROM chat_sync');
          await db.runAsync('DELETE FROM drafts');
          await db.runAsync('DELETE FROM outbox');
        });
      });
    } catch (error) {
      console.error('❌ Error clearing local chat storage:', error);
    }
  },
};
