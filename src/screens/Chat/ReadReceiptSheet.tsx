import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { OfflineAvatar } from '../../components/OfflineAvatar';
import { api } from '../../lib/api';
import { chatTheme } from './chatTheme';

type Reader = {
  user_id: string;
  read_at: string;
  display_name: string;
  avatar_url: string | null;
};

type Props = {
  messageId: string | null;
  visible: boolean;
  onClose: () => void;
};

export function ReadReceiptSheet({ messageId, visible, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [readers, setReaders] = useState<Reader[]>([]);

  useEffect(() => {
    if (!visible || !messageId) return;
    let alive = true;
    setLoading(true);
    void api.messages
      .reads(messageId)
      .then(({ readers: r }) => {
        if (alive) setReaders(r);
      })
      .catch(() => {
        if (alive) setReaders([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [visible, messageId]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={() => undefined}>
          <View style={styles.handle} />
          <Text style={styles.title}>Read by</Text>
          {loading ? (
            <ActivityIndicator color={chatTheme.primary} style={styles.loader} />
          ) : readers.length === 0 ? (
            <Text style={styles.empty}>No one has read this yet</Text>
          ) : (
            <FlatList
              data={readers}
              keyExtractor={(item) => item.user_id}
              renderItem={({ item }) => (
                <View style={styles.row}>
                  <OfflineAvatar
                    uri={item.avatar_url}
                    name={item.display_name}
                    size={36}
                    style={styles.avatar}
                  />
                  <View style={styles.rowBody}>
                    <Text style={styles.name}>{item.display_name}</Text>
                    <Text style={styles.time}>
                      {new Date(item.read_at).toLocaleString()}
                    </Text>
                  </View>
                  <Ionicons name="checkmark-done" size={18} color={chatTheme.readReceipt} />
                </View>
              )}
            />
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '55%',
    paddingBottom: 24,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ddd',
    marginTop: 10,
    marginBottom: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    paddingHorizontal: 20,
    paddingBottom: 12,
    color: '#111',
  },
  loader: { marginVertical: 24 },
  empty: { textAlign: 'center', color: '#888', padding: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 12,
  },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#eee' },
  rowBody: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: '#222' },
  time: { fontSize: 12, color: '#888', marginTop: 2 },
});
