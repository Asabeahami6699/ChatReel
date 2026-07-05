import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, ApiError, type ReelDTO } from '../../lib/api';
import { notifyRealtimeTopic } from '../../lib/realtimeHub';
import { REEL_ACCENT } from './reelTheme';
import { ReelGridThumb } from './ReelGridThumb';

type Props = {
  reel: ReelDTO;
  index: number;
  width: number;
  height: number;
  thumbUri?: string;
  canDelete: boolean;
  onOpen: () => void;
  onDeleted: (reelId: string, index: number) => void;
  style?: ViewStyle;
};

function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`.replace('.0K', 'K');
  return `${(n / 1_000_000).toFixed(1)}M`.replace('.0M', 'M');
}

export function ReelProfileGridItem({
  reel,
  index,
  width,
  height,
  thumbUri,
  canDelete,
  onOpen,
  onDeleted,
  style,
}: Props) {
  const [menuVisible, setMenuVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const openMenu = () => {
    if (!canDelete || deleting) return;
    setMenuVisible(true);
  };

  const closeMenu = () => setMenuVisible(false);

  const confirmDelete = () => {
    closeMenu();
    Alert.alert(
      'Delete reel?',
      'This removes the reel for everyone. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => void performDelete(),
        },
      ]
    );
  };

  const performDelete = async () => {
    setDeleting(true);
    try {
      await api.reels.delete(reel.id);
      notifyRealtimeTopic('reels');
      onDeleted(reel.id, index);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : 'Could not delete reel';
      Alert.alert('Delete failed', message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <View style={[styles.wrap, { width, height }, style]}>
      <Pressable
        style={styles.tile}
        onPress={() => {
          if (menuVisible) {
            closeMenu();
            return;
          }
          if (!deleting) onOpen();
        }}
        onLongPress={openMenu}
        delayLongPress={450}
        {...(Platform.OS === 'web' && canDelete
          ? ({
              onContextMenu: (e: { preventDefault?: () => void }) => {
                e.preventDefault?.();
                openMenu();
              },
            } as object)
          : {})}
        disabled={deleting}
      >
        <ReelGridThumb reel={reel} generatedUri={thumbUri} style={styles.image} />
        <View style={styles.gridOverlay}>
          {(reel.media?.length ?? 0) > 1 && (
            <View style={styles.gridStat}>
              <Ionicons name="layers" size={11} color="#fff" />
              <Text style={styles.gridStatText}>{reel.media!.length}</Text>
            </View>
          )}
          <View style={styles.gridStat}>
            <Ionicons name="play" size={11} color="#fff" />
            <Text style={styles.gridStatText}>{compact(reel.view_count)}</Text>
          </View>
          {reel.like_count > 0 && (
            <View style={styles.gridStat}>
              <Ionicons name="heart" size={10} color={REEL_ACCENT} />
              <Text style={styles.gridStatText}>{compact(reel.like_count)}</Text>
            </View>
          )}
        </View>

        {menuVisible && <View style={styles.dimOverlay} />}

        {deleting && (
          <View style={styles.busyOverlay}>
            <ActivityIndicator color="#fff" />
          </View>
        )}
      </Pressable>

      {menuVisible && canDelete && (
        <View style={styles.menuLayer}>
          <Pressable style={styles.menuBackdrop} onPress={closeMenu} />
          <View style={styles.menuCard}>
            <TouchableOpacity style={styles.menuAction} onPress={confirmDelete} activeOpacity={0.85}>
              <Ionicons name="trash-outline" size={18} color="#ff453a" />
              <Text style={styles.menuDeleteText}>Delete reel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    overflow: 'visible',
  },
  tile: {
    flex: 1,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  image: { width: '100%', height: '100%' },
  gridOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 6,
    paddingVertical: 5,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  gridStat: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  gridStatText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  dimOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.45)',
    pointerEvents: 'none',
  },
  busyOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  menuLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 30,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'box-none',
  },
  menuBackdrop: {
    ...StyleSheet.absoluteFill,
  },
  menuCard: {
    backgroundColor: 'rgba(22,22,22,0.97)',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 4,
    minWidth: 148,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  menuAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  menuDeleteText: {
    color: '#ff453a',
    fontSize: 15,
    fontWeight: '600',
  },
});
