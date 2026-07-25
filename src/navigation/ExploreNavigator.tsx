import React from 'react';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import FeedScreen from '../screens/Explore/FeedScreen';
import MarketScreen from '../screens/Explore/MarketScreen';
import ProductDetailScreen from '../screens/Explore/ProductDetailScreen';
import { StyleSheet, View } from 'react-native';
import { useChatSettings } from '../context/ChatSettingsContext';

const Tab = createMaterialTopTabNavigator();
const MarketStack = createStackNavigator();

const MarketStackScreen = () => (
  <MarketStack.Navigator>
    <MarketStack.Screen
      name="MarketMain"
      component={MarketScreen}
      options={{ headerShown: false }}
    />
    <MarketStack.Screen
      name="ProductDetail"
      component={ProductDetailScreen}
      options={{ headerShown: false }}
    />
  </MarketStack.Navigator>
);

const ExploreNavigator = () => {
  const { theme } = useChatSettings();

  return (
    <View style={[styles.container, { backgroundColor: theme.listBg }]}>
      <Tab.Navigator
        screenOptions={{
          tabBarActiveTintColor: theme.primary,
          tabBarInactiveTintColor: theme.tabInactive,
          tabBarIndicatorStyle: {
            backgroundColor: theme.primary,
            height: 3,
            borderRadius: 2,
          },
          tabBarLabelStyle: { fontSize: 14, fontWeight: '600', textTransform: 'none' },
          tabBarStyle: {
            backgroundColor: theme.listCardBg,
            elevation: 0,
            shadowOpacity: 0,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: theme.listBorder,
          },
          tabBarPressColor: 'rgba(0,122,255,0.08)',
        }}
      >
        <Tab.Screen name="Moment" component={FeedScreen} options={{ title: 'Moment' }} />
        <Tab.Screen name="Market" component={MarketStackScreen} />
      </Tab.Navigator>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
});

export default ExploreNavigator;
