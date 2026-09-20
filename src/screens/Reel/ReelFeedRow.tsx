import React, { memo } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ReelDTO } from '../../lib/api';
import type { ReelPlaybackStatus, ReelPlayerHandle } from '../../components/ReelPlayer';
import { getReelMediaItems } from '../../lib/reelPlayback';
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
import { ReelVideoTapLayer } from './ReelVideoTapLayer';
import { ReelActionIcon } from './ReelActionIcon';

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
  onUseThisSound?: (reel: ReelDTO) => void;
  onSponsoredCta?: (reel: ReelDTO) => void;
  onReady: (reelId: string) => void;
  onPlaybackStatus: (reelId: string, status: ReelPlaybackStatus, isCurrent: boolean) => void;
  onRef: (reelId: string, ref: ReelPlayerHandle | null) => void;
  onMediaIndexChange: (reelId: string, mediaIndex: number) => void;
  onSwipePastLastMedia?: (reel: ReelDTO) => void;
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
  onVideoPress,
  onDelete: _onDelete,
  onToggleLike,
  onQuickFollow,
  onOpenComments,
  onOpenShare,
  onOpenGift,
  onOpenProfile,
  onNavigateSound,
  onUseReelAudio,
  onUseThisSound,
  onSponsoredCta,
  onReady,
  onPlaybackStatus,
  onRef,
  onMediaIndexChange,
  onSwipePastLastMedia,
  showEndScreen = false,
}: ReelFeedRowProps) {
  const isCurrent = index === currentIndex;
  const isLiked = item.liked_by_me;
  const avatar = reelAvatarUrl(item);
  const author = reelAuthorLabel(item);
  const sponsored = Boolean(item.is_sponsored);
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
            ]}
            pointerEvents="box-none"
          >
        <View
          pointerEvents={getReelMediaItems(item).length > 1 ? 'box-none' : 'none'}
          style={StyleSheet.absoluteFill}
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
            onSwipePastLastMedia={onSwipePastLastMedia}
          />
        </View>
        {showEndScreen && isCurrent ? (
          <View
            style={[styles.endScreenHost, usePhoneFrame && { width: reelWidth }]}
            pointerEvents="none"
          >
            <ReelEndScreen ownerName={author} />
          </View>
        ) : null}
        <ReelVideoTapLayer onPress={() => onVideoPress(item)} />
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
          // Empty caption space must pass vertical drags to the pager.
          pointerEvents="box-none"
        >
          <View style={styles.userInfo}>
            <TouchableOpacity onPress={() => (sponsored ? undefined : onOpenProfile(item))} disabled={sponsored}>
              <Text style={styles.username}>{sponsored ? author : `@${author}`}</Text>
            </TouchableOpacity>
            {sponsored ? (
              <View style={styles.sponsoredPill}>
                <Text style={styles.sponsoredPillText}>Sponsored</Text>
              </View>
            ) : item.visibility !== 'public' ? (
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
            ) : null}
          </View>
          {!!item.caption && (
            <ExpandableCaption
              text={item.caption}
              style={styles.caption}
              maxWidth={Math.round(reelWidth * 0.7)}
            />
          )}
          {sponsored && item.cta_url && onSponsoredCta ? (
            <TouchableOpacity
              style={styles.ctaButton}
              onPress={() => onSponsoredCta(item)}
              activeOpacity={0.88}
            >
              <Text style={styles.ctaButtonText} numberOfLines={1}>
                {item.cta_label?.trim() || 'Learn more'}
              </Text>
              <Ionicons name="open-outline" size={14} color="#0f172a" />
            </TouchableOpacity>
          ) : (
            <View style={styles.musicContainer}>
              <ReelSoundStrip
                reel={item}
                authorHandle={author}
                onPressSound={onNavigateSound}
                onUseThisSound={onUseThisSound}
                onPressOriginalAudio={onUseReelAudio}
              />
            </View>
          )}
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
          <TouchableOpacity
            style={styles.profileButton}
            onPress={() => (sponsored ? onSponsoredCta?.(item) : onOpenProfile(item))}
            disabled={sponsored && !onSponsoredCta}
          >
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.profileAvatar} />
            ) : (
              <View style={[styles.profileAvatar, styles.avatarFallback]}>
                <Text style={styles.avatarFallbackText}>{author.charAt(0).toUpperCase()}</Text>
              </View>
            )}
          </TouchableOpacity>
          {!sponsored ? (
            <TouchableOpacity style={styles.profileFollowPlus} onPress={() => onQuickFollow(item)}>
              <Ionicons name={isFollowing ? 'checkmark' : 'add'} size={17} color="#fff" />
            </TouchableOpacity>
          ) : null}
        </View>
        {!sponsored ? (
          <>
            <TouchableOpacity style={styles.actionButton} onPress={() => onToggleLike(item)}>
              <ReelActionIcon
                name="heart"
                size={36}
                color={isLiked ? REEL_ACCENT : '#fff'}
              />
              <Text style={[styles.actionText, usePhoneFrame && styles.actionTextDesktop]}>
                {formatReelCount(item.like_count)}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={() => onOpenComments(item)}>
              <ReelActionIcon name="chatbubble-ellipses" size={34} />
              <Text style={[styles.actionText, usePhoneFrame && styles.actionTextDesktop]}>
                {formatReelCount(item.comment_count)}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={() => onOpenShare(item)}>
              <ReelActionIcon name="paper-plane" size={32} />
              <Text style={[styles.actionText, usePhoneFrame && styles.actionTextDesktop]}>Share</Text>
            </TouchableOpacity>
            {myProfileId && item.author_id !== myProfileId ? (
              <TouchableOpacity style={styles.actionButton} onPress={() => onOpenGift(item)}>
                <ReelActionIcon name="gift" size={30} color="#fff" />
                <Text style={[styles.actionText, usePhoneFrame && styles.actionTextDesktop]}>Gift</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.actionButton}>
              <ReelActionIcon name="eye" size={30} />
              <Text style={[styles.actionText, usePhoneFrame && styles.actionTextDesktop]}>
                {formatReelCount(item.view_count)}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => onSponsoredCta?.(item)}
            disabled={!onSponsoredCta}
          >
            <ReelActionIcon name="open" size={30} />
            <Text style={[styles.actionText, usePhoneFrame && styles.actionTextDesktop]}>
              {(item.cta_label?.trim() || 'Open').slice(0, 8)}
            </Text>
          </TouchableOpacity>
        )}
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
  reelContent: { ...StyleSheet.absoluteFill },
  videoTouchLayer: { ...StyleSheet.absoluteFill, zIndex: 1 },
  endScreenHost: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    elevation: 40,
    alignItems: 'center',
    justifyContent: 'center',
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
  sponsoredPill: {
    backgroundColor: 'rgba(250, 204, 21, 0.92)',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  sponsoredPillText: {
    color: '#0f172a',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  ctaButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: '78%',
  },
  ctaButtonText: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '800',
    flexShrink: 1,
  },
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
