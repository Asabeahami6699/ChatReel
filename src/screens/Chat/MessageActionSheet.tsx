import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { REACTION_EMOJIS } from './chatMessageUtils';
import type { ChatListMessage } from './chatListModel';

export type MessageAction =
  | 'reply'
  | 'copy'
  | 'edit'
  | 'delete_me'
  | 'delete_all'
  | 'forward'
  | 'star'
  | 'pin'
  | 'react';

type Props = {
  visible: boolean;
  message: ChatListMessage | null;
  isOutgoing: boolean;
  isGroup: boolean;
  isStarred: boolean;
  canEdit: boolean;
  canDeleteForAll: boolean;
  onClose: () => void;
  onAction: (action: MessageAction, emoji?: string) => void;
};

export function MessageActionSheet({
  visible,
  message,
  isOutgoing,
  isGroup,
  isStarred,
  canEdit,
  canDeleteForAll,
  onClose,
  onAction,
}: Props) {
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    const el = document.activeElement as HTMLElement | null;
    el?.blur?.();
  }, [visible]);

  if (!message) return null;

  const actions: { key: MessageAction; label: string; icon: string; destructive?: boolean }[] = [
    { key: 'reply', label: 'Reply', icon: 'arrow-undo-outline' },
    { key: 'copy', label: 'Copy', icon: 'copy-outline' },
  ];

  if (canEdit) {
    actions.push({ key: 'edit', label: 'Edit', icon: 'create-outline' });
  }

  actions.push({
    key: 'star',
    label: isStarred ? 'Unstar' : 'Star',
    icon: isStarred ? 'star' : 'star-outline',
  });

  if (isGroup && isOutgoing) {
    actions.push({ key: 'pin', label: 'Pin', icon: 'pin-outline' });
  }

  actions.push({ key: 'forward', label: 'Forward', icon: 'arrow-redo-outline' });
  actions.push({ key: 'delete_me', label: 'Delete for me', icon: 'trash-outline', destructive: true });

  if (canDeleteForAll) {
    actions.push({
      key: 'delete_all',
      label: 'Delete for everyone',
      icon: 'trash-bin-outline',
      destructive: true,
    });
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.sheet}>
              <View style={styles.reactions}>
                {REACTION_EMOJIS.map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    style={styles.emojiBtn}
                    onPress={() => {
                      onAction('react', emoji);
                      onClose();
                    }}
                  >
                    <Text style={styles.emoji}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <ScrollView style={styles.actions}>
                {actions.map((a) => (
                  <TouchableOpacity
                    key={a.key}
                    style={styles.actionRow}
                    onPress={() => {
                      onAction(a.key);
                      onClose();
                    }}
                  >
                    <Ionicons
                      name={a.icon as any}
                      size={20}
                      color={a.destructive ? '#FF3B30' : '#444'}
                    />
                    <Text style={[styles.actionText, a.destructive && styles.destructive]}>
                      {a.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
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
    paddingBottom: 24,
  },
  reactions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  emojiBtn: { padding: 8 },
  emoji: { fontSize: 28 },
  actions: { maxHeight: 320 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  actionText: { fontSize: 16, color: '#222' },
  destructive: { color: '#FF3B30' },
});
