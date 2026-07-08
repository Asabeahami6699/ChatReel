import React, { memo } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ReelDTO } from '../../lib/api';
import type { ReelPlaybackStatus, ReelPlayerHandle } from '../../components/ReelPlayer';
import { REEL_ACTION_RAIL_LEFT, REEL_ACTION_RAIL_WIDTH } from './reelVideoLayout';
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

function ActionIcon({
  name,
  size = 28,
  color = '#fff',
}: {
  name: keyof typeof Ionicons.glyphMap;
  size?: number;
  color?: string;
}) {
  return <Ionicons name={name} size={size} color={color} />;
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
  videoUri: string;
  onVideoPress: (reel: ReelDTO) => void;
  onDelete: (reel: ReelDTO) => void;
  onToggleLike: (reel: ReelDTO) => void;
  onQuickFollow: (reel: ReelDTO) => void;
  onOpenComments: (reel: ReelDTO) => void;
  onOpenShare: (reel: ReelDTO) => void;
  onOpenProfile: (reel: ReelDTO) => void;
  onNavigateSound: (soundId: string) => void;
  onUseReelAudio: (reel: ReelDTO) => void;
  onReady: (reelId: string) => void;
  onPlaybackStatus: (reelId: string, status: ReelPlaybackStatus, isCurrent: boolean) => void;
  onRef: (reelId: string, ref: ReelPlayerHandle | null) => void;
  onMediaIndexChange: (reelId: string, mediaIndex: number) => void;
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
  videoUri,
  onVideoPress,
  onDelete,
  onToggleLike,
  onQuickFollow,
  onOpenComments,
  onOpenShare,
  onOpenProfile,
  onNavigateSound,
  onUseReelAudio,
  onReady,
  onPlaybackStatus,
  onRef,
  onMediaIndexChange,
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
      <TouchableOpacity
        activeOpacity={1}
        onPress={() => onVideoPress(item)}
        onLongPress={() => onDelete(item)}
        delayLongPress={700}
        style={[
          styles.videoTouchLayer,
          usePhoneFrame && [styles.videoTouchLayerDesktop, { width: reelWidth }],
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
      </TouchableOpacity>

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
              paddingLeft: usePhoneFrame ? 8 : REEL_ACTION_RAIL_WIDTH + 12,
              paddingRight: usePhoneFrame ? 8 : 12,
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
            <Ionicons name={isFollowing ? 'checkmark' : 'add'} size={13} color="#fff" />
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.actionButton} onPress={() => onToggleLike(item)}>
          <ActionIcon
            name={isLiked ? 'heart' : 'heart-outline'}
            size={28}
            color={isLiked ? REEL_ACCENT : '#fff'}
          />
          <Text style={[styles.actionText, usePhoneFrame && styles.actionTextDesktop]}>
            {formatReelCount(item.like_count)}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={() => onOpenComments(item)}>
          <ActionIcon name="chatbubble-ellipses-outline" size={26} />
          <Text style={[styles.actionText, usePhoneFrame && styles.actionTextDesktop]}>
            {formatReelCount(item.comment_count)}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={() => onOpenShare(item)}>
          <ActionIcon name="paper-plane-outline" size={24} />
          <Text style={[styles.actionText, usePhoneFrame && styles.actionTextDesktop]}>Share</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton}>
          <ActionIcon name="eye-outline" size={22} />
          <Text style={[styles.actionText, usePhoneFrame && styles.actionTextDesktop]}>
            {formatReelCount(item.view_count)}
          </Text>
        </TouchableOpacity>
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
  }

  return true;
}

export const ReelFeedRow = memo(ReelFeedRowComponent, propsAreEqual);

const styles = StyleSheet.create({
  reelContainer: { position: 'relative', backgroundColor: '#000', overflow: 'hidden' },
  reelContainerDesktop: { borderRadius: 16, overflow: 'hidden' },
  videoTouchLayer: { ...StyleSheet.absoluteFillObject, zIndex: 1 },
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
    left: REEL_ACTION_RAIL_LEFT,
    zIndex: 16,
    elevation: 16,
    alignItems: 'center',
    gap: 14,
    width: REEL_ACTION_RAIL_WIDTH,
  },
  actionButtonsDesktop: { left: REEL_ACTION_RAIL_LEFT },
  actionButton: { alignItems: 'center', gap: 3 },
  actionText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  actionTextDesktop: { fontSize: 11 },
  profileActionWrap: { alignItems: 'center', marginBottom: 4 },
  profileButton: { marginBottom: -6 },
  profileAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
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
