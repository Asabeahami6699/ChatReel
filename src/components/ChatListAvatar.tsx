import React, { memo, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Platform,
  Modal,
  Pressable,
  TouchableOpacity,
} from 'react-native';

type Props = {
  uri?: string | null;
  name: string;
  size?: number;
  /** When true, tapping the avatar opens a full-image popup. */
  previewOnPress?: boolean;
};

/**
 * Chat-list avatar with no fade animation.
 * SoftFadeImage was re-triggering on FlatList reorder / message updates.
 */
export const ChatListAvatar = memo(function ChatListAvatar({
  uri,
  name,
  size = 48,
  previewOnPress = false,
}: Props) {
  const [error, setError] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const showFallback = error || !uri || uri.includes('placeholder.com');

  const avatarBody = showFallback ? (
    <View style={[styles.fallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={styles.initials}>{name ? name.charAt(0).toUpperCase() : '?'}</Text>
    </View>
  ) : (
    <Image
      source={{ uri }}
      style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}
      resizeMode="cover"
      onError={() => setError(true)}
      // @ts-expect-error Android-only; ignored elsewhere
      fadeDuration={Platform.OS === 'android' ? 0 : undefined}
    />
  );

  if (!previewOnPress || showFallback) {
    return avatarBody;
  }

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setPreviewOpen(true)}
        accessibilityRole="imagebutton"
        accessibilityLabel={`View ${name} photo`}
      >
        {avatarBody}
      </TouchableOpacity>

      <Modal
        visible={previewOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewOpen(false)}
      >
        <Pressable style={styles.previewBackdrop} onPress={() => setPreviewOpen(false)}>
          <Pressable style={styles.previewCard} onPress={(e) => e.stopPropagation()}>
            <Image source={{ uri: uri! }} style={styles.previewImage} resizeMode="contain" />
            <Text style={styles.previewName} numberOfLines={1}>
              {name}
            </Text>
            <TouchableOpacity
              style={styles.previewClose}
              onPress={() => setPreviewOpen(false)}
              hitSlop={12}
            >
              <Text style={styles.previewCloseText}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}, (prev, next) => {
  const prevKey = (prev.uri || '').split('?')[0];
  const nextKey = (next.uri || '').split('?')[0];
  return (
    prevKey === nextKey &&
    prev.name === next.name &&
    prev.size === next.size &&
    prev.previewOnPress === next.previewOnPress
  );
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
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  previewCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#111',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
  },
  previewImage: {
    width: '100%',
    height: 320,
    borderRadius: 12,
    backgroundColor: '#000',
  },
  previewName: {
    marginTop: 10,
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  previewClose: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  previewCloseText: {
    color: '#93c5fd',
    fontSize: 15,
    fontWeight: '700',
  },
});
