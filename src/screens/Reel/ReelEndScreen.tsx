import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, Platform, StyleSheet, Text, View } from 'react-native';
import { USE_NATIVE_DRIVER } from '../../lib/animation';
import { APP_NAME, REEL_END_SCREEN_MS } from './reelTheme';
import {
  configurePlaybackAudio,
  createPlaybackPlayer,
  releasePlayer,
  type AudioPlayer,
} from '../../lib/appAudio';

const END_GIF = require('../../../assets/reel-end.gif');
const END_SOUND = require('../../../assets/sounds/incoming-ring.mp3');

const FADE_MS = 450;

type Props = {
  ownerName?: string;
  durationMs?: number;
};

/** Branded looping GIF + creator tag when a reel finishes. */
export function ReelEndScreen({ ownerName, durationMs = REEL_END_SCREEN_MS }: Props) {
  const soundPlayerRef = useRef<AudioPlayer | null>(null);
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.88)).current;
  const cardSlideY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    overlayOpacity.setValue(0);
    cardOpacity.setValue(0);
    cardScale.setValue(0.88);
    cardSlideY.setValue(20);

    const holdMs = Math.max(0, durationMs - FADE_MS * 2);

    const enter = Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: FADE_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(cardOpacity, {
        toValue: 1,
        duration: FADE_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.spring(cardScale, {
        toValue: 1,
        friction: 7,
        tension: 90,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(cardSlideY, {
        toValue: 0,
        duration: FADE_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]);

    const exit = Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: FADE_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(cardOpacity, {
        toValue: 0,
        duration: FADE_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(cardScale, {
        toValue: 0.92,
        duration: FADE_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(cardSlideY, {
        toValue: -12,
        duration: FADE_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]);

    const seq = Animated.sequence([enter, Animated.delay(holdMs), exit]);
    seq.start();
    // Short end-screen sound effect (subtle, fire-and-forget).
    void (async () => {
      try {
        await configurePlaybackAudio();
        await releasePlayer(soundPlayerRef.current);
        soundPlayerRef.current = createPlaybackPlayer(END_SOUND);
        // Keep it quiet so it doesn't feel like a notification.
        try {
          soundPlayerRef.current.volume = 0.25;
        } catch {
          /* ignore */
        }
        soundPlayerRef.current.play();
      } catch {
        /* ignore end-screen audio failures */
      }
    })();

    return () => {
      seq.stop();
      void releasePlayer(soundPlayerRef.current);
      soundPlayerRef.current = null;
    };
  }, [cardOpacity, cardScale, cardSlideY, durationMs, overlayOpacity, ownerName]);

  return (
    <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]} pointerEvents="none">
      <Animated.View
        style={[
          styles.card,
          {
            opacity: cardOpacity,
            transform: [{ scale: cardScale }, { translateY: cardSlideY }],
          },
        ]}
      >
        <Image
          source={END_GIF}
          style={styles.gif}
          resizeMode="contain"
          {...(Platform.OS === 'web' ? ({ accessibilityLabel: 'Thanks for watching' } as object) : {})}
        />
        <Text style={styles.appName}>{APP_NAME}</Text>
        {ownerName ? (
          <View style={styles.ownerTag}>
            <Text style={styles.owner} numberOfLines={1}>
              @{ownerName}
            </Text>
          </View>
        ) : null}
        <Text style={styles.hint}>Thanks for watching</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    // Sit behind captions / engagement rail (those use zIndex 15–16).
    zIndex: 2,
    elevation: 2,
  },
  card: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 20,
    maxWidth: '82%',
  },
  gif: {
    width: 160,
    height: 160,
    marginBottom: 4,
  },
  appName: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.3,
    marginTop: 4,
  },
  ownerTag: {
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    maxWidth: '100%',
  },
  owner: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  hint: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    marginTop: 14,
    fontWeight: '500',
  },
});
