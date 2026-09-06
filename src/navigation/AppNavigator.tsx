// src/navigation/AppNavigator.tsx
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  StyleSheet,
  View,
  StatusBar,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { getFocusedRouteName, MOBILE_BREAKPOINT } from './navigationUtils';
import {
  registerDesktopChatOpener,
  unregisterDesktopChatOpener,
  type OpenChatParams,
} from './chatNavigationBridge';
import { createMaterialTopTabNavigator, MaterialTopTabBar } from '@react-navigation/material-top-tabs';
import type { MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AnimatedTabIcon } from './AnimatedTabIcon';
import { DesktopVerticalTabBar } from './DesktopCollapsedVerticalTabBar';
import { USE_NATIVE_DRIVER } from '../lib/animation';
import type { ChatThemeTokens } from '../lib/chatThemes';

// === SCREENS ===
import ChatListScreen from '../screens/Chat/ChatListScreen';
import ChatRoomScreen from '../screens/Chat/ChatRoomScreen';
import EmptyChatScreen from '../screens/Chat/EmptyChatScreen';
import { ChatLockGate } from '../components/ChatLockGate';
import ProfileScreen from '../screens/Profile/ProfileScreen';
import ContactScreen from '../screens/Chat/ContactScreen';
import ExploreNavigator from './ExploreNavigator';
import CallsScreen from '../screens/Call/CallsScreen';
import ActiveCallScreen from '../screens/Call/ActiveCallScreen';
import OutgoingCallScreen from '../screens/Call/OutgoingCallScreen';
import ReelsNavigator from './ReelsNavigator';
import { WebMainPanel, WebExploreMainPanel } from './WebMainPanel';
import { CallsDesktopMain } from './CallsDesktopMain';
import PostReelScreen from '../screens/Reel/PostReelScreen';
import ReelPreviewScreen from '../screens/Reel/ReelPreviewScreen';
import NewGroupScreen from '../screens/Group/NewGroupScreen';
import GroupsListScreen from '../screens/Group/GroupsListScreen';
import ChatSettingsScreen from '../screens/Chat/ChatSettingsScreen';
import GlobalSearchScreen from '../screens/Chat/GlobalSearchScreen';
import StarredMessagesScreen from '../screens/Chat/StarredMessagesScreen';
import RemindersScreen from '../screens/Chat/RemindersScreen';
import ArchivedChatsScreen from '../screens/Chat/ArchivedChatsScreen';
import QRCodeScreen from '../screens/QR/QRCodeScreen';
import QRScannerScreen from '../screens/QR/QRScannerScreen';
import AddFriendScreen from '../screens/Friends/AddFriendScreen';
import FriendRequestsScreen from '../screens/Chat/FriendRequestsScreen';
import FriendsListScreen from '../screens/Friends/FriendsListScreen';
import InviteScreen from '../screens/Group/InviteScreen';
import GroupInfoScreen from '../screens/Group/GroupInfoScreen';
import JoinGroupScreen from '../screens/Group/JoinGroupScreen';
import { IncomingCallOverlay } from '../components/IncomingCallOverlay';
import { FloatingCallOverlay } from '../components/FloatingCallOverlay';
import { ActiveCallLayer } from '../components/ActiveCallLayer';
import { useChatSettings } from '../context/ChatSettingsContext';
import { ReelsMainTabFocusContext } from '../context/ReelsMainTabFocusContext';
import { blurActiveElementOnWeb } from '../lib/webFocus';

// === NAVIGATORS ===
const Tab = createMaterialTopTabNavigator();

/** Bottom tab chrome + home-indicator strip — follows light / dark / night themes. */
export function ThemedPhoneTabBar({
  theme,
  bottomInset,
  hidden,
  ...props
}: MaterialTopTabBarProps & {
  theme: ChatThemeTokens;
  bottomInset: number;
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <View
      style={[
        styles.phoneTabBarShell,
        {
          backgroundColor: theme.listCardBg,
          borderTopColor: theme.listBorder,
          paddingBottom: Math.max(bottomInset, Platform.OS === 'android' ? 8 : 0),
        },
      ]}
    >
      <MaterialTopTabBar {...props} />
    </View>
  );
}

const Stack = createNativeStackNavigator();

/** Inactive tab panels get aria-hidden; blur so focus isn't trapped on a hidden Pressable. */
const tabScreenListeners = {
  state: () => {
    blurActiveElementOnWeb();
  },
};

