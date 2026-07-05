import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ReelsTabParamList } from '../../navigation/reelsNavigation';
import { rootNavigationRef } from '../../navigation/rootNavigation';
import { REEL_TAB_BAR_HEIGHT, REEL_PHONE_MAX_WIDTH } from './reelVideoLayout';
import { REEL_ACCENT } from './reelTheme';

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

export const DESKTOP_SIDEBAR_EXPANDED = 160;
export const DESKTOP_SIDEBAR_COLLAPSED = 56;

function useIsDesktop(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width > REEL_PHONE_MAX_WIDTH + 64;
}

export function reelTabBarOffset(insetsBottom: number, isDesktop?: boolean): number {
  if (isDesktop) return 0;
  return REEL_TAB_BAR_HEIGHT + Math.max(insetsBottom, 6);
}

type ReelsTabBarProps = BottomTabBarProps & {
  feedMode?: 'forYou' | 'following';
  onFeedModeChange?: (mode: 'forYou' | 'following') => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
};

export default function ReelsTabBar({
  state,
  navigation,
  feedMode,
  onFeedModeChange,
  collapsed = false,
  onToggleCollapse,
}: ReelsTabBarProps) {
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();
  const sidebarW = collapsed ? DESKTOP_SIDEBAR_COLLAPSED : DESKTOP_SIDEBAR_EXPANDED;

  const openUpload = () => {
    if (rootNavigationRef.isReady()) rootNavigationRef.navigate('PostReel');
  };

  const items = TAB_ORDER.map((key) => {
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
        <Ionicons
          name={isFocused ? meta.activeIcon : meta.icon}
          size={isDesktop ? 22 : 24}
          color={isFocused ? '#fff' : 'rgba(255,255,255,0.5)'}
        />
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
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
  },
  feedLabelActive: {
    color: '#fff',
    fontWeight: '700',
  },
  feedDivider: {
    width: 28,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginTop: 4,
    marginBottom: 2,
  },
});
