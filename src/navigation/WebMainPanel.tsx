import React, { useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { NavigationContainer, NavigationIndependentTree, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ChatRoomScreen from '../screens/Chat/ChatRoomScreen';
import ContactScreen from '../screens/Chat/ContactScreen';
import EmptyChatScreen from '../screens/Chat/EmptyChatScreen';
import ChatSettingsScreen from '../screens/Chat/ChatSettingsScreen';
import GroupInfoScreen from '../screens/Group/GroupInfoScreen';
import ExploreNavigator from './ExploreNavigator';
import { useChatSettings } from '../context/ChatSettingsContext';
import { buildNavigationTheme } from '../theme/buildAppTheme';

const Stack = createNativeStackNavigator();

type ChatParams = {
  chatId?: string;
  groupId?: string;
  chatType?: string;
  chatName?: string;
  avatarUrl?: string;
};

type Props = {
  selectedChat: ChatParams | null;
};

function WebChatRoomPanel({ params }: { params: ChatParams }) {
  const panelKey = `chat-${params.chatId ?? params.groupId ?? 'room'}`;
  const { theme } = useChatSettings();
  const navigationTheme = useMemo(() => buildNavigationTheme(theme), [theme]);

  return (
    <NavigationIndependentTree>
      <NavigationContainer key={panelKey} theme={navigationTheme}>
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.listBg },
          }}
        >
          <Stack.Screen
            name="WebChatRoom"
            component={ChatRoomScreen}
            initialParams={params}
          />
          <Stack.Screen name="GroupInfo" component={GroupInfoScreen} />
          <Stack.Screen name="Contact" component={ContactScreen} />
          <Stack.Screen name="Settings" component={ChatSettingsScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </NavigationIndependentTree>
  );
}

/**
 * Desktop right panel: plain placeholder when idle; isolated navigator only when a chat is open.
 * Avoids registering a second stack in the root NavigationContainer beside the sidebar tabs.
 */
export function WebMainPanel({ selectedChat }: Props) {
  if (!selectedChat) {
    return <EmptyChatScreen />;
  }

  return <WebChatRoomPanel params={selectedChat} />;
}

/**
 * Desktop Explore main panel — own NavigationContainer so it does not clash
 * with the sidebar tab navigator (same pattern as Reels / WebChatPanel).
 */
export function WebExploreMainPanel() {
  const { theme } = useChatSettings();
  const navigationTheme = useMemo(() => buildNavigationTheme(theme), [theme]);

  return (
    <NavigationIndependentTree>
      <NavigationContainer theme={navigationTheme}>
        <ExploreNavigator />
      </NavigationContainer>
    </NavigationIndependentTree>
  );
}

/** Placeholder in the narrow sidebar when Reels tab is selected. */
export function WebReelsSidebarPlaceholder() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.reelsSidebarHint}>
      <TouchableOpacity
        style={[styles.reelsBackBtn, { marginTop: Math.max(insets.top, 8) }]}
        onPress={() => navigation.navigate('Chats')}
        accessibilityLabel="Back to chats"
        hitSlop={10}
      >
        <Ionicons name="arrow-back" size={22} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  reelsSidebarHint: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
  },
  reelsBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
