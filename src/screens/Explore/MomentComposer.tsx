import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, type MomentAudienceMode } from '../../lib/api';
import { enqueueMomentUpload } from '../../lib/momentUploadQueue';
import {
  getTextBackground,
  MOMENT_TEXT_BACKGROUNDS,
} from '../../lib/momentTextBackgrounds';
import { useCurrentProfileId } from '../../hooks/useCurrentProfileId';
import { ReelPlayer } from '../../components/ReelPlayer';

export type MomentDraftItem = {
  uri?: string;
  mediaType: 'image' | 'video' | 'text';
  fileName?: string;
  mime?: string;
  caption?: string;
  textBackground?: string;
};

export type MomentDraft = {
  items: MomentDraftItem[];
};

type FriendPick = {
  id: string;
  name: string;
  avatar_url: string | null;
};

const DURATION_OPTIONS = [
  { minutes: 10, label: '10m' },
  { minutes: 30, label: '30m' },
  { minutes: 60, label: '1h' },
  { minutes: 180, label: '3h' },
  { minutes: 360, label: '6h' },
  { minutes: 720, label: '12h' },
  { minutes: 1440, label: '24h' },
] as const;

const C = {
  primary: '#007AFF',
  primaryDark: '#1e73ce',
  primarySoft: '#e8f2ff',
  bg: '#fff',
  surface: '#f4f8fc',
  border: '#e2eaf3',
  text: '#1c1c1e',
  muted: '#6b7280',
};

type Props = {
  visible: boolean;
  draft: MomentDraft | null;
  onClose: () => void;
  onPosted: () => void;
  onAddMedia?: () => void;
  onUpdateItem: (index: number, patch: Partial<MomentDraftItem>) => void;
};