/* ------------------------------------------------------------------
 *  Web-only wrapper – shows the selected chat on the right panel
 * ------------------------------------------------------------------ */
const WebChatPanel = ({ selectedChat }: { selectedChat?: any }) => (
  <WebMainPanel selectedChat={selectedChat ?? null} />
);

type ChatStackProps = {
  /** Web split layout: chat room renders in the main panel, not in this stack. */
  setSelectedChat?: (chat: unknown) => void;
};

/* ------------------------------------------------------------------
 *  Unified Chat Stack (mobile + web sidebar)
 * ------------------------------------------------------------------ */
export const ChatStack = ({ setSelectedChat }: ChatStackProps) => {
  const { theme } = useChatSettings();
  return (
  <View style={{ flex: 1 }}>
  <Stack.Navigator
    screenOptions={{
      headerShown: false,
      contentStyle: { backgroundColor: theme.listBg },
    }}
  >
    <Stack.Screen name="ChatList">
      {(props) => <ChatListScreen {...props} setSelectedChat={setSelectedChat} />}
    </Stack.Screen>
    {!setSelectedChat && <Stack.Screen name="ChatRoom" component={ChatRoomScreen} />}
    {!setSelectedChat && <Stack.Screen name="EmptyChat" component={EmptyChatScreen} />}
    <Stack.Screen name="Profile" component={ProfileScreen} />
    <Stack.Screen name="Settings" component={ChatSettingsScreen} />
    <Stack.Screen name="GlobalSearch" component={GlobalSearchScreen} />
    <Stack.Screen name="StarredMessages" component={StarredMessagesScreen} />
    <Stack.Screen name="Reminders" component={RemindersScreen} />
    <Stack.Screen name="ArchivedChats" component={ArchivedChatsScreen} />
    <Stack.Screen name="Contact" component={ContactScreen} />
    <Stack.Screen name="NewGroup" component={NewGroupScreen} />
    <Stack.Screen name="QRCode" component={QRCodeScreen} />
    <Stack.Screen name="QRScanner" component={QRScannerScreen} />
    <Stack.Screen name="AddFriend" component={AddFriendScreen} />
    <Stack.Screen name="FriendRequests" component={FriendRequestsScreen} />
    <Stack.Screen name="FriendsList">
      {(props) => <FriendsListScreen {...props} setSelectedChat={setSelectedChat} />}
    </Stack.Screen>
    <Stack.Screen name="GroupsList">
      {(props) => <GroupsListScreen {...props} setSelectedChat={setSelectedChat} />}
    </Stack.Screen>
    <Stack.Screen name="GroupInfo" component={GroupInfoScreen} />
    <Stack.Screen
      name="JoinGroup"
      component={JoinGroupScreen}
      options={{ title: 'Join Group', headerShown: true }}
    />
  </Stack.Navigator>
  <ChatLockGate />
  </View>
  );
};

/* ------------------------------------------------------------------
 *  Reels Wrapper Component - Prevents auto-initialization
 * ------------------------------------------------------------------ */
const ReelsWrapper = ({ navigation }: { navigation: any }) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  React.useEffect(() => {
    const unsubscribeFocus = navigation.addListener('focus', () => {
      setIsFocused(true);
      setIsInitialized(true);
    });

    const unsubscribeBlur = navigation.addListener('blur', () => {
      setIsFocused(false);
    });

    return () => {
      unsubscribeFocus();
      unsubscribeBlur();
    };
  }, [navigation]);

  if (!isInitialized) {
    return <View style={styles.reelsPlaceholder} />;
  }

  return (
    <ReelsMainTabFocusContext.Provider value={isFocused}>
      <ReelsNavigator key="mobile-reels" />
    </ReelsMainTabFocusContext.Provider>
  );
};

/** Inactive label — active weight/color come from tabBarLabel renderer. */
const TAB_LABEL_STYLE = {
  fontSize: 12,
  fontWeight: '600' as const,
  letterSpacing: 0.2,
  textTransform: 'none' as const,
};

function TabBarLabel({
  label,
  color,
  focused,
}: {
  label: string;
  color: string;
  focused: boolean;
}) {
  const opacity = useRef(new Animated.Value(focused ? 1 : 0.78)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: focused ? 1 : 0.78,
      duration: 160,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  }, [focused, opacity]);

  return (
    <Animated.Text
      style={{
        fontSize: 12,
        letterSpacing: 0.2,
        textTransform: 'none',
        color,
        fontWeight: focused ? '800' : '600',
        marginTop: 2,
        opacity,
      }}
    >
      {label}
    </Animated.Text>
  );
}

