import React, { memo } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ReelDTO } from '../../lib/api';
import type { ReelPlaybackStatus, ReelPlayerHandle } from '../../components/ReelPlayer';
import { REEL_ACTION_RAIL_RIGHT, REEL_ACTION_RAIL_WIDTH, REEL_CONTENT_SHIFT_DOWN } from './reelVideoLayout';
import { ReelFeedMedia } from './ReelFeedMedia';
import { ExpandableCaption } from './ExpandableCaption';
import { ReelSoundStrip } from './ReelSoundStrip';
import { REEL_ACCENT } from './reelTheme';
import {
  formatReelCount,
  reelAuthorLabel,
  reelAvatarUrl,
  reelRowDataEqual,
} from './reelFeedRowUtils';
import { ReelEndScreen } from './ReelEndScreen';

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

export type ReelFeedRowProps = {
  item: ReelDTO;
  index: number;
  currentIndex: number;
  reelWidth: number;
  reelHeight: number;
  desktopActionOffset: number;
  usePhoneFrame: boolean;
  isFocused: boolean;
  mediaShouldPlay: boolean;
  isMuted: boolean;
  volume: number;
  isReady: boolean;
  isFollowing: boolean;
  metaBottom: number;
  myProfileId: string | null;
  videoUri: string;
  onVideoPress: (reel: ReelDTO) => void;
  onDelete: (reel: ReelDTO) => void;
  onToggleLike: (reel: ReelDTO) => void;
  onQuickFollow: (reel: ReelDTO) => void;
  onOpenComments: (reel: ReelDTO) => void;
  onOpenShare: (reel: ReelDTO) => void;
  onOpenGift: (reel: ReelDTO) => void;
  onOpenProfile: (reel: ReelDTO) => void;
  onNavigateSound: (soundId: string) => void;
  onUseReelAudio: (reel: ReelDTO) => void;
  onReady: (reelId: string) => void;
  onPlaybackStatus: (reelId: string, status: ReelPlaybackStatus, isCurrent: boolean) => void;
  onRef: (reelId: string, ref: ReelPlayerHandle | null) => void;
  onMediaIndexChange: (reelId: string, mediaIndex: number) => void;
  showEndScreen?: boolean;
};

function ReelFeedRowComponent({
  item,
  index,
  currentIndex,
  reelWidth,
  reelHeight,
  desktopActionOffset,
  usePhoneFrame,
  isFocused,
  mediaShouldPlay,
  isMuted,
  volume,
  isReady,
  isFollowing,
  metaBottom,
  myProfileId,
  videoUri,
  onVideoPress: _onVideoPress,
  onDelete: _onDelete,
  onToggleLike,
  onQuickFollow,
  onOpenComments,
  onOpenShare,
  onOpenGift,
  onOpenProfile,
  onNavigateSound,
  onUseReelAudio,
  onReady,
  onPlaybackStatus,
  onRef,
  onMediaIndexChange,
  showEndScreen = false,
}: ReelFeedRowProps) {
  const isCurrent = index === currentIndex;
  const isLiked = item.liked_by_me;
  const avatar = reelAvatarUrl(item);
  const author = reelAuthorLabel(item);
  const rowPlaying = isCurrent && mediaShouldPlay;

  return (
    <View
      style={[
        styles.reelContainer,
        { width: reelWidth + desktopActionOffset, height: reelHeight },
        usePhoneFrame && styles.reelContainerDesktop,
      ]}
    >
      <View
        style={[
          styles.reelContent,
          !usePhoneFrame && { transform: [{ translateY: REEL_CONTENT_SHIFT_DOWN }] },
        ]}
      >
          <View
            style={[
              styles.videoTouchLayer,
              usePhoneFrame && [styles.videoTouchLayerDesktop, { width: reelWidth }],
              { pointerEvents: 'none' },
            ]}
          >
        <ReelFeedMedia
          reel={item}
          reelIndex={index}
          currentReelIndex={currentIndex}
          videoUri={videoUri}
          frameWidth={reelWidth}
          frameHeight={reelHeight}
          isFocused={isFocused}
          isPlaying={rowPlaying}
          isMuted={isMuted}
          volume={isMuted ? 0 : volume}
          isReady={isReady}
          onReady={onReady}
          onPlaybackStatus={onPlaybackStatus}
          onRef={onRef}
          onMediaIndexChange={onMediaIndexChange}
        />
        {showEndScreen && isCurrent ? (
          <View
            style={[styles.endScreenHost, usePhoneFrame && { width: reelWidth }]}
            pointerEvents="none"
          >
            <ReelEndScreen ownerName={author} />
          </View>
        ) : null}
      </View>

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
            <TouchableOpacity onPress={() => onOpenProfile(item)}>
              <Text style={styles.username}>@{author}</Text>
            </TouchableOpacity>
            {item.visibility !== 'public' && (
              <View style={styles.visibilityPill}>
                <Ionicons
                  name={
                    item.visibility === 'friends'
                      ? 'people'
                      : item.visibility === 'group'
                        ? 'chatbubbles'
                        : 'lock-closed'
                  }
                  size={11}
                  color="#fff"
                />
              </View>
            )}
          </View>
          {!!item.caption && (
            <ExpandableCaption
              text={item.caption}
              style={styles.caption}
              maxWidth={Math.round(reelWidth * 0.7)}
            />
          )}
          <View style={styles.musicContainer}>
            <ReelSoundStrip
              reel={item}
              authorHandle={author}
              onPressSound={onNavigateSound}
              onPressOriginalAudio={onUseReelAudio}
            />
          </View>
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
          <TouchableOpacity style={styles.profileButton} onPress={() => onOpenProfile(item)}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.profileAvatar} />
            ) : (
              <View style={[styles.profileAvatar, styles.avatarFallback]}>
                <Text style={styles.avatarFallbackText}>{author.charAt(0).toUpperCase()}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.profileFollowPlus} onPress={() => onQuickFollow(item)}>
            <Ionicons name={isFollowing ? 'checkmark' : 'add'} size={17} color="#fff" />
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.actionButton} onPress={() => onToggleLike(item)}>
          <ActionIcon
            name="heart"
            size={36}
            color={isLiked ? REEL_ACCENT : '#fff'}
          />
          <Text style={[styles.actionText, usePhoneFrame && styles.actionTextDesktop]}>
            {formatReelCount(item.like_count)}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={() => onOpenComments(item)}>
          <ActionIcon name="chatbubble-ellipses" size={34} />
          <Text style={[styles.actionText, usePhoneFrame && styles.actionTextDesktop]}>
            {formatReelCount(item.comment_count)}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={() => onOpenShare(item)}>
          <ActionIcon name="paper-plane" size={32} />
          <Text style={[styles.actionText, usePhoneFrame && styles.actionTextDesktop]}>Share</Text>
        </TouchableOpacity>
        {myProfileId && item.author_id !== myProfileId ? (
          <TouchableOpacity style={styles.actionButton} onPress={() => onOpenGift(item)}>
            <ActionIcon name="gift" size={30} color="#fff" />
            <Text style={[styles.actionText, usePhoneFrame && styles.actionTextDesktop]}>Gift</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.actionButton}>
          <ActionIcon name="eye" size={30} />
          <Text style={[styles.actionText, usePhoneFrame && styles.actionTextDesktop]}>
            {formatReelCount(item.view_count)}
          </Text>
        </TouchableOpacity>
      </View>
      </View>
    </View>
  );
}

