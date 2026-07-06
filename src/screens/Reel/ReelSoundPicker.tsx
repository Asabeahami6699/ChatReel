import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, type ReelSoundDTO } from '../../lib/api';
import {
  formatDeviceAudioDuration,
  isDeviceAudioLibrarySupported,
  loadDeviceAudioPage,
  requestDeviceAudioPermission,
  resolveDeviceAudioUri,
  type DeviceAudioTrack,
} from '../../lib/deviceAudioLibrary';
import { uploadReelAudio } from '../../lib/reelUploader';
import {
  configurePlaybackAudio,
  createPlaybackPlayer,
  releasePlayer,
  type AudioPlayer,
} from '../../lib/appAudio';
import { REEL_ACCENT } from './reelTheme';
import { pauseReelFeedPlayback } from '../../lib/reelPlaybackBridge';

type Props = {
  visible: boolean;
  selectedId?: string | null;
  onClose: () => void;
  onSelect: (sound: ReelSoundDTO | null) => void;
};

type Tab = 'trending' | 'upload';
type UploadSubTab = 'mine' | 'device' | 'file';

function soundLabel(s: ReelSoundDTO): string {
  return s.artist ? `${s.title} · ${s.artist}` : s.title;
}

export function ReelSoundPicker({ visible, selectedId, onClose, onSelect }: Props) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('trending');
  const [uploadSubTab, setUploadSubTab] = useState<UploadSubTab>('mine');
  const [query, setQuery] = useState('');
  const [sounds, setSounds] = useState<ReelSoundDTO[]>([]);
  const [mySounds, setMySounds] = useState<ReelSoundDTO[]>([]);
  const [deviceTracks, setDeviceTracks] = useState<DeviceAudioTrack[]>([]);
  const [deviceHasMore, setDeviceHasMore] = useState(false);
  const deviceCursorRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMy, setLoadingMy] = useState(false);
  const [loadingDevice, setLoadingDevice] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deviceSupported = isDeviceAudioLibrarySupported();

  const stopPreview = useCallback(async () => {
    setPreviewId(null);
    await releasePlayer(playerRef.current);
    playerRef.current = null;
  }, []);

  const loadSounds = useCallback(async (q?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.reels.sounds({ q: q?.trim() || undefined, trending: true, limit: 50 });
      setSounds(res.sounds ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load sounds');
      setSounds([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMySounds = useCallback(async (q?: string) => {
    setLoadingMy(true);
    setError(null);
    try {
      const res = await api.reels.sounds({ mine: true, limit: 50, q: q?.trim() || undefined });
      setMySounds(res.sounds ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your uploads');
      setMySounds([]);
    } finally {
      setLoadingMy(false);
    }
  }, []);

  const loadDeviceTracks = useCallback(
    async (opts: { reset?: boolean; q?: string } = {}) => {
      if (!deviceSupported) return;
      setLoadingDevice(true);
      setError(null);
      try {
        if (opts.reset) deviceCursorRef.current = null;
        const page = await loadDeviceAudioPage({
          after: deviceCursorRef.current ?? undefined,
          first: 50,
          query: opts.q,
        });
        deviceCursorRef.current = page.endCursor;
        setDeviceTracks((prev) => (opts.reset ? page.tracks : [...prev, ...page.tracks]));
        setDeviceHasMore(page.hasNextPage);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load device audio');
        if (opts.reset) setDeviceTracks([]);
      } finally {
        setLoadingDevice(false);
      }
    },
    [deviceSupported]
  );

  useEffect(() => {
    if (!visible) {
      void stopPreview();
      setTab('trending');
      setUploadSubTab('mine');
      setQuery('');
      setDeviceTracks([]);
      deviceCursorRef.current = null;
      return;
    }
    pauseReelFeedPlayback();
    void loadSounds();
    return () => {
      void stopPreview();
    };
  }, [visible, loadSounds, stopPreview]);

  useEffect(() => {
    if (!visible || tab !== 'trending') return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void loadSounds(query), 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, visible, tab, loadSounds]);

  useEffect(() => {
    if (!visible || tab !== 'upload' || uploadSubTab !== 'mine') return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void loadMySounds(query), 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, visible, tab, uploadSubTab, loadMySounds]);

  useEffect(() => {
    if (!visible || tab !== 'upload' || uploadSubTab !== 'device') return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void loadDeviceTracks({ reset: true, q: query });
    }, 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, visible, tab, uploadSubTab, loadDeviceTracks]);

  const togglePreview = useCallback(
    async (sound: ReelSoundDTO) => {
      if (previewId === sound.id) {
        await stopPreview();
        return;
      }
      await stopPreview();
      await configurePlaybackAudio();
      const src = sound.preview_url ?? sound.audio_url;
      const player = createPlaybackPlayer(src);
      playerRef.current = player;
      setPreviewId(sound.id);
      player.play();
    },
    [previewId, stopPreview]
  );

  const toggleDevicePreview = useCallback(
    async (track: DeviceAudioTrack) => {
      const key = `device:${track.id}`;
      if (previewId === key) {
        await stopPreview();
        return;
      }
      await stopPreview();
      await configurePlaybackAudio();
      const uri = (await resolveDeviceAudioUri(track.id)) ?? track.uri;
      const player = createPlaybackPlayer(uri);
      playerRef.current = player;
      setPreviewId(key);
      player.play();
    },
    [previewId, stopPreview]
  );

  const uploadAndSelect = useCallback(
    async (params: {
      uri: string;
      title: string;
      fileName?: string;
      contentType?: string;
      durationSec?: number;
    }) => {
      setUploading(true);
      setError(null);
      try {
        const audioUrl = await uploadReelAudio({
          uri: params.uri,
          fileName: params.fileName,
          contentType: params.contentType,
        });
        const { sound } = await api.reels.createSound({
          audio_url: audioUrl,
          title: params.title,
          duration_sec: params.durationSec,
        });
        await stopPreview();
        onSelect(sound);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setUploading(false);
      }
    },
    [onClose, onSelect, stopPreview]
  );

  const pickAndUpload = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*', 'audio/mpeg', 'audio/mp4', 'audio/wav'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const title = asset.name?.replace(/\.[^.]+$/, '').slice(0, 80) || 'My sound';
      await uploadAndSelect({
        uri: asset.uri,
        title,
        fileName: asset.name,
        contentType: asset.mimeType ?? undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    }
  }, [uploadAndSelect]);

  const importDeviceTrack = useCallback(
    async (track: DeviceAudioTrack) => {
      const uri = (await resolveDeviceAudioUri(track.id)) ?? track.uri;
      await uploadAndSelect({
        uri,
        title: track.title,
        fileName: track.fileName,
        durationSec: track.durationSec > 0 ? track.durationSec : undefined,
      });
    },
    [uploadAndSelect]
  );

  const handleSelect = useCallback(
    (sound: ReelSoundDTO) => {
      void stopPreview();
      onSelect(sound);
      onClose();
    },
    [onClose, onSelect, stopPreview]
  );

  const handleRemove = useCallback(() => {
    void stopPreview();
    onSelect(null);
    onClose();
  }, [onClose, onSelect, stopPreview]);

  const requestDeviceAccess = useCallback(async () => {
    const granted = await requestDeviceAudioPermission();
    if (granted) {
      void loadDeviceTracks({ reset: true, q: query });
    } else {
      setError('Allow media access in Settings to browse music on your device.');
    }
  }, [loadDeviceTracks, query]);

  const renderSoundRow = (item: ReelSoundDTO, index: number, opts?: { showRank?: boolean }) => {
    const active = selectedId === item.id;
    const playing = previewId === item.id;
    const viral = item.usage_count >= 3;
    return (
      <Pressable
        key={item.id}
        style={[styles.row, active && styles.rowActive]}
        onPress={() => handleSelect(item)}
      >
        {opts?.showRank ? <Text style={styles.rank}>{index + 1}</Text> : <View style={styles.rowIcon} />}
        <View style={styles.rowBody}>
          <View style={styles.rowTitleRow}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {item.title}
            </Text>
            {viral ? (
              <View style={styles.viralPill}>
                <Text style={styles.viralText}>Viral</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.rowSub} numberOfLines={1}>
            {item.artist ?? 'Unknown'}
            {item.usage_count > 0 ? ` · ${item.usage_count} reels` : ''}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.previewBtn, playing && styles.previewBtnActive]}
          onPress={() => void togglePreview(item)}
        >
          <Ionicons name={playing ? 'pause' : 'play'} size={15} color="#fff" />
        </TouchableOpacity>
      </Pressable>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.handle} />

        <View style={styles.header}>
          <Text style={styles.title}>Sounds</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {selectedId ? (
          <TouchableOpacity style={styles.removeBtn} onPress={handleRemove}>
            <Ionicons name="volume-mute" size={18} color="#ff6b6b" />
            <Text style={styles.removeText}>Remove sound — use original audio</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.tabs}>
          {(
            [
              { id: 'trending' as const, label: 'Trending', icon: 'flame' },
              { id: 'upload' as const, label: 'Your audio', icon: 'musical-notes' },
            ] as const
          ).map((t) => {
            const active = tab === t.id;
            return (
              <TouchableOpacity
                key={t.id}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setTab(t.id)}
              >
                <Ionicons name={t.icon as never} size={15} color={active ? '#fff' : '#888'} />
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {tab === 'trending' ? (
          <>
            <View style={styles.searchRow}>
              <Ionicons name="search" size={17} color="#888" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search viral sounds…"
                placeholderTextColor="#666"
                value={query}
                onChangeText={setQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {loading && sounds.length === 0 ? (
              <View style={styles.center}>
                <ActivityIndicator color={REEL_ACCENT} />
              </View>
            ) : error ? (
              <View style={styles.center}>
                <Text style={styles.error}>{error}</Text>
                <TouchableOpacity onPress={() => void loadSounds(query)}>
                  <Text style={styles.retry}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <FlatList
                data={sounds}
                keyExtractor={(item) => item.id}
                style={styles.list}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item, index }) => renderSoundRow(item, index, { showRank: true })}
                ListEmptyComponent={
                  <View style={styles.center}>
                    <Text style={styles.empty}>No sounds yet — upload your own</Text>
                  </View>
                }
              />
            )}
          </>
        ) : (
          <>
            <View style={styles.subTabs}>
              {(
                [
                  { id: 'mine' as const, label: 'My uploads' },
                  ...(deviceSupported ? [{ id: 'device' as const, label: 'On device' }] : []),
                  { id: 'file' as const, label: 'Import file' },
                ] as const
              ).map((st) => {
                const active = uploadSubTab === st.id;
                return (
                  <TouchableOpacity
                    key={st.id}
                    style={[styles.subTab, active && styles.subTabActive]}
                    onPress={() => setUploadSubTab(st.id)}
                  >
                    <Text style={[styles.subTabText, active && styles.subTabTextActive]}>
                      {st.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {uploadSubTab === 'file' ? (
              <View style={styles.uploadPane}>
                <Ionicons name="folder-open-outline" size={48} color="#444" />
                <Text style={styles.uploadTitle}>Import from files</Text>
                <Text style={styles.uploadHint}>
                  Pick an MP3, M4A, or WAV from your device or cloud storage.
                  {Platform.OS === 'web' ? ' On web, use this option to add audio.' : ''}
                </Text>
                <TouchableOpacity
                  style={[styles.uploadBtn, uploading && styles.uploadBtnBusy]}
                  onPress={() => void pickAndUpload()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="document" size={18} color="#fff" />
                      <Text style={styles.uploadBtnText}>Choose audio file</Text>
                    </>
                  )}
                </TouchableOpacity>
                {error ? <Text style={styles.error}>{error}</Text> : null}
              </View>
            ) : (
              <>
                <View style={styles.searchRow}>
                  <Ionicons name="search" size={17} color="#888" />
                  <TextInput
                    style={styles.searchInput}
                    placeholder={
                      uploadSubTab === 'mine' ? 'Search your uploads…' : 'Search device audio…'
                    }
                    placeholderTextColor="#666"
                    value={query}
                    onChangeText={setQuery}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                {uploadSubTab === 'mine' ? (
                  loadingMy && mySounds.length === 0 ? (
                    <View style={styles.center}>
                      <ActivityIndicator color={REEL_ACCENT} />
                    </View>
                  ) : (
                    <FlatList
                      data={mySounds}
                      keyExtractor={(item) => item.id}
                      style={styles.list}
                      keyboardShouldPersistTaps="handled"
                      renderItem={({ item, index }) => renderSoundRow(item, index)}
                      ListEmptyComponent={
                        <View style={styles.center}>
                          <Text style={styles.empty}>No uploads yet</Text>
                          <Text style={styles.emptyHint}>
                            Import a file or pick from your device to add sounds here.
                          </Text>
                        </View>
                      }
                    />
                  )
                ) : loadingDevice && deviceTracks.length === 0 ? (
                  <View style={styles.center}>
                    <ActivityIndicator color={REEL_ACCENT} />
                  </View>
                ) : deviceTracks.length === 0 && !loadingDevice ? (
                  <View style={styles.center}>
                    <Ionicons name="phone-portrait-outline" size={40} color="#444" />
                    <Text style={styles.empty}>No audio found on this device</Text>
                    <TouchableOpacity style={styles.linkBtn} onPress={() => void requestDeviceAccess()}>
                      <Text style={styles.linkBtnText}>Grant media access</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <FlatList
                    data={deviceTracks}
                    keyExtractor={(item) => item.id}
                    style={styles.list}
                    keyboardShouldPersistTaps="handled"
                    onEndReached={() => {
                      if (deviceHasMore && !loadingDevice) {
                        void loadDeviceTracks({ q: query });
                      }
                    }}
                    onEndReachedThreshold={0.4}
                    renderItem={({ item }) => {
                      const key = `device:${item.id}`;
                      const playing = previewId === key;
                      return (
                        <Pressable
                          style={styles.row}
                          onPress={() => !uploading && void importDeviceTrack(item)}
                          disabled={uploading}
                        >
                          <View style={styles.rowIcon}>
                            <Ionicons name="musical-note" size={16} color="#888" />
                          </View>
                          <View style={styles.rowBody}>
                            <Text style={styles.rowTitle} numberOfLines={1}>
                              {item.title}
                            </Text>
                            <Text style={styles.rowSub} numberOfLines={1}>
                              {formatDeviceAudioDuration(item.durationSec)}
                              {uploading ? ' · uploading…' : ' · tap to use'}
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={[styles.previewBtn, playing && styles.previewBtnActive]}
                            onPress={() => void toggleDevicePreview(item)}
                          >
                            <Ionicons name={playing ? 'pause' : 'play'} size={15} color="#fff" />
                          </TouchableOpacity>
                        </Pressable>
                      );
                    }}
                    ListFooterComponent={
                      loadingDevice ? (
                        <View style={styles.footerLoader}>
                          <ActivityIndicator color={REEL_ACCENT} size="small" />
                        </View>
                      ) : null
                    }
                  />
                )}

                {error && uploadSubTab !== 'file' ? (
                  <Text style={[styles.error, styles.errorInline]}>{error}</Text>
                ) : null}
              </>
            )}
          </>
        )}
      </View>
    </Modal>
  );
}

export { soundLabel };

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '78%',
    backgroundColor: '#111',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#444',
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
  title: { color: '#fff', fontSize: 18, fontWeight: '700' },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,107,107,0.12)',
  },
  removeText: { color: '#ff8a80', fontSize: 14, fontWeight: '600' },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  tabActive: { backgroundColor: '#2a2a2a' },
  tabText: { color: '#888', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  subTabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 10,
    gap: 8,
  },
  subTab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#1a1a1a',
  },
  subTabActive: { backgroundColor: '#2a2a2a', borderWidth: 1, borderColor: REEL_ACCENT },
  subTabText: { color: '#888', fontSize: 12, fontWeight: '600' },
  subTabTextActive: { color: '#fff' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
    gap: 8,
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 15, padding: 0 },
  list: { maxHeight: 360 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 28 },
  footerLoader: { paddingVertical: 12 },
  error: { color: '#ff6b6b', textAlign: 'center', marginTop: 8 },
  errorInline: { marginHorizontal: 16, marginBottom: 8 },
  retry: { color: REEL_ACCENT, fontWeight: '600', marginTop: 8 },
  empty: { color: '#888', textAlign: 'center' },
  emptyHint: { color: '#666', fontSize: 12, textAlign: 'center', marginTop: 6, paddingHorizontal: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  rowActive: { backgroundColor: 'rgba(0,122,255,0.1)' },
  rank: { color: '#666', fontSize: 13, fontWeight: '700', width: 20, textAlign: 'center' },
  rowIcon: { width: 20, alignItems: 'center' },
  rowBody: { flex: 1 },
  rowTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { color: '#fff', fontSize: 15, fontWeight: '600', flexShrink: 1 },
  viralPill: {
    backgroundColor: 'rgba(255,149,0,0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  viralText: { color: '#ffb340', fontSize: 10, fontWeight: '700' },
  rowSub: { color: '#888', fontSize: 12, marginTop: 2 },
  previewBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBtnActive: { backgroundColor: REEL_ACCENT },
  uploadPane: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 28,
    gap: 10,
  },
  uploadTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  uploadHint: { color: '#888', fontSize: 13, textAlign: 'center', lineHeight: 19 },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 24,
    backgroundColor: REEL_ACCENT,
  },
  uploadBtnBusy: { opacity: 0.7 },
  uploadBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  linkBtn: { marginTop: 12 },
  linkBtnText: { color: REEL_ACCENT, fontWeight: '600', fontSize: 14 },
});
