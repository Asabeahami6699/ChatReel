import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ReelsTabParamList } from '../../navigation/reelsNavigation';
import { rootNavigationRef } from '../../navigation/rootNavigation';
import { openPostReelCompose } from '../../lib/reelPlaybackBridge';
import {
  getReelInboxUnreadCount,
  scheduleReelInboxPrefetch,
  subscribeReelInbox,
} from '../../lib/reelInboxPrefetch';
import { REEL_TAB_BAR_HEIGHT, REEL_PHONE_MAX_WIDTH } from './reelVideoLayout';
import { REEL_ACCENT } from './reelTheme';
import { useAuth } from '../../hooks/useAuth';

const TAB_META: Record<
  keyof ReelsTabParamList,
  { label: string; icon: keyof typeof Ionicons.glyphMap; activeIcon: keyof typeof Ionicons.glyphMap }
> = {
  ReelHome: { label: 'Home', icon: 'home-outline', activeIcon: 'home' },
  ReelSearch: { label: 'Search', icon: 'search-outline', activeIcon: 'search' },
  ReelInbox: { label: 'Inbox', icon: 'chatbubble-ellipses-outline', activeIcon: 'chatbubble-ellipses' },
  ReelAccount: { label: 'Account', icon: 'person-outline', activeIcon: 'person' },
};

const TAB_ORDER: (keyof ReelsTabParamList | 'upload')[] = [
  'ReelHome',
  'ReelSearch',
  'upload',
  'ReelInbox',
  'ReelAccount',
];

const GUEST_TAB_ORDER: (keyof ReelsTabParamList | 'signIn')[] = [
  'ReelHome',
  'ReelSearch',
  'signIn',
];
export const DESKTOP_SIDEBAR_EXPANDED = 160;
export const DESKTOP_SIDEBAR_COLLAPSED = 56;

function useIsDesktop(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width > REEL_PHONE_MAX_WIDTH + 64;
}

export function reelTabBarOffset(insetsBottom: number, isDesktop?: boolean): number {
  if (isDesktop) return 0;
  // Tab bar = paddingTop (8) + minHeight (52) + safe-area paddingBottom.
  return REEL_TAB_BAR_HEIGHT + 8 + Math.max(insetsBottom, 6);
}

type ReelsTabBarProps = BottomTabBarProps & {
  feedMode?: 'forYou' | 'following';
  onFeedModeChange?: (mode: 'forYou' | 'following') => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  guestMode?: boolean;
};

