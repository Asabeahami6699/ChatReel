import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Animated,
  Easing,
  Platform,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OfflineAvatar } from './OfflineAvatar';
import { useAuth } from '../hooks/useAuth';
import { useRealtimeTopic } from '../hooks/useRealtimeTopic';
import { USE_NATIVE_DRIVER } from '../lib/animation';
import { promptSignIn } from '../lib/requireSignedIn';
import { useChatSettings } from '../context/ChatSettingsContext';
import {
  getCachedProfile,
  hydrateProfileCache,
  prefetchMyProfile,
  subscribeCachedProfile,
} from '../lib/profileCache';
import { MOBILE_BREAKPOINT } from '../navigation/navigationUtils';
import Portal from './Portal';

interface DropdownMenuProps {
  triggerIcon?: 'ellipsis-horizontal' | 'ellipsis-vertical';
}

interface Profile {
  display_name: string;
  avatar_url: string;
  email: string;
}

const MENU_WIDTH = 240;

export default function DropdownMenu({ triggerIcon = 'ellipsis-vertical' }: DropdownMenuProps) {
  const [visible, setVisible] = useState(false);
  const [anchor, setAnchor] = useState({ top: 56, left: 12 });
  const triggerRef = useRef<View>(null);
  const [profile, setProfile] = useState<Profile | null>(() => {
    const cached = getCachedProfile();
    if (!cached) return null;
    return {
      display_name: cached.display_name || '',
      avatar_url: cached.avatar_url || '',
      email: cached.email || '',
    };
  });
  const { user, signOut, isGuest, exitGuest } = useAuth();
  const { theme } = useChatSettings();
  const navigation = useNavigation<any>();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isWebDesktop = Platform.OS === 'web' && windowWidth >= MOBILE_BREAKPOINT;

  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const unsubscribe = navigation.addListener('state', () => {
      if (visible) closeMenu();
    });
    return unsubscribe;
  }, [navigation, visible]);

  const applyProfile = (data: {
    display_name?: string;
    avatar_url?: string;
    email?: string;
  }) => {
    setProfile({
      display_name: data.display_name || '',
      avatar_url: data.avatar_url || '',
      email: data.email || '',
    });
  };

  const fetchProfile = async () => {
    if (!user) return;
    await hydrateProfileCache();
    const cached = getCachedProfile();
    if (cached) applyProfile(cached);
    const next = await prefetchMyProfile(user.email);
    if (next) applyProfile(next);
  };

  useEffect(() => {
    void fetchProfile();
    return subscribeCachedProfile(() => {
      const cached = getCachedProfile();
      if (cached) applyProfile(cached);
    });
  }, [user?.id]);

  useRealtimeTopic(user ? 'profiles' : null, fetchProfile);

  const closeMenu = () => {
    Animated.parallel([
      Animated.timing(opacityAnim, { toValue: 0, duration: 120, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(scaleAnim, { toValue: 0.8, duration: 120, useNativeDriver: USE_NATIVE_DRIVER }),
    ]).start(() => setVisible(false));
  };

  const playOpenAnim = () => {
    opacityAnim.setValue(0);
    scaleAnim.setValue(0.8);
    Animated.parallel([
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: USE_NATIVE_DRIVER,
        easing: Easing.out(Easing.ease),
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: USE_NATIVE_DRIVER,
        friction: 6,
        tension: 80,
      }),
    ]).start();
  };

  const openMenu = () => {
    triggerRef.current?.measureInWindow((x, y, w, h) => {
      const left = Math.max(8, Math.min(x + w - MENU_WIDTH, windowWidth - MENU_WIDTH - 8));
      const top = Math.min(y + h + 6, windowHeight - 280);
      setAnchor({
        top: Math.max(insets.top + 4, top),
        left,
      });
      setVisible(true);
      playOpenAnim();
    });
  };

  const toggleMenu = () => {
    if (visible) closeMenu();
    else openMenu();
  };

  const requestLogin = (action: string) => {
    closeMenu();
    promptSignIn({
      title: 'Sign in required',
      message: `Sign in to ${action.toLowerCase()}, or continue exploring as a guest.`,
      onLogin: exitGuest,
    });
  };

  const menuItems = isGuest
    ? [
        { title: 'Profile', icon: 'person-outline', onPress: () => requestLogin('open your profile') },
        { title: 'Starred messages', icon: 'star-outline', onPress: () => requestLogin('view starred messages') },
        { title: 'Archived chats', icon: 'archive-outline', onPress: () => requestLogin('open archived chats') },
        { title: 'Settings', icon: 'settings-outline', onPress: () => requestLogin('open settings') },
        { title: 'Invite a Friend', icon: 'share-social-outline', onPress: () => requestLogin('invite friends') },
        { title: 'My QR Code', icon: 'qr-code-outline', onPress: () => requestLogin('view your QR code') },
        { title: 'Link a Device', icon: 'phone-portrait-outline', onPress: () => requestLogin('link a device') },
        {
          title: 'Sign in',
          icon: 'log-in-outline',
          onPress: () => {
            closeMenu();
            exitGuest();
          },
        },
      ]
    : [
        {
          title: 'Profile',
          icon: 'person-outline',
          onPress: () => {
            void prefetchMyProfile(user?.email);
            navigation.navigate('Profile');
          },
        },
        { title: 'Starred messages', icon: 'star-outline', onPress: () => navigation.navigate('StarredMessages') },
        { title: 'Archived chats', icon: 'archive-outline', onPress: () => navigation.navigate('ArchivedChats') },
        { title: 'Settings', icon: 'settings-outline', onPress: () => navigation.navigate('Settings') },
        { title: 'Invite a Friend', icon: 'share-social-outline', onPress: () => navigation.navigate('Invite') },
        { title: 'My QR Code', icon: 'qr-code-outline', onPress: () => navigation.navigate('QRCode') },
        { title: 'Link a Device', icon: 'phone-portrait-outline', onPress: () => navigation.navigate('QRScanner') },
        {
          title: 'Sign Out',
          icon: 'log-out-outline',
          danger: true,
          onPress: async () => {
            await signOut();
            setVisible(false);
          },
        },
      ];

  const dropdownPanel = (
    <Animated.View
      style={[
        styles.dropdown,
        {
          opacity: opacityAnim,
          transform: [{ scale: scaleAnim }],
          top: anchor.top,
          left: anchor.left,
          maxHeight: Math.min(480, windowHeight - anchor.top - 16),
          backgroundColor: theme.listCardBg,
          borderColor: theme.listBorder,
          borderWidth: theme.isDark || isWebDesktop ? 1 : 0,
        },
      ]}
    >
      <View style={styles.userInfo}>
        <OfflineAvatar
          uri={profile?.avatar_url}
          name={profile?.display_name || 'User'}
          size={60}
          style={styles.avatar}
        />
        <View style={{ flex: 1 }}>
          <Text style={[styles.displayName, { color: theme.listPrimaryText }]} numberOfLines={1}>
            {profile?.display_name || profile?.email || user?.email || 'Loading…'}
          </Text>
          <Text style={[styles.email, { color: theme.listSecondaryText }]} numberOfLines={1}>
            {profile?.email || user?.email || ''}
          </Text>
        </View>
      </View>

      <View style={[styles.separator, { backgroundColor: theme.listBorder }]} />

      {menuItems.map((item, index) => (
        <TouchableOpacity
          key={index}
          style={styles.menuItem}
          onPress={() => {
            closeMenu();
            item.onPress();
          }}
        >
          <Ionicons
            name={item.icon as any}
            size={20}
            color={item.danger ? '#ff3b30' : theme.listPrimaryText}
          />
          <Text
            style={[
              styles.menuText,
              { color: theme.listPrimaryText },
              item.danger && styles.dangerText,
            ]}
          >
            {item.title}
          </Text>
        </TouchableOpacity>
      ))}
    </Animated.View>
  );

  return (
    <>
      <View ref={triggerRef} collapsable={false}>
        <TouchableOpacity onPress={toggleMenu} style={styles.trigger} accessibilityLabel="Open menu">
          <Ionicons name={triggerIcon} size={24} color={theme.listHeaderText} />
        </TouchableOpacity>
      </View>

      {isWebDesktop
        ? visible
          ? (
            <Portal>
              <View style={styles.webFloatRoot} pointerEvents="box-none">
                <Pressable
                  style={styles.webFloatDismiss}
                  onPress={closeMenu}
                  accessibilityLabel="Dismiss menu"
                />
                {dropdownPanel}
              </View>
            </Portal>
            )
          : null
        : (
          <Modal
            visible={visible}
            transparent
            animationType="none"
            onRequestClose={closeMenu}
            statusBarTranslucent
          >
            <View style={styles.modalRoot} pointerEvents="box-none">
              <Pressable
                style={[styles.overlay, styles.overlayDim]}
                onPress={closeMenu}
                accessibilityLabel="Dismiss menu"
              />
              {dropdownPanel}
            </View>
          </Modal>
          )}
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    padding: 6,
    zIndex: 100000,
  },
  modalRoot: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayDim: {
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  webFloatRoot: {
    ...Platform.select({
      web: {
        position: 'fixed' as any,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 10050,
      },
      default: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 10050,
        elevation: 10050,
      },
    }),
  },
  webFloatDismiss: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  dropdown: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    width: MENU_WIDTH,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 20,
    zIndex: 10051,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 10,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
    backgroundColor: '#f0f0f0',
  },
  displayName: {
    fontWeight: '600',
    fontSize: 16,
    color: '#000',
  },
  email: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  separator: {
    height: 1,
    backgroundColor: '#eee',
    marginVertical: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  menuText: {
    marginLeft: 14,
    fontSize: 15,
    color: '#000',
    flex: 1,
  },
  dangerText: {
    color: '#ff3b30',
  },
});
