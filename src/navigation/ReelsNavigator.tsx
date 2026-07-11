import React from 'react';
import { NavigationContainer, NavigationIndependentTree } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ReelsScreen from '../screens/Reel/ReelsScreen';
import ReelSearchScreen from '../screens/Reel/ReelSearchScreen';
import ReelInboxScreen from '../screens/Reel/ReelInboxScreen';
import ReelAccountScreen from '../screens/Reel/ReelAccountScreen';
import ReelCreatorProfileScreen from '../screens/Reel/ReelCreatorProfileScreen';
import ReelCreatorWalletScreen from '../screens/Reel/ReelCreatorWalletScreen';
import ReelDetailScreen from '../screens/Reel/ReelDetailScreen';
import ReelSoundScreen from '../screens/Reel/ReelSoundScreen';
import ReelsTabBar from '../screens/Reel/ReelsTabBar';
import { ReelFeedModeProvider, useReelFeedMode } from '../screens/Reel/ReelFeedModeContext';
import type { ReelsStackParamList, ReelsTabParamList } from './reelsNavigation';

const Tab = createBottomTabNavigator<ReelsTabParamList>();
const Stack = createNativeStackNavigator<ReelsStackParamList>();

function ReelTabsInner() {
  const { feedMode, setFeedMode, sidebarCollapsed, toggleSidebar } = useReelFeedMode();

  return (
    <Tab.Navigator
      initialRouteName="ReelHome"
      tabBar={(props) => (
        <ReelsTabBar
          {...props}
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
      <Tab.Screen name="ReelHome" component={ReelsScreen} />
      <Tab.Screen name="ReelSearch" component={ReelSearchScreen} />
      <Tab.Screen name="ReelInbox" component={ReelInboxScreen} />
      <Tab.Screen name="ReelAccount" component={ReelAccountScreen} />
    </Tab.Navigator>
  );
}

function ReelTabs() {
  return (
    <ReelFeedModeProvider>
      <ReelTabsInner />
    </ReelFeedModeProvider>
  );
}

export default function ReelsNavigator() {
  return (
    <NavigationIndependentTree>
      <NavigationContainer>
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#000' },
          }}
        >
          <Stack.Screen name="ReelTabs" component={ReelTabs} />
          <Stack.Screen name="ReelCreatorProfile" component={ReelCreatorProfileScreen} />
          <Stack.Screen name="ReelCreatorWallet" component={ReelCreatorWalletScreen} />
          <Stack.Screen
            name="ReelDetail"
            component={ReelDetailScreen}
            options={{ presentation: 'fullScreenModal' }}
          />
          <Stack.Screen name="ReelSound" component={ReelSoundScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </NavigationIndependentTree>
  );
}
