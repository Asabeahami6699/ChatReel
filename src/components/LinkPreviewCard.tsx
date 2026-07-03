import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../lib/api';

type PreviewData = {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
};

const cache = new Map<string, PreviewData | null>();

type Props = {
  url: string;
  isOutgoing?: boolean;
  onPress?: (url: string) => void;
};

export function LinkPreviewCard({ url, isOutgoing, onPress }: Props) {
  const [data, setData] = useState<PreviewData | null>(cache.get(url) ?? null);
  const [loading, setLoading] = useState(!cache.has(url));

  useEffect(() => {
    if (cache.has(url)) {
      setData(cache.get(url) ?? null);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    api.linkPreview
      .get(url)
      .then((res) => {
        if (!alive) return;
        const hasContent = Boolean(res.title || res.description || res.image);
        cache.set(url, hasContent ? res : null);
        setData(hasContent ? res : null);
      })
      .catch(() => {
        if (alive) cache.set(url, null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [url]);

  if (loading || !data) return null;

  const textColor = isOutgoing ? '#fff' : '#111';
  const subColor = isOutgoing ? 'rgba(255,255,255,0.7)' : '#666';
  const borderColor = isOutgoing ? 'rgba(255,255,255,0.2)' : '#e0e0e0';

  return (
    <TouchableOpacity
      style={[styles.card, { borderColor }]}
      activeOpacity={0.8}
      onPress={() => onPress?.(url)}
    >
      {data.image ? (
        <Image source={{ uri: data.image }} style={styles.image} resizeMode="cover" />
      ) : null}
      <View style={styles.textWrap}>
        {data.siteName ? (
          <View style={styles.siteRow}>
            <Ionicons name="globe-outline" size={12} color={subColor} />
            <Text style={[styles.siteName, { color: subColor }]} numberOfLines={1}>
              {data.siteName}
            </Text>
          </View>
        ) : null}
        {data.title ? (
          <Text style={[styles.title, { color: textColor }]} numberOfLines={2}>
            {data.title}
          </Text>
        ) : null}
        {data.description ? (
          <Text style={[styles.desc, { color: subColor }]} numberOfLines={3}>
            {data.description}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
    marginTop: 6,
    marginBottom: 2,
    maxWidth: 260,
  },
  image: {
    width: '100%',
    height: 130,
    backgroundColor: '#e0e0e0',
  },
  textWrap: {
    padding: 10,
  },
  siteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 3,
  },
  siteName: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  desc: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 3,
  },
});
