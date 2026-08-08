import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedTabIcon } from './AnimatedTabIcon';

export type DesktopRailVariant = 'default' | 'reels';

type Props = MaterialTopTabBarProps & {
  variant?: DesktopRailVariant;
  activeColor: string;
  inactiveColor: string;
  backgroundColor: string;
  borderColor: string;
};

const TAB_ICONS: Record<
  string,
  {
    name: keyof typeof Ionicons.glyphMap;
    focusedName: keyof typeof Ionicons.glyphMap;
    label: string;
  }
> = {
  Chats: {
    name: 'chatbubble-ellipses-outline',
    focusedName: 'chatbubble-ellipses',
    label: 'Chats',
  },
  Explore: {
    name: 'compass-outline',
    focusedName: 'compass',
    label: 'Explore',
  },
  Calls: {
    name: 'call-outline',
    focusedName: 'call',
    label: 'Calls',
  },
  Reels: {
    name: 'play-circle-outline',
    focusedName: 'play-circle',
    label: 'Reels',
  },
};

/** Full-height vertical desktop nav rail (Chats / Explore / Calls / Reels). */
export function DesktopVerticalTabBar({
  state,
  navigation,
  variant = 'default',
  activeColor,
  inactiveColor,
  backgroundColor,
  borderColor,
}: Props) {
  const insets = useSafeAreaInsets();
  const dark = variant === 'reels';

  return (
    <View
      style={[
        styles.rail,
        {
          backgroundColor,
          borderColor,
          paddingTop: Math.max(insets.top, 10),
          paddingBottom: Math.max(insets.bottom, 12),
        },
      ]}
    >
      <View style={styles.brand}>
        <Ionicons name="apps" size={20} color={dark ? '#fff' : activeColor} />
      </View>

      <View style={styles.list}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const meta = TAB_ICONS[route.name] ?? {
            name: 'ellipse-outline' as const,
            focusedName: 'ellipse' as const,
            label: route.name,
          };
          const color = focused ? activeColor : inactiveColor;

          return (
            <TouchableOpacity
              key={route.key}
              style={[styles.item, focused && styles.itemActive]}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(route.name);
                }
              }}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={meta.label}
            >
              <AnimatedTabIcon
                name={meta.name}
                focusedName={meta.focusedName}
                size={22}
                color={color}
                focused={focused}
              />
              <Text style={[styles.label, { color }]} numberOfLines={1}>
                {meta.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

/** @deprecated Use DesktopVerticalTabBar */
export const DesktopCollapsedVerticalTabBar = DesktopVerticalTabBar;

const styles = StyleSheet.create({
  rail: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    borderRightWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  brand: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  list: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 2,
  },
  item: {
    width: '100%',
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
  },
  itemActive: {
    backgroundColor: 'rgba(127,127,127,0.12)',
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
});
