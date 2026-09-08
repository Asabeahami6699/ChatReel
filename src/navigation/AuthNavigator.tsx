import React from 'react'
import { Platform, StatusBar } from 'react-native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { SafeAreaView } from 'react-native-safe-area-context'
import LoginScreen from '../screens/Auth/LoginScreen'
import AgeGateScreen from '../screens/Auth/AgeGateScreen'
import RegisterScreen from '../screens/Auth/RegisterScreen'
import { useChatSettings } from '../context/ChatSettingsContext'

export type AuthStackParamList = {
  Login: undefined
  AgeGate: undefined
  Register: { dateOfBirth: string }
}

const Stack = createNativeStackNavigator<AuthStackParamList>()

export const AuthNavigator = () => {
  const { theme } = useChatSettings()
  const bg = theme.listBg
  const statusStyle = theme.isDark ? 'light-content' : 'dark-content'

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: bg }}
      edges={Platform.OS === 'web' ? undefined : ['top', 'left', 'right', 'bottom']}
    >
      <StatusBar barStyle={statusStyle} backgroundColor={bg} translucent={false} />
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: bg },
        }}
      >
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="AgeGate" component={AgeGateScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
      </Stack.Navigator>
    </SafeAreaView>
  )
}
