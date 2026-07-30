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
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { REACTION_EMOJIS } from './chatMessageUtils';
import { getMessageDisplayText } from '../../lib/messageCrypto';
import type { ChatListMessage } from './chatListModel';
import { useChatSettings } from '../../context/ChatSettingsContext';

export type MessageAction =
  | 'reply'
  | 'copy'
  | 'translate'
  | 'edit'
  | 'delete_me'
  | 'delete_all'
  | 'forward'
  | 'star'
  | 'pin'
  | 'unpin'
  | 'react';

type Props = {
  visible: boolean;
  message: ChatListMessage | null;
  isOutgoing: boolean;
  isGroup: boolean;
  isStarred: boolean;
  isPinned?: boolean;
  canEdit: boolean;
  canDeleteForAll: boolean;
  onClose: () => void;
  onAction: (action: MessageAction, emoji?: string) => void;
};

const DESKTOP_SHEET_MAX = 380;

export function MessageActionSheet({
  visible,
  message,
  isOutgoing,
  isGroup,
  isStarred,
  isPinned = false,
  canEdit,
  canDeleteForAll,
  onClose,
  onAction,
}: Props) {
  const { theme } = useChatSettings();
  const { width: winW } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && winW >= 768;

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

  if (message.message_type === 'text' && getMessageDisplayText(message).trim()) {
    actions.push({ key: 'translate', label: 'Translate', icon: 'language-outline' });
  }

  if (canEdit) {
    actions.push({ key: 'edit', label: 'Edit', icon: 'create-outline' });
  }

  actions.push({
    key: 'star',
    label: isStarred ? 'Unstar' : 'Star',
    icon: isStarred ? 'star' : 'star-outline',
  });

  actions.push({
    key: isPinned ? 'unpin' : 'pin',
    label: isPinned ? 'Unpin' : 'Pin',
    icon: isPinned ? 'pin' : 'pin-outline',
  });

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
        <View
          style={[
            styles.overlay,
            isDesktop && styles.overlayDesktop,
          ]}
        >
          <TouchableWithoutFeedback>
            <View
              style={[
                styles.sheet,
                { backgroundColor: theme.listCardBg },
                isDesktop && styles.sheetDesktop,
                isDesktop && { maxWidth: Math.min(DESKTOP_SHEET_MAX, winW - 48) },
              ]}
            >
              <View style={[styles.reactions, { borderBottomColor: theme.listBorder }]}>
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
              <ScrollView style={styles.actions} bounces={false}>
                {actions.map((a) => (
                  <TouchableOpacity
                    key={a.key}
                    style={[styles.actionRow, { borderBottomColor: theme.listBorder }]}
                    onPress={() => {
                      onAction(a.key);
                      onClose();
                    }}
                  >
                    <Ionicons
                      name={a.icon as any}
                      size={20}
                      color={a.destructive ? '#FF3B30' : theme.listPrimaryText}
                    />
                    <Text
                      style={[
                        styles.actionText,
                        { color: theme.listPrimaryText },
                        a.destructive && styles.destructive,
                      ]}
                    >
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
  overlayDesktop: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
    width: '100%',
  },
  sheetDesktop: {
    borderRadius: 16,
    paddingBottom: 12,
    width: '100%',
    maxHeight: '72%',
    alignSelf: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  reactions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  emojiBtn: { padding: 6 },
  emoji: { fontSize: 26 },
  actions: { maxHeight: 320 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actionText: { fontSize: 15 },
  destructive: { color: '#FF3B30' },
});
