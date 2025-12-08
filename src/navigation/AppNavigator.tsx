// src/navigation/AppNavigator.tsx (Only this code, remove everything after line 250)
import React, { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  createMaterialTopTabNavigator,
  MaterialTopTabNavigationOptions,
} from '@react-navigation/material-top-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

// === SCREENS ===
import ChatListScreen from '../screens/Chat/ChatListScreen';
import ChatRoomScreen from '../screens/Chat/ChatRoomScreen';
import EmptyChatScreen from '../screens/Chat/EmptyChatScreen';
import ProfileScreen from '../screens/Profile/ProfileScreen';
import ExploreNavigator from './ExploreNavigator';
import CallsScreen from '../screens/Call/CallsScreen';
import ReelsScreen from '../screens/Reel/ReelsScreen';
import NewGroupScreen from '../screens/Group/NewGroupScreen';
import QRCodeScreen from '../screens/QR/QRCodeScreen';
import QRScannerScreen from '../screens/QR/QRScannerScreen';
import AddFriendScreen from '../screens/Friends/AddFriendScreen';
import FriendRequestsScreen from '../screens/Chat/FriendRequestsScreen';
import FriendsListScreen from '../screens/Friends/FriendsListScreen';
import InviteScreen from '../screens/Group/InviteScreen';
import GroupInfoScreen from '../screens/Group/GroupInfoScreen';
import JoinGroupScreen from '../screens/Group/JoinGroupScreen';

// === NAVIGATORS ===
const Tab = createMaterialTopTabNavigator();
const Stack = createNativeStackNavigator();

/* ------------------------------------------------------------------
 *  Web-only wrapper – shows the selected chat on the right panel
 * ------------------------------------------------------------------ */
const WebChatPanel = ({ route }: { route?: { params?: any } }) => {
  const selectedChat = route?.params;
  if (!selectedChat) return <EmptyChatScreen />;
  return <ChatRoomScreen route={{ params: selectedChat }} />;
};

/* ------------------------------------------------------------------
 *  Unified Chat Stack (For regular navigation)
 * ------------------------------------------------------------------ */
const ChatStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="ChatList" component={ChatListScreen} />
    <Stack.Screen name="ChatRoom" component={ChatRoomScreen} />
    <Stack.Screen name="EmptyChat" component={EmptyChatScreen} />
    <Stack.Screen name="Profile" component={ProfileScreen} />
    <Stack.Screen name="NewGroup" component={NewGroupScreen} />
    <Stack.Screen name="QRCode" component={QRCodeScreen} />
    <Stack.Screen name="QRScanner" component={QRScannerScreen} />
    <Stack.Screen name="AddFriend" component={AddFriendScreen} />
    <Stack.Screen name="FriendRequests" component={FriendRequestsScreen} />
    <Stack.Screen name="FriendsList" component={FriendsListScreen} />
    <Stack.Screen name="GroupInfo" component={GroupInfoScreen} />
    <Stack.Screen 
      name="JoinGroup" 
      component={JoinGroupScreen}
      options={{ title: 'Join Group', headerShown: true }}
    />
  </Stack.Navigator>
);

/* ------------------------------------------------------------------
 *  Main App Navigator with Deep Link Support
 * ------------------------------------------------------------------ */
