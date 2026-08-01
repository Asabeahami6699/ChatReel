import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, Platform, StyleSheet, Text, View } from 'react-native';
import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';
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

/** Branded night end-card centered when a reel finishes. */
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
    void (async () => {
      try {
        await configurePlaybackAudio();
        await releasePlayer(soundPlayerRef.current);
        soundPlayerRef.current = createPlaybackPlayer(END_SOUND);
        try {
          soundPlayerRef.current.volume = 0.25;
        } catch {
          /* ignore */
        }
        soundPlayerRef.current.play();
      } catch {
        /* ignore */
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
      <ExpoLinearGradient
        colors={['#050814', '#0b1224', '#141a2e', '#0a0e1a']}
        locations={[0, 0.35, 0.7, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.stars} pointerEvents="none">
        <View style={[styles.star, { top: '18%', left: '22%' }]} />
        <View style={[styles.star, { top: '28%', right: '18%', opacity: 0.5 }]} />
        <View style={[styles.star, { bottom: '30%', left: '30%', opacity: 0.35 }]} />
        <View style={[styles.star, { bottom: '22%', right: '28%', opacity: 0.6 }]} />
      </View>
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
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 40,
    elevation: 40,
  },
  stars: {
    ...StyleSheet.absoluteFillObject,
  },
  star: {
    position: 'absolute',
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  card: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 24,
    maxWidth: '86%',
  },
  gif: {
    width: 168,
    height: 168,
    marginBottom: 4,
  },
  appName: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0.4,
    marginTop: 6,
  },
  ownerTag: {
    marginTop: 10,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    maxWidth: '100%',
  },
  owner: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  hint: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 13,
    marginTop: 16,
    fontWeight: '500',
  },
});
