import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { callGridLayout, type CallTileParticipant } from './callGridUtils';

type Props = {
  participants: CallTileParticipant[];
  renderVideo?: (p: CallTileParticipant, style: object) => React.ReactNode;
  localVideoOverlay?: React.ReactNode;
};

export function CallParticipantGrid({ participants, renderVideo, localVideoOverlay }: Props) {
  const { cols, rows } = callGridLayout(participants.length);
  const tileWidthPct = 100 / cols;
  const tileHeightPct = 100 / rows;

  return (
    <View style={styles.grid}>
      {participants.map((p) => (
        <View
          key={p.identity}
          style={[
            styles.tile,
            { width: `${tileWidthPct}%`, height: `${tileHeightPct}%` },
          ]}
        >
          {p.hasVideo && renderVideo ? (
            renderVideo(p, styles.tileMedia)
          ) : (
            <View style={styles.avatarTile}>
              {p.avatarUrl ? (
                <Image source={{ uri: p.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarLetter}>{p.name.charAt(0).toUpperCase()}</Text>
                </View>
              )}
            </View>
          )}
          <View style={styles.nameBadge}>
            <Text style={styles.nameText} numberOfLines={1}>
              {p.isLocal ? 'You' : p.name}
            </Text>
          </View>
        </View>
      ))}
      {localVideoOverlay}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#0a0a0a',
  },
  tile: {
    position: 'relative',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#222',
    overflow: 'hidden',
  },
  tileMedia: {
    width: '100%',
    height: '100%',
  },
  avatarTile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
  },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  avatarFallback: {
    backgroundColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: '#fff', fontSize: 28, fontWeight: '700' },
  nameBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    maxWidth: '90%',
  },
  nameText: { color: '#fff', fontSize: 11, fontWeight: '600' },
});