function propsAreEqual(prev: ReelFeedRowProps, next: ReelFeedRowProps): boolean {
  if (!reelRowDataEqual(prev.item, next.item)) return false;
  if (prev.index !== next.index) return false;
  if (prev.isReady !== next.isReady) return false;
  if (prev.isFollowing !== next.isFollowing) return false;
  if (
    prev.reelWidth !== next.reelWidth ||
    prev.reelHeight !== next.reelHeight ||
    prev.desktopActionOffset !== next.desktopActionOffset ||
    prev.usePhoneFrame !== next.usePhoneFrame ||
    prev.metaBottom !== next.metaBottom ||
    prev.myProfileId !== next.myProfileId ||
    prev.videoUri !== next.videoUri
  ) {
    return false;
  }
  if (prev.isMuted !== next.isMuted || prev.volume !== next.volume) return false;

  const prevCurrent = prev.index === prev.currentIndex;
  const nextCurrent = next.index === next.currentIndex;
  if (prevCurrent || nextCurrent) {
    if (prev.currentIndex !== next.currentIndex) return false;
    if (prev.isFocused !== next.isFocused) return false;
    if (prev.mediaShouldPlay !== next.mediaShouldPlay) return false;
  if (prev.showEndScreen !== next.showEndScreen) return false;
  }

  return true;
}

export const ReelFeedRow = memo(ReelFeedRowComponent, propsAreEqual);

const styles = StyleSheet.create({
  reelContainer: { position: 'relative', backgroundColor: '#000', overflow: 'hidden' },
  reelContainerDesktop: { borderRadius: 16, overflow: 'hidden' },
  reelContent: { ...StyleSheet.absoluteFillObject },
  videoTouchLayer: { ...StyleSheet.absoluteFillObject, zIndex: 1 },
  endScreenHost: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  videoTouchLayerDesktop: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    bottom: 0,
    borderRadius: 16,
    overflow: 'hidden',
  },
  bottomMeta: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 15,
    elevation: 15,
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
  musicContainer: { marginTop: 4 },
  actionButtons: {
    position: 'absolute',
    right: REEL_ACTION_RAIL_RIGHT,
    zIndex: 16,
    elevation: 16,
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 10,
    minWidth: REEL_ACTION_RAIL_WIDTH,
  },
  /** Sit in the gutter to the right of the phone-frame video (Shorts-style). */
  actionButtonsDesktop: {
    right: 0,
    paddingRight: 4,
  },
  actionButton: { alignItems: 'center', gap: 1, minWidth: 48 },
  actionIcon3d: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconDepth: {
    position: 'absolute',
    top: 2,
    left: 1,
  },
  actionIconGlyph: {
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  actionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  actionTextDesktop: { fontSize: 10 },
  profileActionWrap: { alignItems: 'center', marginBottom: 2 },
  profileButton: { marginBottom: -8 },
  profileAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#fff',
  },
  avatarFallback: {
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarFallbackText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  profileFollowPlus: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: REEL_ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#000',
    marginTop: -13,
  },
});
