import React, { memo } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ReelDTO } from '../../lib/api';
import { REEL_ACTION_RAIL_RIGHT, REEL_ACTION_RAIL_WIDTH, REEL_CONTENT_SHIFT_DOWN } from './reelVideoLayout';
import { ExpandableCaption } from './ExpandableCaption';
import { ReelSoundStrip } from './ReelSoundStrip';
import { REEL_ACCENT } from './reelTheme';
import { formatReelCount, reelAuthorLabel, reelAvatarUrl } from './reelFeedRowUtils';

function ActionIcon({
  name,
  size = 28,
  color = '#fff',
}: {
  name: keyof typeof Ionicons.glyphMap;
  size?: number;
  color?: string;
}) {
  return (
    <View style={[styles.actionIcon3d, { width: size + 6, height: size + 6 }]}>
      <Ionicons
        name={name}
        size={size}
        color="rgba(0,0,0,0.55)"
        style={styles.actionIconDepth}
      />
      <Ionicons name={name} size={size} color={color} style={styles.actionIconGlyph} />
    </View>
  );
}

type Props = {
  reel: ReelDTO;
  reelWidth: number;
  reelHeight: number;
  usePhoneFrame: boolean;
  desktopActionOffset: number;
  metaBottom: number;
  myProfileId: string | null;
  isFollowing: boolean;
  onToggleLike: () => void;
  onQuickFollow: () => void;
  onOpenComments: () => void;
  onOpenShare: () => void;
  onOpenGift: () => void;
  onOpenProfile: () => void;
  onNavigateSound: (soundId: string) => void;
  onUseReelAudio: () => void;
  onTogglePlayPause: () => void;
};

/**
 * Captions + engagement rail floated ABOVE the scroller (pointerEvents box-none).
 * Empty space passes touches through to the ScrollView so vertical swipe works.
 */
function ReelFloatingChromeComponent({
  reel,
  reelWidth,
  usePhoneFrame,
  metaBottom,
  myProfileId,
  isFollowing,
  onToggleLike,
  onQuickFollow,
  onOpenComments,
  onOpenShare,
  onOpenGift,
  onOpenProfile,
  onNavigateSound,
  onUseReelAudio,
  onTogglePlayPause,
}: Props) {
  const avatar = reelAvatarUrl(reel);
  const author = reelAuthorLabel(reel);
  const isLiked = reel.liked_by_me;

  return (
    <View
      style={[styles.layer, !usePhoneFrame && { transform: [{ translateY: REEL_CONTENT_SHIFT_DOWN }] }]}
      pointerEvents="box-none"
    >
      {/* Center tap target — NOT full-bleed, so edge swipes hit the ScrollView */}
      <TouchableOpacity
        activeOpacity={1}
        onPress={onTogglePlayPause}
        style={styles.centerTap}
        accessibilityLabel="Play or pause"
      />

      <View
        style={[
          styles.bottomMeta,
          usePhoneFrame && [styles.bottomMetaDesktop, { width: reelWidth }],
        ]}
        pointerEvents="box-none"
      >
        <View
          style={[
            styles.captionContainer,
            {
              marginBottom: metaBottom,
              paddingRight: usePhoneFrame ? 8 : REEL_ACTION_RAIL_WIDTH + 8,
            },
          ]}
        >
          <View style={styles.userInfo}>
            <TouchableOpacity onPress={onOpenProfile}>
              <Text style={styles.username}>@{author}</Text>
            </TouchableOpacity>
            {reel.visibility !== 'public' && (
              <View style={styles.visibilityPill}>
                <Ionicons
                  name={
                    reel.visibility === 'friends'
                      ? 'people'
                      : reel.visibility === 'group'
                        ? 'chatbubbles'
                        : 'lock-closed'
                  }
                  size={11}
                  color="#fff"
                />
              </View>
            )}
          </View>
          {!!reel.caption && (
            <ExpandableCaption
              text={reel.caption}
              style={styles.caption}
              maxWidth={Math.round(reelWidth * 0.7)}
            />
          )}
          <ReelSoundStrip
            reel={reel}
            authorHandle={author}
            onPressSound={onNavigateSound}
            onPressOriginalAudio={onUseReelAudio}
          />
        </View>
      </View>

      <View
        style={[
          styles.actionButtons,
          { bottom: metaBottom },
          usePhoneFrame && styles.actionButtonsDesktop,
        ]}
      >
        <View style={styles.profileActionWrap}>
          <TouchableOpacity style={styles.profileButton} onPress={onOpenProfile}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.profileAvatar} />
            ) : (
              <View style={[styles.profileAvatar, styles.avatarFallback]}>
                <Text style={styles.avatarFallbackText}>{author.charAt(0).toUpperCase()}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.profileFollowPlus} onPress={onQuickFollow}>
            <Ionicons name={isFollowing ? 'checkmark' : 'add'} size={17} color="#fff" />
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.actionButton} onPress={onToggleLike}>
          <ActionIcon name="heart" size={36} color={isLiked ? REEL_ACCENT : '#fff'} />
          <Text style={[styles.actionText, usePhoneFrame && styles.actionTextDesktop]}>
            {formatReelCount(reel.like_count)}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={onOpenComments}>
          <ActionIcon name="chatbubble-ellipses" size={34} />
          <Text style={[styles.actionText, usePhoneFrame && styles.actionTextDesktop]}>
            {formatReelCount(reel.comment_count)}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={onOpenShare}>
          <ActionIcon name="paper-plane" size={32} />
          <Text style={[styles.actionText, usePhoneFrame && styles.actionTextDesktop]}>Share</Text>
        </TouchableOpacity>
        {myProfileId && reel.author_id !== myProfileId ? (
          <TouchableOpacity style={styles.actionButton} onPress={onOpenGift}>
            <ActionIcon name="gift" size={30} color="#fff" />
            <Text style={[styles.actionText, usePhoneFrame && styles.actionTextDesktop]}>Gift</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.actionButton}>
          <ActionIcon name="eye" size={30} />
          <Text style={[styles.actionText, usePhoneFrame && styles.actionTextDesktop]}>
            {formatReelCount(reel.view_count)}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export const ReelFloatingChrome = memo(ReelFloatingChromeComponent);

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 14,
  },
  centerTap: {
    position: 'absolute',
    top: '22%',
    bottom: '28%',
    left: '26%',
    right: '22%',
  },
  bottomMeta: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 14,
  },
  bottomMetaDesktop: {
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  captionContainer: { marginBottom: 0 },
  userInfo: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 },
  username: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },
  visibilityPill: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  caption: { color: '#fff', fontSize: 14, lineHeight: 19, fontWeight: '500' },
  actionButtons: {
    position: 'absolute',
    right: REEL_ACTION_RAIL_RIGHT,
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 10,
    minWidth: REEL_ACTION_RAIL_WIDTH,
  },
  actionButtonsDesktop: {
    right: 0,
    paddingRight: 4,
  },
  actionButton: { alignItems: 'center', gap: 1, minWidth: 48 },
  actionIcon3d: { alignItems: 'center', justifyContent: 'center' },
  actionIconDepth: { position: 'absolute', top: 2, left: 1 },
  actionIconGlyph: {
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  actionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  actionTextDesktop: { fontSize: 11 },
  profileActionWrap: { alignItems: 'center', marginBottom: 4 },
  profileButton: {},
  profileAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#fff',
  },
  avatarFallback: {
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarFallbackText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  profileFollowPlus: {
    marginTop: -10,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: REEL_ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#000',
  },
});