/* ------------------------------------------------------------------
 *  Main Tab Navigator (Separate component)
 * ------------------------------------------------------------------ */
const MainTabNavigator = () => {
  const insets = useSafeAreaInsets();
  const { theme } = useChatSettings();
  const tabBarBase = useMemo(
    () => ({
      ...styles.tabBarMobile,
      height: 62,
      paddingBottom: 0,
      paddingTop: 4,
      backgroundColor: theme.listCardBg,
      borderTopColor: 'transparent',
      elevation: 0,
      shadowOpacity: 0,
    }),
    [theme.listCardBg]
  );

  return (
    <Tab.Navigator
      key={theme.id}
      initialRouteName="Chats"
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
          />
        );
      }}
      screenOptions={{
        tabBarShowLabel: true,
        tabBarActiveTintColor: theme.tabActive,
        tabBarInactiveTintColor: theme.tabInactive,
        tabBarStyle: tabBarBase,
        tabBarLabelStyle: TAB_LABEL_STYLE,
        tabBarItemStyle: { paddingVertical: 2 },
        lazy: true,
        lazyPreloadDistance: 0,
        swipeEnabled: false,
        tabBarPressColor: 'transparent',
        tabBarIndicatorStyle: { display: 'none' },
      }}
    >
      {/* CHATS TAB */}
      <Tab.Screen
        name="Chats"
        component={ChatStack}
        options={{
          lazy: false,
          tabBarLabel: ({ color, focused }) => (
            <TabBarLabel label="Chats" color={color} focused={focused} />
          ),
          tabBarIcon: ({ color, focused }) => (
            <AnimatedTabIcon
              name="chatbubble-ellipses-outline"
              focusedName="chatbubble-ellipses"
              size={24}
              color={color}
              focused={focused}
            />
          ),
        }}
      />

      {/* EXPLORE TAB */}
      <Tab.Screen
        name="Explore"
        component={ExploreNavigator}
        options={{
          lazy: false,
          tabBarLabel: ({ color, focused }) => (
            <TabBarLabel label="Explore" color={color} focused={focused} />
          ),
          tabBarIcon: ({ color, focused }) => (
            <AnimatedTabIcon
              name="compass-outline"
              focusedName="compass"
              size={24}
              color={color}
              focused={focused}
            />
          ),
        }}
      />

      {/* CALLS TAB */}
      <Tab.Screen
        name="Calls"
        component={CallsScreen}
        options={{
          lazy: false,
          tabBarLabel: ({ color, focused }) => (
            <TabBarLabel label="Calls" color={color} focused={focused} />
          ),
          tabBarIcon: ({ color, focused }) => (
            <AnimatedTabIcon
              name="call-outline"
              focusedName="call"
              size={24}
              color={color}
              focused={focused}
            />
          ),
        }}
      />

      {/* REELS TAB */}
      <Tab.Screen
        name="Reels"
        component={ReelsWrapper}
        options={{
          tabBarLabel: ({ color, focused }) => (
            <TabBarLabel label="Reels" color={color} focused={focused} />
          ),
          tabBarIcon: ({ color, focused }) => (
            <AnimatedTabIcon
              name="play-circle-outline"
              focusedName="play-circle"
              size={24}
              color={color}
              focused={focused}
            />
          ),
          lazy: true,
        }}
      />
    </Tab.Navigator>
  );
};

/* ------------------------------------------------------------------
 *  Web desktop: sidebar + chat panel (no call screens here — those live
 *  on the root stack so navigation works from nested chat trees).
 * ------------------------------------------------------------------ */
const SIDEBAR_LIST = 320;
const SIDEBAR_NAV = 72;

