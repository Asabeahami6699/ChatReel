import React, { memo } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ReelDTO } from '../../lib/api';
import {
  REEL_ACTION_RAIL_RIGHT,
  REEL_ACTION_RAIL_WIDTH,
  REEL_COMPACT_HEIGHT,
  REEL_CONTENT_SHIFT_DOWN,
} from './reelVideoLayout';
import { ExpandableCaption } from './ExpandableCaption';
import { ReelSoundStrip } from './ReelSoundStrip';
import { REEL_ACCENT } from './reelTheme';
import { formatReelCount, reelAuthorLabel, reelAvatarUrl } from './reelFeedRowUtils';
import { ReelActionIcon } from './ReelActionIcon';

const HIT_SLOP = { top: 6, bottom: 6, left: 8, right: 8 };

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
  onUseThisSound?: () => void;
  onSponsoredCta?: () => void;
};

/**
 * Captions + engagement rail floated ABOVE the scroller (pointerEvents box-none).
 * Empty space passes touches through to the ScrollView so vertical swipe works.
 * No full-screen / center tap target — that steals pans and false-fires pause.
 */
function ReelFloatingChromeComponent({
  reel,
  reelWidth,
  reelHeight,
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
  onUseThisSound,
  onSponsoredCta,
}: Props) {
  const avatar = reelAvatarUrl(reel);
  const author = reelAuthorLabel(reel);
  const isLiked = reel.liked_by_me;
  const sponsored = Boolean(reel.is_sponsored);
  // Short phones (and split-screen) can't fit the full-size rail above the caption.
  const compact = !usePhoneFrame && reelHeight > 0 && reelHeight < REEL_COMPACT_HEIGHT;
  const icon = (size: number) => (compact ? Math.round(size * 0.85) : size);
  const actionTextStyle = usePhoneFrame
    ? [styles.actionText, styles.actionTextDesktop]
    : styles.actionText;

  return (
    <View
      style={[styles.layer, !usePhoneFrame && { transform: [{ translateY: REEL_CONTENT_SHIFT_DOWN }] }]}
      pointerEvents="box-none"
    >
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
            <TouchableOpacity onPress={sponsored ? onSponsoredCta : onOpenProfile} disabled={sponsored && !onSponsoredCta}>
              <Text style={styles.username}>{sponsored ? author : `@${author}`}</Text>
            </TouchableOpacity>
            {sponsored ? (
              <View style={styles.sponsoredPill}>
                <Text style={styles.sponsoredPillText}>Sponsored</Text>
              </View>
            ) : reel.visibility !== 'public' ? (
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
            ) : null}
          </View>
          {!!reel.caption && (
            <ExpandableCaption
              text={reel.caption}
              style={styles.caption}
              maxWidth={Math.round(reelWidth * 0.7)}
            />
          )}
          {sponsored && reel.cta_url && onSponsoredCta ? (
            <TouchableOpacity style={styles.ctaButton} onPress={onSponsoredCta} activeOpacity={0.88}>
              <Text style={styles.ctaButtonText} numberOfLines={1}>
                {reel.cta_label?.trim() || 'Learn more'}
              </Text>
              <Ionicons name="open-outline" size={14} color="#0f172a" />
            </TouchableOpacity>
          ) : (
            <ReelSoundStrip
              reel={reel}
              authorHandle={author}
              onPressSound={onNavigateSound}
              onUseThisSound={onUseThisSound ? () => onUseThisSound() : undefined}
              onPressOriginalAudio={onUseReelAudio}
            />
          )}
        </View>
      </View>

      <View
        style={[
          styles.actionButtons,
          { bottom: metaBottom },
          compact && styles.actionButtonsCompact,
          usePhoneFrame && styles.actionButtonsDesktop,
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.profileActionWrap}>
          <TouchableOpacity
            style={styles.profileButton}
            onPress={sponsored ? onSponsoredCta : onOpenProfile}
            hitSlop={HIT_SLOP}
            disabled={sponsored && !onSponsoredCta}
          >
            {avatar ? (
              <Image source={{ uri: avatar }} style={[styles.profileAvatar, compact && styles.profileAvatarCompact]} />
            ) : (
              <View style={[styles.profileAvatar, compact && styles.profileAvatarCompact, styles.avatarFallback]}>
                <Text style={styles.avatarFallbackText}>{author.charAt(0).toUpperCase()}</Text>
              </View>
            )}
          </TouchableOpacity>
          {!sponsored ? (
            <TouchableOpacity style={styles.profileFollowPlus} onPress={onQuickFollow} hitSlop={HIT_SLOP}>
              <Ionicons name={isFollowing ? 'checkmark' : 'add'} size={17} color="#fff" />
            </TouchableOpacity>
          ) : null}
        </View>
        {!sponsored ? (
          <>
            <TouchableOpacity style={styles.actionButton} onPress={onToggleLike} hitSlop={HIT_SLOP}>
              <ReelActionIcon name="heart" size={icon(36)} color={isLiked ? REEL_ACCENT : '#fff'} />
              <Text style={actionTextStyle} maxFontSizeMultiplier={1.2} numberOfLines={1}>
                {formatReelCount(reel.like_count)}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={onOpenComments} hitSlop={HIT_SLOP}>
              <ReelActionIcon name="chatbubble-ellipses" size={icon(34)} />
              <Text style={actionTextStyle} maxFontSizeMultiplier={1.2} numberOfLines={1}>
                {formatReelCount(reel.comment_count)}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={onOpenShare} hitSlop={HIT_SLOP}>
              <ReelActionIcon name="paper-plane" size={icon(32)} />
              <Text style={actionTextStyle} maxFontSizeMultiplier={1.2} numberOfLines={1}>
                Share
              </Text>
            </TouchableOpacity>
            {myProfileId && reel.author_id !== myProfileId ? (
              <TouchableOpacity style={styles.actionButton} onPress={onOpenGift} hitSlop={HIT_SLOP}>
                <ReelActionIcon name="gift" size={icon(30)} color="#fff" />
                <Text style={actionTextStyle} maxFontSizeMultiplier={1.2} numberOfLines={1}>
                  Gift
                </Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.actionButton}>
              <ReelActionIcon name="eye" size={icon(30)} />
              <Text style={actionTextStyle} maxFontSizeMultiplier={1.2} numberOfLines={1}>
                {formatReelCount(reel.view_count)}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={onSponsoredCta}
            hitSlop={HIT_SLOP}
            disabled={!onSponsoredCta}
          >
            <ReelActionIcon name="open" size={icon(30)} />
            <Text style={actionTextStyle} maxFontSizeMultiplier={1.2} numberOfLines={1}>
              {(reel.cta_label?.trim() || 'Open').slice(0, 8)}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export const ReelFloatingChrome = memo(ReelFloatingChromeComponent);

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFill,
    zIndex: 14,
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
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 10,
    minWidth: REEL_ACTION_RAIL_WIDTH,
  },
  actionButtonsCompact: {
    gap: 4,
    paddingVertical: 6,
  },
  actionButtonsDesktop: {
    right: 0,
    paddingRight: 4,
  },
  actionButton: { alignItems: 'center', gap: 1, minWidth: 48 },
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
  profileAvatarCompact: { width: 38, height: 38, borderRadius: 19 },
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
