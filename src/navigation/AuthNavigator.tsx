import React from 'react'
import { Platform } from 'react-native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { SafeAreaView } from 'react-native-safe-area-context'
import LoginScreen from '../screens/Auth/LoginScreen'
import RegisterScreen from '../screens/Auth/RegisterScreen'

export type AuthStackParamList = {
  Login: undefined
  Register: undefined
}

const Stack = createNativeStackNavigator<AuthStackParamList>()

export const AuthNavigator = () => {
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: '#fff' }}
      edges={Platform.OS === 'web' ? undefined : ['top', 'left', 'right', 'bottom']}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
      </Stack.Navigator>
    </SafeAreaView>
  )
}