export default function ReelsTabBar({
  state,
  navigation,
  feedMode,
  onFeedModeChange,
  collapsed = false,
  onToggleCollapse,
  guestMode = false,
}: ReelsTabBarProps) {
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();
  const sidebarW = collapsed ? DESKTOP_SIDEBAR_COLLAPSED : DESKTOP_SIDEBAR_EXPANDED;
  const [inboxUnread, setInboxUnread] = useState(0);
  const { exitGuest } = useAuth();

  useEffect(() => {
    if (guestMode) return;
    void scheduleReelInboxPrefetch(0).then(() => setInboxUnread(getReelInboxUnreadCount()));
    return subscribeReelInbox(() => setInboxUnread(getReelInboxUnreadCount()));
  }, [guestMode]);

  const openUpload = () => {
    openPostReelCompose();
    if (rootNavigationRef.isReady()) rootNavigationRef.navigate('PostReel');
  };

  const order = guestMode ? GUEST_TAB_ORDER : TAB_ORDER;
  const items = order.map((key) => {
    if (key === 'signIn') {
      return (
        <TouchableOpacity
          key="signIn"
          style={isDesktop ? [dk.item, { width: sidebarW }] : mobileS.item}
          onPress={() => exitGuest()}
          activeOpacity={0.85}
        >
          <View style={mobileS.iconWrap}>
            <Ionicons name="log-in-outline" size={isDesktop ? 22 : 24} color="#fff" />
          </View>
          {isDesktop && !collapsed && <Text style={dk.label}>Sign in</Text>}
          {!isDesktop && <Text style={mobileS.label}>Sign in</Text>}
        </TouchableOpacity>
      );
    }

    if (key === 'upload') {
      return (
        <TouchableOpacity
          key="upload"
          style={isDesktop ? [dk.item, { width: sidebarW }] : mobileS.uploadItem}
          onPress={openUpload}
          activeOpacity={0.85}
        >
          <View style={isDesktop ? dk.uploadCircle : mobileS.uploadCircle}>
            <Ionicons name="add" size={isDesktop ? 22 : 26} color="#fff" />
          </View>
          {isDesktop && !collapsed && <Text style={dk.label}>Create</Text>}
        </TouchableOpacity>
      );
    }

    const routeIndex = state.routes.findIndex((r) => r.name === key);
    if (routeIndex < 0) return null;
    const route = state.routes[routeIndex];
    const meta = TAB_META[key];
    const isFocused = state.index === routeIndex;
    const showInboxBadge = !guestMode && key === 'ReelInbox' && inboxUnread > 0 && !isFocused;

    return (
      <TouchableOpacity
        key={route.key}
        style={isDesktop ? [dk.item, { width: sidebarW }] : mobileS.item}
        onPress={() => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        }}
        activeOpacity={0.75}
      >
        <View style={mobileS.iconWrap}>
          <Ionicons
            name={isFocused ? meta.activeIcon : meta.icon}
            size={isDesktop ? 22 : 24}
            color={isFocused ? '#fff' : 'rgba(255,255,255,0.5)'}
          />
          {showInboxBadge ? (
            <View style={mobileS.badge}>
              <Text style={mobileS.badgeText}>{inboxUnread > 9 ? '9+' : String(inboxUnread)}</Text>
            </View>
          ) : null}
        </View>
        {isDesktop && !collapsed && (
          <Text style={[dk.label, isFocused && dk.labelActive]}>{meta.label}</Text>
        )}
        {!isDesktop && (
          <Text style={[mobileS.label, isFocused && mobileS.labelActive]}>{meta.label}</Text>
        )}
      </TouchableOpacity>
    );
  });

  if (isDesktop) {
    return (
      <View style={[dk.sidebar, { width: sidebarW, paddingTop: insets.top + 12 }]}>
        {/* Toggle button */}
        <TouchableOpacity style={[dk.toggleBtn, { width: sidebarW }]} onPress={onToggleCollapse} activeOpacity={0.7}>
          <Ionicons
            name={collapsed ? 'menu-outline' : 'chevron-back-outline'}
            size={20}
            color="rgba(255,255,255,0.6)"
          />
          {!collapsed && <Text style={dk.toggleLabel}>Minimize</Text>}
        </TouchableOpacity>

        {/* Feed mode selector */}
        {feedMode && onFeedModeChange && (
          <View style={[dk.feedSection, { width: sidebarW }]}>
            <TouchableOpacity
              style={[dk.feedBtn, { width: collapsed ? 42 : sidebarW - 20 }, feedMode === 'forYou' && dk.feedBtnActive]}
              onPress={() => onFeedModeChange('forYou')}
            >
              <Ionicons
                name={feedMode === 'forYou' ? 'flame' : 'flame-outline'}
                size={20}
                color={feedMode === 'forYou' ? '#fff' : 'rgba(255,255,255,0.5)'}
              />
              {!collapsed && (
                <Text style={[dk.feedLabel, feedMode === 'forYou' && dk.feedLabelActive]}>For You</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[dk.feedBtn, { width: collapsed ? 42 : sidebarW - 20 }, feedMode === 'following' && dk.feedBtnActive]}
              onPress={() => onFeedModeChange('following')}
            >
              <Ionicons
                name={feedMode === 'following' ? 'people' : 'people-outline'}
                size={20}
                color={feedMode === 'following' ? '#fff' : 'rgba(255,255,255,0.5)'}
              />
              {!collapsed && (
                <Text style={[dk.feedLabel, feedMode === 'following' && dk.feedLabelActive]}>Following</Text>
              )}
            </TouchableOpacity>
            <View style={dk.feedDivider} />
          </View>
        )}

        {items}
      </View>
    );
  }

  return (
    <View style={[mobileS.bar, { paddingBottom: Math.max(insets.bottom, 6) }]}>
      {items}
    </View>
  );
}

const mobileS = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 30,
    elevation: 30,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-around',
    minHeight: REEL_TAB_BAR_HEIGHT,
    paddingTop: 8,
    backgroundColor: 'rgba(0,0,0,0.92)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  iconWrap: {
    position: 'relative',
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: REEL_ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#000',
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 11,
  },
  uploadItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    marginTop: -4,
  },
  uploadCircle: {
    width: 44,
    height: 32,
    borderRadius: 8,
    backgroundColor: REEL_ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 10,
    fontWeight: '600',
  },
  labelActive: {
    color: '#fff',
    fontWeight: '700',
  },
});

const dk = StyleSheet.create({
  sidebar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 30,
    elevation: 30,
    backgroundColor: 'rgba(10,10,10,0.95)',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    paddingBottom: 16,
    gap: 2,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    gap: 6,
    marginBottom: 4,
  },
  toggleLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '600',
  },
  item: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  uploadCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: REEL_ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    fontWeight: '600',
  },
  labelActive: {
    color: '#fff',
    fontWeight: '700',
  },
  feedSection: {
    alignItems: 'center',
    marginBottom: 8,
    gap: 2,
  },
  feedBtn: {
    height: 42,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  feedBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  feedLabel: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  feedLabelActive: {
    color: '#fff',
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 3,
  },
  feedDivider: {
    width: 28,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginTop: 4,
    marginBottom: 2,
  },
});