const WebDesktopMain = () => {
  const [selectedChat, setSelectedChat] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('Chats');
  const { theme } = useChatSettings();
  const isReels = activeTab === 'Reels';
  const isExplore = activeTab === 'Explore';
  const isCalls = activeTab === 'Calls';
  const showListSidebar = activeTab === 'Chats' || isCalls;
  const sidebarWidth = showListSidebar ? SIDEBAR_NAV + SIDEBAR_LIST : SIDEBAR_NAV;

  const openDesktopChat = useCallback((params: OpenChatParams) => {
    setActiveTab('Chats');
    setSelectedChat(params);
  }, []);

  useLayoutEffect(() => {
    registerDesktopChatOpener(openDesktopChat);
    return () => unregisterDesktopChatOpener();
  }, [openDesktopChat]);

  return (
    <View style={styles.webContainer}>
      <View
        style={[
          styles.sidebarShell,
          {
            width: sidebarWidth,
            backgroundColor: isReels ? '#000' : theme.listCardBg,
            borderColor: isReels ? '#222' : theme.listBorder,
          },
        ]}
      >
        <Tab.Navigator
          initialRouteName="Chats"
          tabBarPosition="bottom"
          tabBar={(props) => (
            <View style={styles.navRailHost} pointerEvents="box-none">
              <DesktopVerticalTabBar
                {...props}
                variant={isReels ? 'reels' : 'default'}
                activeColor={isReels ? '#fff' : theme.tabActive}
                inactiveColor={
                  isReels ? 'rgba(255,255,255,0.45)' : theme.tabInactive
                }
                backgroundColor={isReels ? '#000' : theme.listCardBg}
                borderColor={isReels ? '#222' : theme.listBorder}
              />
            </View>
          )}
          screenListeners={{
            state: (e) => {
              blurActiveElementOnWeb();
              const state = e.data.state;
              if (!state?.routes?.length) return;
              const name = state.routes[state.index]?.name;
              if (name) setActiveTab(name);
            },
          }}
          screenOptions={{
            tabBarShowIcon: true,
            tabBarShowLabel: false,
            tabBarActiveTintColor: isReels ? '#fff' : theme.tabActive,
            tabBarInactiveTintColor: isReels
              ? 'rgba(255,255,255,0.45)'
              : theme.tabInactive,
            tabBarStyle: { display: 'none' },
            tabBarIndicatorStyle: { display: 'none' },
            tabBarPressColor: 'transparent',
            lazy: true,
            lazyPreloadDistance: 0,
          }}
        >
          <Tab.Screen
            name="Chats"
            listeners={{ focus: () => setSelectedChat(null) }}
            options={{
              lazy: false,
              sceneStyle: styles.listSceneHost,
            }}
          >
            {() => (
              <View style={[styles.listSceneInner, { borderColor: theme.listBorder }]}>
                <ChatStack setSelectedChat={setSelectedChat} />
              </View>
            )}
          </Tab.Screen>
          <Tab.Screen
            name="Explore"
            options={{
              lazy: false,
              sceneStyle: styles.collapsedScene,
            }}
          >
            {() => <View />}
          </Tab.Screen>
          <Tab.Screen
            name="Calls"
            options={{
              sceneStyle: styles.listSceneHost,
            }}
          >
            {() => (
              <View style={[styles.listSceneInner, { borderColor: theme.listBorder }]}>
                <CallsScreen />
              </View>
            )}
          </Tab.Screen>
          <Tab.Screen
            name="Reels"
            options={{ sceneStyle: styles.collapsedScene }}
          >
            {() => <View />}
          </Tab.Screen>
        </Tab.Navigator>
      </View>

      <View style={[styles.mainPanel, { backgroundColor: theme.listBg }]}>
        {isReels ? (
          <ReelsNavigator key="web-desktop-reels" />
        ) : isExplore ? (
          <WebExploreMainPanel key="web-desktop-explore" />
        ) : isCalls ? (
          <CallsDesktopMain key="web-desktop-calls" />
        ) : (
          <WebChatPanel selectedChat={selectedChat} />
        )}
      </View>
    </View>
  );
};

/* ------------------------------------------------------------------
 *  Root stack: Main UI + full-screen call flows (all platforms).
 * ------------------------------------------------------------------ */
type LayoutMode = 'mobile' | 'desktop';

function MainShell() {
  const { width } = useWindowDimensions();
  const { theme } = useChatSettings();
  const targetLayout: LayoutMode =
    Platform.OS === 'web' && width >= MOBILE_BREAKPOINT ? 'desktop' : 'mobile';
  const [activeLayout, setActiveLayout] = useState<LayoutMode | null>(targetLayout);

  useEffect(() => {
    if (activeLayout === targetLayout) return;
    setActiveLayout(null);
    const timer = setTimeout(() => setActiveLayout(targetLayout), 0);
    return () => clearTimeout(timer);
  }, [targetLayout, activeLayout]);

  if (!activeLayout) {
    return (
      <View style={[styles.layoutSwapPlaceholder, { backgroundColor: theme.listBg }]} />
    );
  }

  return activeLayout === 'desktop' ? (
    <WebDesktopMain key="web-desktop-main" />
  ) : (
    <MainTabNavigator key="mobile-main" />
  );
}

