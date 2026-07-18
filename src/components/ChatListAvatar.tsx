import React, { memo, useState } from 'react';
import { View, Text, Image, StyleSheet, Platform } from 'react-native';

type Props = {
  uri?: string | null;
  name: string;
  size?: number;
};

/**
 * Chat-list avatar with no fade animation.
 * SoftFadeImage was re-triggering on FlatList reorder / message updates.
 */
export const ChatListAvatar = memo(function ChatListAvatar({
  uri,
  name,
  size = 48,
}: Props) {
  const [error, setError] = useState(false);
  const showFallback = error || !uri || uri.includes('placeholder.com');

  if (showFallback) {
    return (
      <View style={[styles.fallback, { width: size, height: size, borderRadius: size / 2 }]}>
        <Text style={styles.initials}>{name ? name.charAt(0).toUpperCase() : '?'}</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}
      resizeMode="cover"
      onError={() => setError(true)}
      // @ts-expect-error Android-only; ignored elsewhere
      fadeDuration={Platform.OS === 'android' ? 0 : undefined}
    />
  );
}, (prev, next) => {
  const prevKey = (prev.uri || '').split('?')[0];
  const nextKey = (next.uri || '').split('?')[0];
  return prevKey === nextKey && prev.name === next.name && prev.size === next.size;
});

const styles = StyleSheet.create({
  avatar: { overflow: 'hidden', backgroundColor: '#e5e7eb' },
  fallback: {
    backgroundColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initials: {
    fontSize: 18,
    fontWeight: '700',
    color: '#374151',
  },
});
