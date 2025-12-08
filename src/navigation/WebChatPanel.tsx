// src/navigation/WebChatPanel.tsx
import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import ChatScreen from '../screens/Chat/ChatScreen';
import EmptyChatScreen from '../screens/Chat/EmptyChatScreen';

const Stack = createStackNavigator();

export const WebChatPanel = ({ selectedChat }: { selectedChat: any }) => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} independent={true}>
      {!selectedChat ? (
        <Stack.Screen name="EmptyChat" component={EmptyChatScreen} />
      ) : (
        <Stack.Screen
          name="Chat"
          component={ChatScreen}
          initialParams={selectedChat}
        />
      )}
    </Stack.Navigator>
  );
};