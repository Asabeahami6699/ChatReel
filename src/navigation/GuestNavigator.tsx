import React, { useMemo } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import ReelsScreen from '../screens/Reel/ReelsScreen';
import ReelSearchScreen from '../screens/Reel/ReelSearchScreen';
import ReelDetailScreen from '../screens/Reel/ReelDetailScreen';
import ReelsTabBar from '../screens/Reel/ReelsTabBar';
import { ReelFeedModeProvider, useReelFeedMode } from '../screens/Reel/ReelFeedModeContext';
import type { ReelsStackParamList, ReelsTabParamList } from './reelsNavigation';
import { ChatStack, ThemedPhoneTabBar } from './AppNavigator';
import ExploreNavigator from './ExploreNavigator';
import CallsScreen from '../screens/Call/CallsScreen';
import { useChatSettings } from '../context/ChatSettingsContext';
import { useAppChrome } from '../context/AppChromeContext';
import { getFocusedRouteName } from './navigationUtils';
import { blurActiveElementOnWeb } from '../lib/webFocus';
import { ReelsMainTabFocusContext } from '../context/ReelsMainTabFocusContext';
import { AnimatedTabIcon } from './AnimatedTabIcon';

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
  const chrome = useAppChrome();
  const shellBg = chrome.topBg || theme.listHeaderBg;
  const tabBarBase = useMemo(
    () => ({
      ...styles.tabBarMobile,
      height: 56,
      paddingBottom: 0,
      paddingTop: 4,
      backgroundColor: theme.listCardBg,
      borderTopColor: 'transparent',
      elevation: 0,
    }),
    [theme.listCardBg]
  );

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: shellBg }]}
      edges={['top', 'left', 'right']}
    >
      <StatusBar
        barStyle={chrome.statusBarStyle}
        backgroundColor={shellBg}
        translucent={false}
      />
      <View style={[styles.appShell, { backgroundColor: theme.listBg }]}>
    <GuestTab.Navigator
      key={theme.id}
      initialRouteName="Reels"
      tabBarPosition="bottom"
      screenListeners={tabScreenListeners}
      tabBar={(props) => {
        const tabState = props.state;
        const currentTab = tabState?.routes?.[tabState.index ?? 0]?.name;
        const chatsRoute = tabState?.routes?.find((r) => r.name === 'Chats');
        const stackScreen = getFocusedRouteName(
          chatsRoute?.state as Parameters<typeof getFocusedRouteName>[0]
        );
        const hideTabBar =
          (currentTab === 'Chats' && !!stackScreen && stackScreen !== 'ChatList') ||
          currentTab === 'Reels';
        return (
          <ThemedPhoneTabBar
            {...props}
            theme={theme}
            bottomInset={insets.bottom}
            hidden={hideTabBar}
            keepBottomInset={hideTabBar && currentTab !== 'Reels'}
          />
        );
      }}
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
        options={{
          lazy: false,
          tabBarIcon: ({ color, focused }) => (
            <AnimatedTabIcon
              name="chatbubble-ellipses-outline"
              focusedName="chatbubble-ellipses"
              size={22}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <GuestTab.Screen
        name="Explore"
        component={ExploreNavigator}
        options={{
          lazy: false,
          tabBarIcon: ({ color, focused }) => (
            <AnimatedTabIcon
              name="compass-outline"
              focusedName="compass"
              size={22}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <GuestTab.Screen
        name="Calls"
        component={CallsScreen}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <AnimatedTabIcon
              name="call-outline"
              focusedName="call"
              size={22}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <GuestTab.Screen
        name="Reels"
        component={GuestReelsNavigator}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <AnimatedTabIcon
              name="play-circle-outline"
              focusedName="play-circle"
              size={22}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
    </GuestTab.Navigator>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  appShell: { flex: 1 },
  tabBarMobile: {
    borderTopWidth: StyleSheet.hairlineWidth,
    elevation: 8,
  },
});
