import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ReelsTabParamList } from '../../navigation/reelsNavigation';
import { rootNavigationRef } from '../../navigation/rootNavigation';
import { REEL_TAB_BAR_HEIGHT } from './reelVideoLayout';

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

export function reelTabBarOffset(insetsBottom: number): number {
  return REEL_TAB_BAR_HEIGHT + Math.max(insetsBottom, 6);
}

export default function ReelsTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  const openUpload = () => {
    if (rootNavigationRef.isReady()) rootNavigationRef.navigate('PostReel');
  };

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 6) }]}>
      {TAB_ORDER.map((key) => {
        if (key === 'upload') {
          return (
            <TouchableOpacity key="upload" style={styles.uploadItem} onPress={openUpload} activeOpacity={0.85}>
              <View style={styles.uploadCircle}>
                <Ionicons name="add" size={26} color="#fff" />
              </View>
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
            style={styles.item}
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
              size={24}
              color={isFocused ? '#fff' : 'rgba(255,255,255,0.55)'}
            />
            <Text style={[styles.label, isFocused && styles.labelActive]}>{meta.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: '#ff375f',
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
