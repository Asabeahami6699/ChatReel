import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, ApiError, type ReelDTO } from '../../lib/api';
import { showErrorAlert } from '../../lib/confirmAction';
import { notifyRealtimeTopic } from '../../lib/realtimeHub';
import { REEL_ACCENT } from './reelTheme';
import { ReelDeleteConfirmFloat } from './ReelDeleteConfirmFloat';
import { ReelGridThumb } from './ReelGridThumb';

const GRID_COLS = 3;
const GRID_GAP = 4;
const GRID_PAD = 6;

type Props = {
  posts: ReelDTO[];
  canDelete: boolean;
  contentWidth: number;
  bottomPad: number;
  generatedThumbs: Record<string, string>;
  onOpen: (index: number) => void;
  onDeleted: (reelId: string, index: number) => void;
  onDeletedMany: (reelIds: string[]) => void;
  refreshing?: boolean;
  onRefresh?: () => void | Promise<void>;
};

function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`.replace('.0K', 'K');
  return `${(n / 1_000_000).toFixed(1)}M`.replace('.0M', 'M');
}

function moderationLabel(status?: string): string | null {
  if (!status || status === 'approved') return null;
  if (status === 'pending') return 'Reviewing';
  if (status === 'flagged') return 'Under review';
  if (status === 'rejected') return 'Rejected';
  return null;
}

type GridTileProps = {
  reel: ReelDTO;
  index: number;
  width: number;
  height: number;
  thumbUri?: string;
  canDelete: boolean;
  selectionMode: boolean;
  selected: boolean;
  onPress: () => void;
  onLongPress: () => void;
};

function GridTile({
  reel,
  width,
  height,
  thumbUri,
  canDelete,
  selectionMode,
  selected,
  onPress,
  onLongPress,
}: GridTileProps) {
  const modLabel = moderationLabel(reel.moderation_status);

  return (
    <Pressable
      style={[styles.tileOuter, { width, height }]}
      onPress={onPress}
      onLongPress={canDelete ? onLongPress : undefined}
      delayLongPress={400}
      {...(Platform.OS === 'web' && canDelete
        ? ({
            onContextMenu: (e: { preventDefault?: () => void }) => {
              e.preventDefault?.();
              onLongPress();
            },
          } as object)
        : {})}
    >
      <View style={[styles.tile, selected && styles.tileSelected]}>
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
        {modLabel && (
          <View style={styles.modBadge}>
            <Text style={styles.modBadgeText}>{modLabel}</Text>
          </View>
        )}
        {selectionMode && (
          <View style={[styles.checkBubble, selected && styles.checkBubbleOn]}>
            {selected && <Ionicons name="checkmark" size={14} color="#fff" />}
          </View>
        )}
      </View>
    </Pressable>
  );
}

export function ReelProfileGrid({
  posts,
  canDelete,
  contentWidth,
  bottomPad,
  generatedThumbs,
  onOpen,
  onDeleted,
  onDeletedMany,
  refreshing = false,
  onRefresh,
}: Props) {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[] | null>(null);

  const { tileWidth, tileHeight } = useMemo(() => {
    const tw = Math.floor((contentWidth - GRID_PAD * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS);
    return { tileWidth: tw, tileHeight: Math.round(tw * 1.15) };
  }, [contentWidth]);

  const exitSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelect = useCallback((reelId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(reelId)) next.delete(reelId);
      else next.add(reelId);
      return next;
    });
  }, []);

  const enterSelectionWith = useCallback((reelId: string) => {
    setSelectionMode(true);
    setSelectedIds(new Set([reelId]));
  }, []);

  const applyLocalRemoval = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      if (ids.length === 1) {
        const idx = posts.findIndex((r) => r.id === ids[0]);
        onDeleted(ids[0], idx >= 0 ? idx : 0);
      } else {
        onDeletedMany(ids);
      }
    },
    [posts, onDeleted, onDeletedMany]
  );

  const performDeleteMany = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      setDeleting(true);

      applyLocalRemoval(ids);
      exitSelection();
      setPendingDeleteIds(null);

      try {
        const results = await Promise.allSettled(ids.map((id) => api.reels.delete(id)));
        const failed: string[] = [];
        const errors: string[] = [];
        results.forEach((result, i) => {
          if (result.status === 'fulfilled') return;
          failed.push(ids[i]);
          const reason =
            result.reason instanceof ApiError
              ? result.reason.message
              : result.reason instanceof Error
                ? result.reason.message
                : 'Unknown error';
          errors.push(reason);
        });

        if (failed.length === 0) {
          notifyRealtimeTopic('reels');
          return;
        }

        await onRefresh?.();
        const detail = errors[0] ?? 'Could not delete reel(s)';
        showErrorAlert(
          'Delete failed',
          failed.length === ids.length
            ? detail
            : `${failed.length} of ${ids.length} reel(s) could not be deleted.\n${detail}`
        );
      } catch (e) {
        await onRefresh?.();
        const message = e instanceof ApiError ? e.message : 'Could not delete reels';
        showErrorAlert('Delete failed', message);
      } finally {
        setDeleting(false);
      }
    },
    [applyLocalRemoval, exitSelection, onRefresh]
  );

  const requestDelete = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setPendingDeleteIds(ids);
  }, [selectedIds]);

  const cancelDelete = useCallback(() => {
    if (deleting) return;
    setPendingDeleteIds(null);
  }, [deleting]);

  const handleTilePress = (reel: ReelDTO, index: number) => {
    if (selectionMode && canDelete) {
      toggleSelect(reel.id);
      return;
    }
    onOpen(index);
  };

  const handleTileLongPress = (reel: ReelDTO) => {
    if (!canDelete || deleting) return;
    if (!selectionMode) {
      enterSelectionWith(reel.id);
      return;
    }
    toggleSelect(reel.id);
  };

  const selectedCount = selectedIds.size;

  return (
    <View style={styles.wrap}>
      {canDelete && selectionMode && (
        <View style={styles.selectionBar}>
          <TouchableOpacity onPress={exitSelection} style={styles.selectionBtn}>
            <Text style={styles.selectionBtnText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.selectionCount}>
            {selectedCount} selected
          </Text>
          <TouchableOpacity
            onPress={requestDelete}
            disabled={selectedCount === 0 || deleting}
            style={[styles.selectionDeleteBtn, selectedCount === 0 && styles.selectionBtnDisabled]}
          >
            {deleting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="trash-outline" size={16} color="#fff" />
                <Text style={styles.selectionDeleteText}>Delete</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={posts}
        key={`profile-grid-${contentWidth}`}
        keyExtractor={(r) => r.id}
        numColumns={GRID_COLS}
        contentContainerStyle={{ paddingBottom: bottomPad + (selectionMode ? 56 : 16) }}
        columnWrapperStyle={styles.gridRow}
        showsVerticalScrollIndicator={false}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />
          ) : undefined
        }
        renderItem={({ item, index }) => (
          <GridTile
            reel={item}
            index={index}
            width={tileWidth}
            height={tileHeight}
            thumbUri={generatedThumbs[item.id]}
            canDelete={canDelete}
            selectionMode={selectionMode}
            selected={selectedIds.has(item.id)}
            onPress={() => handleTilePress(item, index)}
            onLongPress={() => handleTileLongPress(item)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="film-outline" size={36} color="#666" />
            <Text style={styles.emptyText}>No reels yet</Text>
          </View>
        }
      />

      {canDelete && !selectionMode && (
        <Text style={styles.hint}>Long-press to select and delete</Text>
      )}

      <ReelDeleteConfirmFloat
        visible={pendingDeleteIds != null}
        count={pendingDeleteIds?.length ?? 0}
        deleting={deleting}
        onCancel={cancelDelete}
        onConfirm={() => {
          if (pendingDeleteIds?.length) void performDeleteMany(pendingDeleteIds);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 200 },
  gridRow: {
    paddingHorizontal: GRID_PAD,
    marginBottom: GRID_GAP,
    justifyContent: 'space-between',
  },
  tileOuter: {
    borderRadius: 6,
  },
  tile: {
    flex: 1,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  tileSelected: {
    borderWidth: 2,
    borderColor: REEL_ACCENT,
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
  modBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  modBadgeText: { color: '#fbbf24', fontSize: 9, fontWeight: '700' },
  checkBubble: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBubbleOn: {
    backgroundColor: REEL_ACCENT,
    borderColor: REEL_ACCENT,
  },
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#111',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#333',
  },
  selectionBtn: { paddingVertical: 4, paddingHorizontal: 4 },
  selectionBtnText: { color: '#aaa', fontSize: 15, fontWeight: '600' },
  selectionCount: { color: '#fff', fontSize: 14, fontWeight: '600' },
  selectionDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#dc2626',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 88,
    justifyContent: 'center',
  },
  selectionBtnDisabled: { opacity: 0.45 },
  selectionDeleteText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  empty: { paddingVertical: 48, alignItems: 'center' },
  emptyText: { color: '#888', marginTop: 10 },
  hint: {
    textAlign: 'center',
    color: '#555',
    fontSize: 11,
    paddingBottom: 8,
    paddingTop: 4,
  },
});
