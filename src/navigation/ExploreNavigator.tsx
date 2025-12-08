// src/navigation/ExploreNavigator.tsx
import React from 'react'
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs'
import { createStackNavigator } from '@react-navigation/stack'
import FeedScreen from '../screens/Explore/FeedScreen'
import MarketScreen from '../screens/Explore/MarketScreen'
import ProductDetailScreen from '../screens/Explore/ProductDetailScreen'
import { SafeAreaView, StyleSheet } from 'react-native'

const Tab = createMaterialTopTabNavigator()
const MarketStack = createStackNavigator()

// Create a stack navigator for the Market tab
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
      options={{ 
        headerShown: false // Add this line to hide the stack navigator header
      }}
    />
  </MarketStack.Navigator>
)

const ExploreNavigator = () => {
  return (
    <SafeAreaView style={styles.container}>
      <Tab.Navigator
        screenOptions={{
          tabBarActiveTintColor: '#007AFF',
          tabBarInactiveTintColor: '#777',
          tabBarIndicatorStyle: { backgroundColor: '#007AFF', height: 3, borderRadius: 2 },
          tabBarLabelStyle: { fontSize: 14, fontWeight: '600', textTransform: 'none' },
          tabBarStyle: { backgroundColor: '#fff', elevation: 0 },
        }}
      >
        <Tab.Screen name="Feed" component={FeedScreen} />
        <Tab.Screen name="Market" component={MarketStackScreen} />
      </Tab.Navigator>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
})

export default ExploreNavigator