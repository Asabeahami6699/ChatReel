import React, { useMemo } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ReelsScreen from '../screens/Reel/ReelsScreen';
import ReelSearchScreen from '../screens/Reel/ReelSearchScreen';
import ReelDetailScreen from '../screens/Reel/ReelDetailScreen';
import ReelsTabBar from '../screens/Reel/ReelsTabBar';
import { ReelFeedModeProvider, useReelFeedMode } from '../screens/Reel/ReelFeedModeContext';
import type { ReelsStackParamList, ReelsTabParamList } from './reelsNavigation';
import { ChatStack } from './AppNavigator';
import ExploreNavigator from './ExploreNavigator';
import CallsScreen from '../screens/Call/CallsScreen';
import { useChatSettings } from '../context/ChatSettingsContext';
import { getFocusedRouteName } from './navigationUtils';
import { blurActiveElementOnWeb } from '../lib/webFocus';
import { ReelsMainTabFocusContext } from '../context/ReelsMainTabFocusContext';

type GuestMainTabParamList = {
  Chats: undefined;
  Explore: undefined;
  Calls: undefined;
  Reels: undefined;
};

const ReelTab = createBottomTabNavigator<ReelsTabParamList>();
const ReelStack = createNativeStackNavigator<ReelsStackParamList>();
const GuestTab = createMaterialTopTabNavigator<GuestMainTabParamList>();

const tabScreenListeners = {
  state: () => {
    blurActiveElementOnWeb();
  },
};

function GuestReelTabsInner() {
  const { feedMode, setFeedMode, sidebarCollapsed, toggleSidebar } = useReelFeedMode();

  return (
    <ReelTab.Navigator
      initialRouteName="ReelHome"
      tabBar={(props) => (
        <ReelsTabBar
          {...props}
          guestMode
          feedMode={feedMode}
          onFeedModeChange={setFeedMode}
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebar}
        />
      )}
      screenOptions={{
        headerShown: false,
        lazy: true,
      }}
    >
      <ReelTab.Screen name="ReelHome" component={ReelsScreen} />
      <ReelTab.Screen name="ReelSearch" component={ReelSearchScreen} />
    </ReelTab.Navigator>
  );
}

function GuestReelTabs() {
  return (
    <ReelFeedModeProvider>
      <GuestReelTabsInner />
    </ReelFeedModeProvider>
  );
}

function GuestReelsNavigator() {
  return (
    <ReelsMainTabFocusContext.Provider value={true}>
      <ReelStack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#000' },
        }}
      >
        <ReelStack.Screen name="ReelTabs" component={GuestReelTabs} />
        <ReelStack.Screen
          name="ReelDetail"
          component={ReelDetailScreen}
          options={{ presentation: 'fullScreenModal' }}
        />
      </ReelStack.Navigator>
    </ReelsMainTabFocusContext.Provider>
  );
}

/**
 * Same main-tab chrome as the signed-in app. Private features stay on the
 * original screens and are gated with login prompts.
 */
export function GuestNavigator() {
  const insets = useSafeAreaInsets();
  const { theme } = useChatSettings();
  const tabBarBase = useMemo(
    () => ({
      ...styles.tabBarMobile,
      height: 56 + insets.bottom,
      paddingBottom: Math.max(insets.bottom, Platform.OS === 'android' ? 8 : 0),
      backgroundColor: theme.listCardBg,
      borderTopColor: theme.listBorder,
    }),
    [insets.bottom, theme.listCardBg, theme.listBorder]
  );

  return (
    <GuestTab.Navigator
      initialRouteName="Reels"
      tabBarPosition="bottom"
      screenListeners={tabScreenListeners}
      screenOptions={{
        lazy: true,
        lazyPreloadDistance: 0,
        swipeEnabled: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: theme.tabActive,
        tabBarInactiveTintColor: theme.tabInactive,
        tabBarStyle: tabBarBase,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
        tabBarItemStyle: { paddingVertical: 4 },
        tabBarIndicatorStyle: { display: 'none' },
        tabBarPressColor: 'transparent',
      }}
    >
      <GuestTab.Screen
        name="Chats"
        component={ChatStack}
        options={({ navigation }) => {
          const tabState = navigation.getState();
          const currentTab = tabState?.routes?.[tabState.index ?? 0]?.name;
          const chatsRoute = tabState?.routes?.find((r) => r.name === 'Chats');
          const stackScreen = getFocusedRouteName(
            chatsRoute?.state as Parameters<typeof getFocusedRouteName>[0]
          );
          const hideTabBar =
            currentTab === 'Chats' && !!stackScreen && stackScreen !== 'ChatList';

          return {
            lazy: false,
            tabBarStyle: hideTabBar ? { display: 'none' } : tabBarBase,
            tabBarIcon: ({ color }) => (
              <Ionicons name="chatbubble-outline" size={20} color={color} />
            ),
          };
        }}
      />
      <GuestTab.Screen
        name="Explore"
        component={ExploreNavigator}
        options={{
          lazy: false,
          tabBarIcon: ({ color }) => (
            <Ionicons name="compass-outline" size={22} color={color} />
          ),
        }}
      />
      <GuestTab.Screen
        name="Calls"
        component={CallsScreen}
        options={{
          tabBarIcon: ({ color }) => <Ionicons name="call-outline" size={22} color={color} />,
        }}
      />
      <GuestTab.Screen
        name="Reels"
        component={GuestReelsNavigator}
        options={{
          tabBarStyle: { display: 'none' },
          tabBarIcon: ({ color }) => (
            <Ionicons name="play-circle-outline" size={22} color={color} />
          ),
        }}
      />
    </GuestTab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBarMobile: {
    borderTopWidth: StyleSheet.hairlineWidth,
    elevation: 8,
  },
});