export function MomentComposer({
  visible,
  draft,
  onClose,
  onPosted,
  onAddMedia,
  onUpdateItem,
}: Props) {
  const insets = useSafeAreaInsets();
  const myProfileId = useCurrentProfileId();

  const [durationMinutes, setDurationMinutes] = useState(1440);
  const [viewOnce, setViewOnce] = useState(false);
  const [audienceMode, setAudienceMode] = useState<MomentAudienceMode>('friends');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [friends, setFriends] = useState<FriendPick[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendQuery, setFriendQuery] = useState('');
  const [previewIndex, setPreviewIndex] = useState(0);

  const items = draft?.items ?? [];
  const currentItem = items[previewIndex];

  useEffect(() => {
    if (!visible) return;
    setDurationMinutes(1440);
    setViewOnce(false);
    setAudienceMode('friends');
    setSelectedIds(new Set());
    setFriendQuery('');
    setPreviewIndex(0);
  }, [visible]);

  useEffect(() => {
    if (!visible || !myProfileId) return;
    setFriendsLoading(true);
    api.friendships
      .list('accepted')
      .then((res) => {
        const rows = (res.friendships ?? []) as Array<{
          user_id?: string;
          friend_id?: string;
          sender_profile?: { id?: string; display_name?: string; email?: string; avatar_url?: string };
          receiver_profile?: { id?: string; display_name?: string; email?: string; avatar_url?: string };
        }>;
        const list: FriendPick[] = [];
        const seenFriendIds = new Set<string>();
        for (const f of rows) {
          const other =
            f.user_id === myProfileId ? f.receiver_profile : f.sender_profile;
          if (!other?.id || seenFriendIds.has(other.id)) continue;
          seenFriendIds.add(other.id);
          list.push({
            id: other.id,
            name: other.display_name?.trim() || other.email?.split('@')[0] || 'Friend',
            avatar_url: other.avatar_url ?? null,
          });
        }
        list.sort((a, b) => a.name.localeCompare(b.name));
        setFriends(list);
      })
      .catch(() => setFriends([]))
      .finally(() => setFriendsLoading(false));
  }, [visible, myProfileId]);

  const filteredFriends = useMemo(() => {
    const q = friendQuery.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter((f) => f.name.toLowerCase().includes(q));
  }, [friends, friendQuery]);

  const toggleFriend = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const audienceSummary = useMemo(() => {
    if (audienceMode === 'friends') return 'All your friends can view';
    if (audienceMode === 'only') {
      return selectedIds.size
        ? `Only ${selectedIds.size} selected friend${selectedIds.size === 1 ? '' : 's'}`
        : 'Pick who can see this';
    }
    return selectedIds.size
      ? `Hidden from ${selectedIds.size} friend${selectedIds.size === 1 ? '' : 's'}`
      : 'Pick who to hide from';
  }, [audienceMode, selectedIds.size]);

  const handlePost = () => {
    if (!draft?.items.length) return;
    if (audienceMode !== 'friends' && selectedIds.size === 0) {
      Alert.alert(
        'Choose friends',
        audienceMode === 'only'
          ? 'Select at least one friend who can view this moment.'
          : 'Select at least one friend to hide this moment from.'
      );
      return;
    }

    for (const item of draft.items) {
      if (item.mediaType === 'text') {
        if (!item.caption?.trim()) {
          Alert.alert('Write something', 'Add text for your word moment.');
          return;
        }
      } else if (!item.uri) {
        Alert.alert('Missing media', 'One of the items has no media file.');
        return;
      }
    }

    enqueueMomentUpload({
      items: draft.items.map((item) => ({
        uri: item.uri,
        mediaType: item.mediaType,
        fileName: item.fileName,
        mime: item.mime,
        caption: item.caption,
        textBackground: item.textBackground,
      })),
      duration_minutes: durationMinutes,
      view_once: viewOnce,
      audience_mode: audienceMode,
      audience_ids: audienceMode === 'friends' ? undefined : Array.from(selectedIds),
    });

    onPosted();
    onClose();
  };

  if (!draft?.items.length || !currentItem) return null;

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <Ionicons name="close" size={26} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit moment</Text>
          {onAddMedia && (
            <TouchableOpacity onPress={onAddMedia} style={styles.addMoreBtn}>
              <Ionicons name="add-circle-outline" size={26} color={C.primary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handlePost} style={styles.postBtn}>
            <Text style={styles.postBtnText}>Post</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Live preview */}
          <View style={styles.previewCard}>
            {currentItem.mediaType === 'text' ? (
              <LinearGradient
                colors={[...getTextBackground(currentItem.textBackground).colors]}
                style={styles.previewMedia}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <TextInput
                  style={[
                    styles.textMomentInput,
                    getTextBackground(currentItem.textBackground).darkText &&
                      styles.textMomentInputDark,
                  ]}
                  placeholder="Type your moment…"
                  placeholderTextColor={
                    getTextBackground(currentItem.textBackground).darkText
                      ? 'rgba(0,0,0,0.45)'
                      : 'rgba(255,255,255,0.65)'
                  }
                  value={currentItem.caption ?? ''}
                  onChangeText={(text) => onUpdateItem(previewIndex, { caption: text })}
                  multiline
                  maxLength={2000}
                  textAlign="center"
                />
              </LinearGradient>
            ) : currentItem.mediaType === 'video' && currentItem.uri ? (
              <ReelPlayer
                key={currentItem.uri}
                source={currentItem.uri}
                style={styles.previewMedia}
                contentFit="cover"
                shouldPlay
                isMuted
                isLooping
              />
            ) : currentItem.uri ? (
              <Image
                key={currentItem.uri}
                source={{ uri: currentItem.uri }}
                style={styles.previewMedia}
                resizeMode="cover"
              />
            ) : null}
            {items.length > 1 && (
              <View style={styles.previewCountBadge}>
                <Text style={styles.previewCountText}>
                  {previewIndex + 1}/{items.length}
                </Text>
              </View>
            )}
            {currentItem.mediaType !== 'text' && (
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.75)']}
                style={styles.previewGrad}
              />
            )}
            {currentItem.mediaType !== 'text' && (
              <TextInput
                style={styles.captionOverlay}
                placeholder={
                  items.length > 1
                    ? `Caption for item ${previewIndex + 1}…`
                    : 'Add a caption…'
                }
                placeholderTextColor="rgba(255,255,255,0.65)"
                value={currentItem.caption ?? ''}
                onChangeText={(text) => onUpdateItem(previewIndex, { caption: text })}
                multiline
                maxLength={2000}
              />
            )}
            {viewOnce && (
              <View style={styles.viewOnceBadge}>
                <Ionicons name="eye-off-outline" size={12} color="#fff" />
                <Text style={styles.viewOnceBadgeText}>View once</Text>
              </View>
            )}
          </View>

          {currentItem.mediaType === 'text' && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Background</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.bgChipRow}
              >
                {MOMENT_TEXT_BACKGROUNDS.map((bg) => {
                  const active = (currentItem.textBackground ?? 'ocean') === bg.id;
                  return (
                    <TouchableOpacity
                      key={bg.id}
                      onPress={() => onUpdateItem(previewIndex, { textBackground: bg.id })}
                      style={[styles.bgChip, active && styles.bgChipActive]}
                    >
                      <LinearGradient
                        colors={[...bg.colors]}
                        style={styles.bgChipGrad}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                      />
                      <Text style={[styles.bgChipLabel, active && styles.bgChipLabelActive]}>
                        {bg.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {items.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.thumbRow}
            >
              {items.map((item, index) => (
                <TouchableOpacity
                  key={`${item.uri ?? 'text'}-${index}`}
                  style={[styles.thumb, previewIndex === index && styles.thumbActive]}
                  onPress={() => setPreviewIndex(index)}
                >
                  {item.mediaType === 'text' ? (
                    <LinearGradient
                      colors={[...getTextBackground(item.textBackground).colors]}
                      style={styles.thumbImage}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      <Ionicons name="text" size={18} color="#fff" />
                    </LinearGradient>
                  ) : item.mediaType === 'video' ? (
                    <View style={styles.thumbVideo}>
                      <Ionicons name="videocam" size={20} color="#fff" />
                    </View>
                  ) : item.uri ? (
                    <Image source={{ uri: item.uri }} style={styles.thumbImage} />
                  ) : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Duration */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Disappears after</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {DURATION_OPTIONS.map((opt) => {
                const active = durationMinutes === opt.minutes;
                return (
                  <TouchableOpacity
                    key={opt.minutes}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setDurationMinutes(opt.minutes)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* View once */}
          <View style={styles.toggleCard}>
            <View style={styles.toggleLeft}>
              <View style={styles.toggleIcon}>
                <Ionicons name="eye-off-outline" size={20} color={C.primary} />
              </View>
              <View style={styles.toggleText}>
                <Text style={styles.toggleTitle}>View once</Text>
                <Text style={styles.toggleSub}>Vanishes after a friend opens it</Text>
              </View>
            </View>
            <Switch
              value={viewOnce}
              onValueChange={setViewOnce}
              trackColor={{ false: '#d1d5db', true: C.primary }}
            />
          </View>

          {/* Audience */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Who can see this?</Text>
            <View style={styles.audienceTabs}>
              {(
                [
                  { mode: 'friends' as const, icon: 'people', label: 'Friends' },
                  { mode: 'only' as const, icon: 'checkmark-circle', label: 'Only' },
                  { mode: 'except' as const, icon: 'eye-off', label: 'Hide' },
                ] as const
              ).map((tab) => {
                const active = audienceMode === tab.mode;
                return (
                  <TouchableOpacity
                    key={tab.mode}
                    style={[styles.audienceTab, active && styles.audienceTabActive]}
                    onPress={() => {
                      setAudienceMode(tab.mode);
                      if (tab.mode === 'friends') setSelectedIds(new Set());
                    }}
                  >
                    <Ionicons
                      name={tab.icon as keyof typeof Ionicons.glyphMap}
                      size={18}
                      color={active ? '#fff' : C.muted}
                    />
                    <Text style={[styles.audienceTabText, active && styles.audienceTabTextActive]}>
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.audienceHint}>{audienceSummary}</Text>
          </View>

          {audienceMode !== 'friends' && (
            <View style={styles.friendPicker}>
              <View style={styles.searchBox}>
                <Ionicons name="search" size={18} color={C.muted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search friends…"
                  placeholderTextColor={C.muted}
                  value={friendQuery}
                  onChangeText={setFriendQuery}
                />
              </View>
              {friendsLoading ? (
                <ActivityIndicator color={C.primary} style={{ marginVertical: 20 }} />
              ) : filteredFriends.length === 0 ? (
                <Text style={styles.emptyFriends}>No friends to show yet.</Text>
              ) : (
                <FlatList
                  data={filteredFriends}
                  keyExtractor={(f) => f.id}
                  scrollEnabled={false}
                  renderItem={({ item }) => {
                    const checked = selectedIds.has(item.id);
                    return (
                      <TouchableOpacity
                        style={styles.friendRow}
                        onPress={() => toggleFriend(item.id)}
                      >
                        {item.avatar_url ? (
                          <Image source={{ uri: item.avatar_url }} style={styles.friendAvatar} />
                        ) : (
                          <View style={[styles.friendAvatar, styles.friendAvatarFallback]}>
                            <Text style={styles.friendAvatarLetter}>
                              {item.name.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <Text style={styles.friendName}>{item.name}</Text>
                        <View style={[styles.check, checked && styles.checkOn]}>
                          {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
                        </View>
                      </TouchableOpacity>
                    );
                  }}
                />
              )}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: C.bg,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerBtn: { padding: 6, width: 44 },
  addMoreBtn: { padding: 6, width: 44, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: C.text, flex: 1, textAlign: 'center' },
  postBtn: {
    backgroundColor: C.primary,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 72,
    alignItems: 'center',
  },
  postBtnDisabled: { opacity: 0.7 },
  postBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  previewCard: {
    margin: 14,
    height: 380,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: C.border,
  },
  previewMedia: { width: '100%', height: '100%' },
  previewGrad: { ...StyleSheet.absoluteFillObject },
  captionOverlay: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    minHeight: 44,
    textAlignVertical: 'top',
  },
  viewOnceBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  viewOnceBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  previewCountBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  previewCountText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  thumbRow: { paddingHorizontal: 14, gap: 8, marginBottom: 8 },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbActive: { borderColor: C.primary },
  thumbVideo: {
    flex: 1,
    width: '100%',
    backgroundColor: '#1c1c1e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbImage: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  textMomentInput: {
    flex: 1,
    width: '100%',
    color: '#fff',
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  textMomentInputDark: { color: '#1c1c1e' },
  bgChipRow: { gap: 10, paddingBottom: 4 },
  bgChip: {
    alignItems: 'center',
    gap: 6,
    padding: 4,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  bgChipActive: { borderColor: C.primary },
  bgChipGrad: { width: 48, height: 48, borderRadius: 10 },
  bgChipLabel: { fontSize: 11, fontWeight: '600', color: C.muted },
  bgChipLabelActive: { color: C.primary },

  section: { paddingHorizontal: 14, marginTop: 8 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 10,
  },
  chipRow: { gap: 8, paddingBottom: 4 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipActive: { backgroundColor: C.primarySoft, borderColor: C.primary },
  chipText: { fontSize: 14, fontWeight: '600', color: C.muted },
  chipTextActive: { color: C.primaryDark },

  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 14,
    marginTop: 16,
    padding: 14,
    backgroundColor: C.bg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  toggleLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 },
  toggleIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  toggleText: { flex: 1 },
  toggleTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  toggleSub: { fontSize: 12, color: C.muted, marginTop: 2 },

  audienceTabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  audienceTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
  },
  audienceTabActive: { backgroundColor: C.primary, borderColor: C.primary },
  audienceTabText: { fontSize: 13, fontWeight: '700', color: C.muted },
  audienceTabTextActive: { color: '#fff' },
  audienceHint: { fontSize: 13, color: C.muted, marginBottom: 8 },

  friendPicker: {
    marginHorizontal: 14,
    marginTop: 4,
    backgroundColor: C.bg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
    maxHeight: 280,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, color: C.text },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  friendAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  friendAvatarFallback: {
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendAvatarLetter: { color: '#fff', fontWeight: '700' },
  friendName: { flex: 1, fontSize: 15, fontWeight: '600', color: C.text },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: C.primary, borderColor: C.primary },
  emptyFriends: { textAlign: 'center', color: C.muted, padding: 20 },
});
