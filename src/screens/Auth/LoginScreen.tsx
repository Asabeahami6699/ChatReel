import React, { useState } from 'react'
import { Alert, View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { useWindowDimensions } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import QRCode from 'react-native-qrcode-svg'
import AuthForm from '../../components/AuthForm'
import PhoneAuthForm from '../../components/PhoneAuthForm'
import { useAuth } from '../../hooks/useAuth'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { AuthStackParamList } from '../../navigation/AuthNavigator'
import { USE_NATIVE_DRIVER } from '../../lib/animation'

type LoginNavProp = NativeStackNavigationProp<AuthStackParamList, 'Login'>

export default function LoginScreen() {
  const navigation = useNavigation<LoginNavProp>()
  const { signIn, sendPhoneOtp, verifyPhoneOtp, loading, enterGuest } = useAuth()

  const [method, setMethod] = useState<'phone' | 'email'>('phone')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const { width } = useWindowDimensions()
  const isDesktop = width > 700

  const [qrRef, setQrRef] = useState('')
  const [timeLeft, setTimeLeft] = useState(30)
  const spinRef = React.useRef(new Animated.Value(0)).current
  const spin = spinRef.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  })

  const generateRef = async () => {
    const ref = `login_${Date.now()}`
    setQrRef(ref)
    setTimeLeft(30)
  }

  React.useEffect(() => {
    generateRef()
    const id = setInterval(generateRef, 30000)
    return () => clearInterval(id)
  }, [])

  React.useEffect(() => {
    const id = setInterval(() => {
      setTimeLeft((t) => (t > 0 ? t - 1 : 0))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  React.useEffect(() => {
    Animated.loop(
      Animated.timing(spinRef, {
        toValue: 1,
        duration: 3000,
        easing: Easing.linear,
        useNativeDriver: USE_NATIVE_DRIVER,
      })
    ).start()
  }, [spinRef])

  const handleEmailLogin = async () => {
    if (!email || !password) {
      Alert.alert('Please fill in all fields')
      return
    }
    const { error } = await signIn(email.trim(), password)
    if (error) Alert.alert('Login failed', error.message)
  }

  const handleSignUp = () => {
    navigation.navigate('Register')
  }

  const handleExplore = () => {
    enterGuest()
  }

  const phoneForm = (
    <PhoneAuthForm
      mode="login"
      loading={loading}
      footerText="Don't have an account?"
      footerActionText="Register"
      onFooterAction={handleSignUp}
      tertiaryActionText="Use email instead"
      onTertiaryAction={() => setMethod('email')}
      secondaryActionText="Explore without an account"
      onSecondaryAction={handleExplore}
      noGradient={isDesktop}
      onSendCode={async ({ phone }) => {
        const res = await sendPhoneOtp(phone, 'login')
        if (res.error) return { error: res.error.message }
        return { phone: res.data!.phone, phone_masked: res.data!.phone_masked }
      }}
      onVerifyCode={async ({ phone, token }) => {
        const res = await verifyPhoneOtp(phone, token)
        if (res.error) return { error: res.error.message }
      }}
    />
  )

  const emailForm = (
    <AuthForm
      title="Login"
      email={email}
      password={password}
      setEmail={setEmail}
      setPassword={setPassword}
      onSubmit={handleEmailLogin}
      loading={loading}
      footerText="Don't have an account?"
      footerActionText="Register"
      onFooterAction={handleSignUp}
      secondaryActionText="Use phone instead"
      onSecondaryAction={() => setMethod('phone')}
      noGradient={isDesktop}
    />
  )

  const form = method === 'phone' ? phoneForm : emailForm

  if (isDesktop) {
    return (
      <View style={styles.desktopWrapper}>
        <View style={styles.qrContainer}>
          <View style={styles.qrHeader}>
            <Text style={styles.qrTitle}>Link with Mobile</Text>
            <Text style={styles.qrSubtitle}>Scan QR with your app to log in</Text>
          </View>
          <View style={styles.qrContent}>
            {!qrRef ? (
              <Text style={styles.loading}>Generating QR...</Text>
            ) : (
              <>
                <View style={styles.qrBox}>
                  <QRCode
                    value={`myapp://login?ref=${qrRef}`}
                    size={240}
                    color="#000"
                    backgroundColor="#fff"
                  />
                  <Animated.View style={[styles.ring, { transform: [{ rotate: spin }] }]}>
                    <Ionicons name="sync" size={32} color="#007AFF" />
                  </Animated.View>
                </View>
                <View style={styles.info}>
                  <Text style={styles.timer}>
                    Expires in <Text style={styles.bold}>{timeLeft}s</Text>
                  </Text>
                </View>
                <TouchableOpacity style={styles.refreshBtn} onPress={generateRef}>
                  <Ionicons name="refresh" size={20} color="#fff" />
                  <Text style={styles.refreshText}>New Code</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        <View style={styles.formContainerDesktop}>{form}</View>
      </View>
    )
  }

  return form
}

const styles = StyleSheet.create({
  desktopWrapper: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#f9f9f9',
  },
  qrContainer: {
    flex: 1,
    backgroundColor: '#f9f9f9',
  },
  qrHeader: {
    padding: 24,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  qrTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  qrSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  qrContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  formContainerDesktop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f9f9f9',
  },
  qrBox: {
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
    position: 'relative',
  },
  ring: {
    position: 'absolute',
    top: -10,
    right: -10,
    backgroundColor: '#fff',
    padding: 8,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  info: { marginTop: 24 },
  timer: { fontSize: 16, color: '#007AFF', textAlign: 'center' },
  bold: { fontWeight: 'bold' },
  refreshBtn: {
    flexDirection: 'row',
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 30,
    marginTop: 24,
    alignItems: 'center',
  },
  refreshText: { color: '#fff', marginLeft: 8, fontWeight: '600' },
  loading: { fontSize: 18, color: '#666', textAlign: 'center' },
})
