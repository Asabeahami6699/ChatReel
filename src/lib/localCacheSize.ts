/**
 * Approximate on-device cache size for Settings → Data and storage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { messageStorage } from '../utils/messageStorage';
import { OFFLINE_FEED_KEYS } from './offlineFeedStore';

export type LocalCacheBreakdown = {
  messagesBytes: number;
  feedsBytes: number;
  reelsMediaBytes: number;
  totalBytes: number;
};

function byteLengthOfString(value: string): number {
  try {
    return typeof TextEncoder !== 'undefined'
      ? new TextEncoder().encode(value).length
      : value.length * 2;
  } catch {
    return value.length * 2;
  }
}

async function asyncStorageKeysSize(keys: string[]): Promise<number> {
  if (!keys.length) return 0;
  try {
    const pairs = await AsyncStorage.multiGet(keys);
    let total = 0;
    for (const [key, value] of pairs) {
      total += byteLengthOfString(key);
      if (value) total += byteLengthOfString(value);
    }
    return total;
  } catch {
    return 0;
  }
}

async function reelCacheDirSize(): Promise<number> {
  if (Platform.OS === 'web') return 0;
  const dir = `${FileSystem.cacheDirectory ?? ''}reels-cache/`;
  if (!dir) return 0;
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) return 0;
    const files = await FileSystem.readDirectoryAsync(dir);
    let total = 0;
    for (const file of files) {
      const fileInfo = await FileSystem.getInfoAsync(`${dir}${file}`, { size: true });
      if (fileInfo.exists && 'size' in fileInfo && typeof fileInfo.size === 'number') {
        total += fileInfo.size;
      }
    }
    return total;
  } catch {
    return 0;
  }
}

export async function getLocalCacheBreakdown(): Promise<LocalCacheBreakdown> {
  const messagesBytes = (await messageStorage.getApproxSizeBytes?.()) ?? 0;

  const allKeys = await AsyncStorage.getAllKeys().catch(() => [] as string[]);
  const feedKeys = allKeys.filter(
    (k) =>
      k.startsWith('offline_feed_') ||
      Object.values(OFFLINE_FEED_KEYS).includes(k as (typeof OFFLINE_FEED_KEYS)[keyof typeof OFFLINE_FEED_KEYS])
  );
  const feedsBytes = await asyncStorageKeysSize(feedKeys);
  const reelsMediaBytes = await reelCacheDirSize();

  return {
    messagesBytes,
    feedsBytes,
    reelsMediaBytes,
    totalBytes: messagesBytes + feedsBytes + reelsMediaBytes,
  };
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
