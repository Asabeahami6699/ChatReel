import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  configurePlaybackAudio,
  createPlaybackPlayer,
  releasePlayer,
  seekPlaybackPlayer,
  type AudioPlayer,
} from '../lib/appAudio';
import { soundClipWindow } from '../screens/Reel/reelSoundUtils';
import { ReelSoundTrimTimeline } from '../screens/Reel/ReelSoundTrimTimeline';
import { RINGTONE_CLIP_SEC } from '../lib/ringtoneTrim';

export { RINGTONE_CLIP_SEC };

type Props = {
  visible: boolean;
  uri: string;
  label: string;
  initialStartSec?: number;
  initialEndSec?: number | null;
  onCancel: () => void;
  onSave: (range: { startSec: number; endSec: number }) => void;
};

function formatSec(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Pick a up-to-60s favourite window inside a custom ringtone file.
 * Shorter files use the whole track.
 */
export function RingtoneTrimModal({
  visible,
  uri,
  label,
  initialStartSec = 0,
  initialEndSec = null,
  onCancel,
  onSave,
}: Props) {
  const insets = useSafeAreaInsets();
  const playerRef = useRef<AudioPlayer | null>(null);
  const [trackLen, setTrackLen] = useState(RINGTONE_CLIP_SEC);
  const [startSec, setStartSec] = useState(0);
  const [endSec, setEndSec] = useState(RINGTONE_CLIP_SEC);
  const [previewSec, setPreviewSec] = useState(0);
  const [playing, setPlaying] = useState(false);
  const clipLen = Math.min(RINGTONE_CLIP_SEC, Math.max(1, trackLen));

  useEffect(() => {
    if (!visible || !uri) return;
    let alive = true;
    let poll: ReturnType<typeof setInterval> | null = null;

    (async () => {
      try {
        await configurePlaybackAudio();
        const player = createPlaybackPlayer(uri);
        playerRef.current = player;
        // Wait briefly for metadata then read duration.
        await new Promise((r) => setTimeout(r, Platform.OS === 'web' ? 200 : 350));
        if (!alive) return;
        let duration = Number(player.duration) || 0;
        if (!Number.isFinite(duration) || duration <= 0) duration = RINGTONE_CLIP_SEC;
        setTrackLen(duration);
        const clip = Math.min(RINGTONE_CLIP_SEC, duration);
        const initEnd =
          initialEndSec != null && initialEndSec > initialStartSec
            ? initialEndSec
            : initialStartSec + clip;
        const windowed = soundClipWindow(duration, clip, initialStartSec);
        // Prefer saved end if it fits; else sliding 60s window.
        const start =
          initEnd - initialStartSec <= clip + 0.05
            ? Math.max(0, Math.min(initialStartSec, Math.max(0, duration - clip)))
            : windowed.start;
        const end = Math.min(duration, start + clip);
        setStartSec(start);
        setEndSec(end);
        setPreviewSec(start);
        await seekPlaybackPlayer(player, start);

        poll = setInterval(() => {
          const p = playerRef.current;
          if (!p) return;
          const t = Number(p.currentTime) || 0;
          const s = startSecRef.current;
          const e = endSecRef.current;
          if (t < s - 0.05 || t >= e - 0.08) {
            void seekPlaybackPlayer(p, s);
            setPreviewSec(s);
            return;
          }
          setPreviewSec(t);
        }, 200);
      } catch {
        /* keep defaults */
      }
    })();

    return () => {
      alive = false;
      if (poll) clearInterval(poll);
      void releasePlayer(playerRef.current);
      playerRef.current = null;
      setPlaying(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- remount trim when uri/open changes
  }, [visible, uri]);

  const startSecRef = useRef(startSec);
  const endSecRef = useRef(endSec);
  startSecRef.current = startSec;
  endSecRef.current = endSec;

  const applyStart = (sec: number) => {
    const next = soundClipWindow(trackLen, clipLen, sec);
    setStartSec(next.start);
    setEndSec(next.end);
    setPreviewSec(next.start);
    const p = playerRef.current;
    if (p) void seekPlaybackPlayer(p, next.start);
  };

  const applyEnd = (sec: number) => {
    const next = soundClipWindow(trackLen, clipLen, sec - clipLen);
    setStartSec(next.start);
    setEndSec(next.end);
    setPreviewSec(next.start);
    const p = playerRef.current;
    if (p) void seekPlaybackPlayer(p, next.start);
  };

  const togglePreview = async () => {
    const p = playerRef.current;
    if (!p) return;
    try {
      if (playing) {
        p.pause();
        setPlaying(false);
        return;
      }
      await seekPlaybackPlayer(p, startSec);
      setPreviewSec(startSec);
      p.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={[styles.wrap, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onCancel} hitSlop={12}>
            <Ionicons name="close" size={24} color="#111" />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.title}>Trim ringtone</Text>
            <Text style={styles.sub} numberOfLines={1}>
              {label} · save favourite 1 minute only
            </Text>
          </View>
          <TouchableOpacity
            style={styles.saveBtn}
            onPress={() => onSave({ startSec, endSec })}
          >
            <Text style={styles.saveText}>Save</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.hint}>
          Drag to choose the 1-minute section that will be saved to your ringtone library
          {trackLen > clipLen ? ` (from ${formatSec(trackLen)} track)` : ''}.
        </Text>

        <ReelSoundTrimTimeline
          duration={Math.max(trackLen, clipLen)}
          startSec={startSec}
          endSec={endSec}
          previewSec={Math.max(startSec, Math.min(previewSec, endSec))}
          onStartChange={applyStart}
          onEndChange={applyEnd}
          onPreviewChange={(sec) => {
            setPreviewSec(sec);
            const p = playerRef.current;
            if (p) void seekPlaybackPlayer(p, sec);
          }}
          onPreviewStart={() => {
            playerRef.current?.pause();
            setPlaying(false);
          }}
          onPreviewComplete={(sec) => {
            setPreviewSec(sec);
            const p = playerRef.current;
            if (p) void seekPlaybackPlayer(p, sec);
          }}
        />

        <TouchableOpacity style={styles.playBtn} onPress={() => void togglePreview()}>
          <Ionicons name={playing ? 'pause' : 'play'} size={22} color="#fff" />
          <Text style={styles.playText}>{playing ? 'Pause' : 'Preview clip'}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#f8fafc', paddingHorizontal: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  headerText: { flex: 1 },
  title: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  sub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  saveBtn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  hint: { color: '#475569', fontSize: 13, marginBottom: 16, lineHeight: 18 },
  playBtn: {
    marginTop: 24,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#111827',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 24,
  },
  playText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
