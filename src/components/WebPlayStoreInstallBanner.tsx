import React, { useEffect, useState } from 'react';
import {
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useChatSettings } from '../context/ChatSettingsContext';
import { PLAY_STORE_APP_URL } from '../lib/pendingAppInvite';

const DISMISS_KEY = '@web_playstore_install_banner_dismissed_until';
/** Don’t nag again for 14 days after dismiss. */
const DISMISS_MS = 14 * 24 * 60 * 60 * 1000;
const APP_LOGO = require('../../assets/favIconChat.png');

function isAndroidMobileWeb(): boolean {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // Android phones/tablets in a browser (Chrome, Samsung Internet, Edge, etc.).
  return /Android/i.test(ua);
}

/**
 * Smart-app-banner style prompt when ChatReel is opened in Chrome (or other
 * Android mobile browsers) on the web — same pattern as many consumer sites.
 */
export function WebPlayStoreInstallBanner() {
  const insets = useSafeAreaInsets();
  const { theme } = useChatSettings();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isAndroidMobileWeb()) return;
    let alive = true;
    void (async () => {
      try {
        const untilRaw = await AsyncStorage.getItem(DISMISS_KEY);
        const until = untilRaw ? Number(untilRaw) : 0;
        if (Number.isFinite(until) && until > Date.now()) return;
      } catch {
        /* show anyway */
      }
      // Slight delay so it doesn’t fight the first paint / splash.
      await new Promise((r) => setTimeout(r, 900));
      if (alive) setVisible(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
    void AsyncStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_MS));
  };

  const install = () => {
    void Linking.openURL(PLAY_STORE_APP_URL);
    dismiss();
  };

  if (!visible) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.host, { paddingBottom: Math.max(insets.bottom, 10) }]}
    >
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.isDark ? theme.listCardBg : '#fff',
            borderColor: theme.listBorder,
            shadowOpacity: theme.isDark ? 0.35 : 0.14,
          },
        ]}
      >
        <Pressable
          onPress={dismiss}
          style={styles.closeBtn}
          accessibilityLabel="Dismiss install prompt"
          hitSlop={8}
        >
          <Ionicons name="close" size={18} color={theme.listSecondaryText} />
        </Pressable>

        <Image source={APP_LOGO} style={styles.logo} resizeMode="contain" />

        <View style={styles.copy}>
          <Text style={[styles.title, { color: theme.listPrimaryText }]} numberOfLines={1}>
            ChatReel
          </Text>
          <Text style={[styles.sub, { color: theme.listSecondaryText }]} numberOfLines={2}>
            Install the app for faster chats, calls & notifications
          </Text>
        </View>

        <Pressable
          onPress={install}
          style={[styles.installBtn, { backgroundColor: theme.primary }]}
          accessibilityLabel="Install from Play Store"
        >
          <Text style={styles.installText}>Install</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20000,
    elevation: 20000,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 12,
    shadowColor: '#000',
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  closeBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 10,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 28,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  sub: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
    lineHeight: 16,
  },
  installBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
  },
  installText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
});