export const AppNavigator = () => {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const [selectedChat, setSelectedChat] = useState<any>(null);

  /* ============================= WEB ============================= */
  if (isWeb) {
    return (
      <SafeAreaView style={styles.webSafeArea}>
        <View style={styles.webContainer}>
          <View style={styles.sidebar}>
            <Tab.Navigator
              initialRouteName="Chats"
              tabBarPosition="bottom"
              screenOptions={{
                tabBarShowLabel: true,
                tabBarActiveTintColor: '#007AFF',
                tabBarInactiveTintColor: '#999',
                tabBarStyle: styles.webTabBar,
                tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
              }}
            >
              <Tab.Screen
                name="Chats"
                component={ChatListScreen}
                listeners={{ focus: () => setSelectedChat(null) }}
              />
              <Tab.Screen name="Explore" component={ExploreNavigator} />
              <Tab.Screen name="Calls" component={CallsScreen} />
              <Tab.Screen name="Reels" component={ReelsScreen} />
            </Tab.Navigator>
          </View>

          <View style={styles.mainPanel}>
            <WebChatPanel route={{ params: selectedChat }} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  /* ============================ MOBILE ============================ */
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {/* Main Tab Navigator */}
      <Stack.Screen name="MainTabs" component={MainTabNavigator} />
      
      {/* Invite Screen - At root level for deep linking */}
      <Stack.Screen 
        name="Invite" 
        component={InviteScreen}
        options={{ 
          headerShown: true,
          title: 'Group Invite',
          presentation: 'modal'
        }}
      />
    </Stack.Navigator>
  );
};

/* ------------------------------------------------------------------
 *  Main Tab Navigator (Separate component)
 * ------------------------------------------------------------------ */
const MainTabNavigator = () => {
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        { paddingTop: insets.top * 0.1, paddingBottom: insets.bottom * 0.1 },
      ]}
    >
      <Tab.Navigator
        initialRouteName="Chats"
        tabBarPosition="bottom"
        screenOptions={{
          tabBarShowLabel: true,
          tabBarActiveTintColor: '#1e73ceff',
          tabBarInactiveTintColor: '#000000ff',
          tabBarStyle: styles.tabBarMobile,
          tabBarLabelStyle: { fontSize: 15, fontWeight: '900' },
        }}
      >
        {/* CHATS TAB – Hide tab bar when inside ChatRoom */}
        <Tab.Screen
          name="Chats"
          component={ChatStack}
          options={({ navigation, route }) => {
            // Check if we're inside ChatRoom
            const state = navigation.getState();
            const isInChatRoom =
              state?.routes?.[state.index]?.name === 'ChatRoom' ||
              state?.routes?.[state.index]?.state?.routes?.[
                state.routes[state.index].state?.index || 0
              ]?.name === 'ChatRoom';

            return {
              tabBarStyle: isInChatRoom ? { display: 'none' } : styles.tabBarMobile,
              tabBarIcon: ({ color }) => (
                <Ionicons name="chatbubble-outline" size={20} color={color} />
              ),
            };
          }}
        />

        {/* OTHER TABS – Always show */}
        <Tab.Screen
          name="Explore"
          component={ExploreNavigator}
          options={{
            tabBarIcon: ({ color }) => (
              <Ionicons name="compass-outline" size={22} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Calls"
          component={CallsScreen}
          options={{
            tabBarIcon: ({ color }) => (
              <Ionicons name="call-outline" size={22} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Reels"
          component={ReelsScreen}
          options={{
            tabBarStyle: { display: 'none' },
            tabBarIcon: ({ color }) => (
              <Ionicons name="play-circle-outline" size={22} color={color} />
            ),
          }}
        />
      </Tab.Navigator>
    </SafeAreaView>
  );
};

/* ============================= STYLES ============================= */
const styles = StyleSheet.create({
  webSafeArea: { flex: 1, backgroundColor: '#f0f2f5' },
  webContainer: { flex: 1, flexDirection: 'row' },
  sidebar: {
    width: 320,
    backgroundColor: '#fff',
    borderRightWidth: 1,
    borderColor: '#ddd',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },
  webTabBar: {
    backgroundColor: '#fff',
    borderTopWidth: 0.5,
    borderColor: '#eee',
  },
  mainPanel: { flex: 1, backgroundColor: '#fafafa' },

  safeArea: { flex: 1, backgroundColor: '#120c0cff' },
  tabBarMobile: {
    backgroundColor: '#fff',
    borderTopWidth: 0.5,
    borderColor: '#eee',
    height: 60,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
});