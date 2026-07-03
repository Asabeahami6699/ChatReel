import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { NavigationContainer, NavigationIndependentTree } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ChatRoomScreen from '../screens/Chat/ChatRoomScreen';
import ContactScreen from '../screens/Chat/ContactScreen';
import EmptyChatScreen from '../screens/Chat/EmptyChatScreen';
import GroupInfoScreen from '../screens/Group/GroupInfoScreen';

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

  return (
    <NavigationIndependentTree>
      <NavigationContainer key={panelKey}>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen
            name="WebChatRoom"
            component={ChatRoomScreen}
            initialParams={params}
          />
          <Stack.Screen name="GroupInfo" component={GroupInfoScreen} />
          <Stack.Screen name="Contact" component={ContactScreen} />
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

/** Placeholder in the narrow sidebar when Reels tab is selected. */
export function WebReelsSidebarPlaceholder() {
  return (
    <View style={styles.reelsSidebarHint}>
      <Text style={styles.reelsSidebarHintText}>Reels open in the main panel →</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  reelsSidebarHint: {
    flex: 1,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  reelsSidebarHintText: {
    color: '#888',
    fontSize: 12,
    textAlign: 'center',
  },
});
