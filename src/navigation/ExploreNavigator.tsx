import React from 'react';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import FeedScreen from '../screens/Explore/FeedScreen';
import MarketScreen from '../screens/Explore/MarketScreen';
import ProductDetailScreen from '../screens/Explore/ProductDetailScreen';
import { StyleSheet, View } from 'react-native';

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
  return (
    <View style={styles.container}>
      <Tab.Navigator
        screenOptions={{
          tabBarActiveTintColor: '#007AFF',
          tabBarInactiveTintColor: '#8e8e93',
          tabBarIndicatorStyle: { backgroundColor: '#007AFF', height: 3, borderRadius: 2 },
          tabBarLabelStyle: { fontSize: 14, fontWeight: '600', textTransform: 'none' },
          tabBarStyle: {
            backgroundColor: '#fff',
            elevation: 0,
            shadowOpacity: 0,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: '#e2eaf3',
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