export const AppNavigator = () => {
  const { width } = useWindowDimensions();
  const { theme } = useChatSettings();
  const isWebDesktop = Platform.OS === 'web' && width >= MOBILE_BREAKPOINT;
  // WhatsApp/Telegram-style: themed shell under the status bar. Use header
  // surface (not pure white) so light themes keep dark status icons readable.
  const shellBg = theme.listHeaderBg;

  return (
    <SafeAreaView
      style={[
        isWebDesktop ? styles.webSafeArea : styles.safeArea,
        !isWebDesktop && { backgroundColor: shellBg },
      ]}
      edges={isWebDesktop ? undefined : ['top', 'left', 'right']}
    >
      <StatusBar
        barStyle={theme.isDark ? 'light-content' : 'dark-content'}
        backgroundColor={shellBg}
        translucent={false}
      />
      <View style={[styles.appShell, { backgroundColor: theme.listBg }]}>
        <Stack.Navigator
          detachInactiveScreens
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.listBg },
            freezeOnBlur: true,
          }}
        >
          <Stack.Screen name="Main" component={MainShell} />
          <Stack.Screen
            name="Invite"
            component={InviteScreen}
            options={{
              headerShown: true,
              title: 'Group Invite',
              presentation: 'modal',
            }}
          />
          <Stack.Screen
            name="PostReel"
            component={PostReelScreen}
            options={{
              headerShown: false,
              presentation: 'modal',
              contentStyle: { backgroundColor: '#000' },
            }}
          />
          <Stack.Screen
            name="ReelPreview"
            component={ReelPreviewScreen}
            options={{
              headerShown: false,
              presentation: 'fullScreenModal',
              contentStyle: { backgroundColor: '#000' },
            }}
          />
          <Stack.Screen
            name="OutgoingCall"
            component={OutgoingCallScreen}
            options={{
              headerShown: false,
              presentation: 'fullScreenModal',
              contentStyle: { backgroundColor: '#000' },
            }}
          />
          <Stack.Screen
            name="ActiveCall"
            component={ActiveCallScreen}
            options={{
              headerShown: false,
              presentation: 'fullScreenModal',
              contentStyle: { backgroundColor: '#000' },
              freezeOnBlur: false,
            }}
          />
        </Stack.Navigator>
        <View style={styles.incomingCallHost} pointerEvents="box-none">
          <ActiveCallLayer />
          <FloatingCallOverlay />
          <IncomingCallOverlay />
        </View>
      </View>
    </SafeAreaView>
  );
};

/* ============================= STYLES ============================= */
const styles = StyleSheet.create({
  // Web styles
  webSafeArea: { 
    flex: 1, 
    backgroundColor: '#f0f2f5' 
  },
  webContainer: { 
    flex: 1, 
    flexDirection: 'row' 
  },
  sidebarShell: {
    borderRightWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    flexShrink: 0,
  },
  navRailHost: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: SIDEBAR_NAV,
    zIndex: 20,
  },
  listSceneHost: {
    flex: 1,
    width: '100%',
    overflow: 'hidden',
  },
  listSceneInner: {
    position: 'absolute',
    left: SIDEBAR_NAV,
    top: 0,
    bottom: 0,
    width: SIDEBAR_LIST,
    overflow: 'hidden',
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  sidebar: {
    width: 320,
    borderRightWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },
  sidebarReels: {
    backgroundColor: '#000',
    borderColor: '#222',
  },
  webTabBar: {
    borderTopWidth: 0.5,
    height: 60,
  },
  webTabBarCollapsed: {
    backgroundColor: '#111',
    borderTopWidth: 0.5,
    borderColor: '#333',
    height: 60,
  },
  webTabBarItemCollapsed: {
    paddingVertical: 6,
    minWidth: 0,
  },
  collapsedScene: {
    flex: 0,
    width: 0,
    height: 0,
    overflow: 'hidden',
    opacity: 0,
  },
  mainPanel: {
    flex: 1,
    minWidth: 0,
  },

  // Mobile styles — backgroundColor overridden by theme in AppNavigator
  safeArea: {
    flex: 1,
  },
  appShell: {
    flex: 1,
  },
  incomingCallHost: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
  tabBarMobile: {
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    minHeight: 56,
    elevation: 0,
    shadowOpacity: 0,
  },
  phoneTabBarShell: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  reelsPlaceholder: {
    flex: 1,
    backgroundColor: '#000',
  },
  layoutSwapPlaceholder: {
    flex: 1,
  },
});