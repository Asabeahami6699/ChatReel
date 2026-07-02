import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../lib/api';
import { chatTheme } from './chatTheme';

type Props = {
  momentId: string | null;
  visible: boolean;
  onClose: () => void;
};

export function MomentChatPreview({ momentId, visible, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [moment, setMoment] = useState<Record<string, unknown> | null>(null);
  const [author, setAuthor] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!visible || !momentId) return;
    let alive = true;
    setLoading(true);
    void api.moments
      .get(momentId)
      .then(({ moment: m, author: a }) => {
        if (!alive) return;
        setMoment(m);
        setAuthor(a);
        void api.moments.view(momentId).catch(() => undefined);
      })
      .catch(() => {
        if (alive) {
          setMoment(null);
          setAuthor(null);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [visible, momentId]);

  const mediaUrl = (moment?.media_url as string) || (moment?.thumbnail_url as string);
  const caption = (moment?.caption as string) || '';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>Moment</Text>
          <View style={{ width: 28 }} />
        </View>
        {loading ? (
          <ActivityIndicator size="large" color={chatTheme.primary} style={styles.loader} />
        ) : !moment ? (
          <Text style={styles.error}>Moment unavailable or expired</Text>
        ) : (
          <View style={styles.body}>
            {author ? (
              <View style={styles.authorRow}>
                <Image
                  source={{ uri: (author.avatar_url as string) || undefined }}
                  style={styles.avatar}
                />
                <Text style={styles.authorName}>
                  {(author.display_name as string) || 'User'}
                </Text>
              </View>
            ) : null}
            {mediaUrl ? (
              <Image source={{ uri: mediaUrl }} style={styles.media} resizeMode="contain" />
            ) : (
              <View style={[styles.media, styles.textMoment]}>
                <Ionicons name="text-outline" size={48} color="#ccc" />
              </View>
            )}
            {!!caption && <Text style={styles.caption}>{caption}</Text>}
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 48,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  title: { color: '#fff', fontSize: 18, fontWeight: '700' },
  loader: { marginTop: 80 },
  error: { color: '#ccc', textAlign: 'center', marginTop: 80 },
  body: { flex: 1, padding: 16 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#333' },
  authorName: { color: '#fff', fontSize: 16, fontWeight: '600' },
  media: { width: '100%', height: 360, borderRadius: 12, backgroundColor: '#222' },
  textMoment: { alignItems: 'center', justifyContent: 'center' },
  caption: { color: '#fff', fontSize: 16, marginTop: 16, lineHeight: 22 },
});
