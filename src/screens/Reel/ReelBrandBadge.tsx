import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { USE_NATIVE_DRIVER } from '../../lib/animation';
import { APP_NAME, REEL_WATERMARK_ANIM_MS } from './reelTheme';

const APP_LOGO = require('../../../assets/favIconChat.png');

const BADGE_W = 132;
const BADGE_H = 44;

type Props = {
  ownerName: string;
  frameWidth: number;
  frameHeight: number;
  progressBottom?: number;
  /** Increment to replay the slide animation (new reel / replay). */
  playCycle?: number;
  compact?: boolean;
};

/** Watermark slides to bottom-right above the progress bar in 1s; repeats each play cycle. */
export function ReelBrandBadge({
  ownerName,
  frameWidth,
  frameHeight,
  progressBottom = 0,
  playCycle = 0,
  compact,
}: Props) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.stopAnimation();
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: REEL_WATERMARK_ANIM_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  }, [ownerName, playCycle, progress]);

  const startTop = compact ? 10 : 14;
  const startLeft = compact ? 10 : 14;
  const endRight = 12;
  const endBottom = progressBottom + 2;

  const moveX = Math.max(0, frameWidth - BADGE_W - endRight - startLeft);
  const moveY = Math.max(0, frameHeight - BADGE_H - endBottom - startTop);

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, moveX],
  });
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, moveY],
  });

  return (
    <Animated.View
      style={[
        styles.wrap,
        compact && styles.wrapCompact,
        {
          opacity: progress.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0.9, 1, 1] }),
          transform: [{ translateX }, { translateY }],
        },
      ]}
      pointerEvents="none"
    >
      <View style={styles.brandRow}>
        <Image source={APP_LOGO} style={styles.logo} />
        <Text style={styles.appName}>{APP_NAME}</Text>
      </View>
      <Text style={styles.owner} numberOfLines={1}>
        @{ownerName}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 14,
    left: 14,
    zIndex: 16,
    maxWidth: BADGE_W,
  },
  wrapCompact: {
    top: 10,
    left: 10,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logo: {
    width: 18,
    height: 18,
    borderRadius: 4,
  },
  appName: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  owner: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
