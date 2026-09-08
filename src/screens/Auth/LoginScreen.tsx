import React, { useState, useCallback, useEffect, useRef } from 'react'
import {
  Alert,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  Platform,
  useWindowDimensions,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import QRCode from 'react-native-qrcode-svg'
import AuthForm from '../../components/AuthForm'
import PhoneAuthForm from '../../components/PhoneAuthForm'
import { Account2FAChallenge } from '../../components/Account2FAChallenge'
import { useAuth } from '../../hooks/useAuth'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { AuthStackParamList } from '../../navigation/AuthNavigator'
import { USE_NATIVE_DRIVER } from '../../lib/animation'
import { api, ApiError } from '../../lib/api'
import type { Session } from '@supabase/supabase-js'
import { getInstallationId } from '../../lib/installationId'

type LoginNavProp = NativeStackNavigationProp<AuthStackParamList, 'Login'>

const DEFAULT_TTL_SEC = 120
const POLL_MS = 1800

export default function LoginScreen() {
  const navigation = useNavigation<LoginNavProp>()
  const {
    signIn,
    sendPhoneOtp,
    verifyPhoneOtp,
    complete2faChallenge,
    recover2faChallenge,
    applySession,
    loading,
    enterGuest,
  } = useAuth()

  const [method, setMethod] = useState<'phone' | 'email'>('phone')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [twoFa, setTwoFa] = useState<{
    challengeToken: string
    securityQuestion: string
  } | null>(null)

  const { width } = useWindowDimensions()
  const isDesktop = width > 700

  const [qrRef, setQrRef] = useState('')
  const [timeLeft, setTimeLeft] = useState(DEFAULT_TTL_SEC)
  const [ttlSec, setTtlSec] = useState(DEFAULT_TTL_SEC)
  const [qrStatus, setQrStatus] = useState<'idle' | 'waiting' | 'linking' | 'error'>('idle')
  const [qrError, setQrError] = useState<string | null>(null)
  const generatingRef = useRef(false)
  const claimingRef = useRef(false)

  const spinRef = useRef(new Animated.Value(0)).current
  const spin = spinRef.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  })

  const generateRef = useCallback(async () => {
    if (generatingRef.current || claimingRef.current) return
    generatingRef.current = true
    setQrError(null)
    try {
      const installation_id = await getInstallationId()
      const res = await api.qr.createLoginSession({
        installation_id,
        device_label: 'ChatReel · Desktop (QR)',
        device_platform: Platform.OS,
      })
      setQrRef(res.ref)
      const nextTtl = res.expires_in_sec ?? DEFAULT_TTL_SEC
      setTtlSec(nextTtl)
      setTimeLeft(nextTtl)
      setQrStatus('waiting')
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not create login QR'
      setQrError(message)
      setQrStatus('error')
      setQrRef('')
    } finally {
      generatingRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!isDesktop) return
    void generateRef()
  }, [generateRef, isDesktop])

  useEffect(() => {
    if (!isDesktop || !qrRef || qrStatus !== 'waiting') return
    let cancelled = false
    const id = setInterval(() => {
      void (async () => {
        if (cancelled || claimingRef.current) return
        try {
          const res = await api.qr.getLoginSession(qrRef)
          if (cancelled) return
          if (res.status === 'pending') return
          if (res.status === 'approved' && res.session?.access_token && res.session.refresh_token) {
            claimingRef.current = true
            setQrStatus('linking')
            const session = {
              access_token: res.session.access_token,
              refresh_token: res.session.refresh_token,
              user: res.session.user,
            } as Session
            await applySession(session)
            return
          }
          if (res.status === 'consumed') {
            setQrError('Code already used. Refresh for a new one.')
            setQrStatus('error')
          }
        } catch (err) {
          if (cancelled) return
          if (err instanceof ApiError && err.status === 410) {
            setQrError('QR expired')
            setQrStatus('error')
            void generateRef()
          }
        }
      })()
    }, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [applySession, generateRef, isDesktop, qrRef, qrStatus])

  useEffect(() => {
    if (!isDesktop || !qrRef) return
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t > 1) return t - 1
        void generateRef()
        return ttlSec
      })
    }, 1000)
    return () => clearInterval(id)
  }, [generateRef, isDesktop, qrRef, ttlSec])

  useEffect(() => {
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
    const res = await signIn(email.trim(), password)
    if (res.requires2fa) {
      setTwoFa(res.requires2fa)
      return
    }
    if (res.error) Alert.alert('Login failed', res.error.message)
  }

  const handleSignUp = () => {
    navigation.navigate('AgeGate')
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
        if (res.requires2fa) {
          setTwoFa(res.requires2fa)
          return
        }
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

  if (twoFa) {
    return (
      <View style={styles.twoFaWrap}>
        <Account2FAChallenge
          securityQuestion={twoFa.securityQuestion}
          loading={loading}
          onCancel={() => setTwoFa(null)}
          onVerify={async (pin) => {
            const res = await complete2faChallenge(twoFa.challengeToken, pin)
            if (res.error) throw new Error(res.error.message)
            setTwoFa(null)
          }}
          onRecover={async (answer, newPin) => {
            const res = await recover2faChallenge(twoFa.challengeToken, answer, newPin)
            if (res.error) throw new Error(res.error.message)
            setTwoFa(null)
          }}
        />
      </View>
    )
  }

  if (isDesktop) {
    return (
      <View style={styles.desktopWrapper}>
        <View style={styles.qrContainer}>
          <View style={styles.qrHeader}>
            <Text style={styles.qrTitle}>Link with Mobile</Text>
            <Text style={styles.qrSubtitle}>
              Open ChatReel on your phone → Link a Device → scan this code to sign in here
            </Text>
          </View>
          <View style={styles.qrContent}>
            {!qrRef ? (
              <Text style={styles.loading}>
                {qrError || (qrStatus === 'error' ? 'Could not create QR' : 'Generating QR...')}
              </Text>
            ) : (
              <>
                <View style={styles.qrBox}>
                  <QRCode
                    value={`chatapp://login?ref=${encodeURIComponent(qrRef)}`}
                    size={240}
                    color="#000"
                    backgroundColor="#fff"
                    ecl="M"
                  />
                  <Animated.View style={[styles.ring, { transform: [{ rotate: spin }] }]}>
                    <Ionicons name="sync" size={32} color="#007AFF" />
                  </Animated.View>
                </View>
                <View style={styles.info}>
                  <Text style={styles.timer}>
                    {qrStatus === 'linking'
                      ? 'Signing you in…'
                      : (
                        <>
                          Expires in <Text style={styles.bold}>{timeLeft}s</Text>
                        </>
                      )}
                  </Text>
                  {qrError ? <Text style={styles.qrErr}>{qrError}</Text> : null}
                </View>
                <TouchableOpacity
                  style={styles.refreshBtn}
                  onPress={() => {
                    claimingRef.current = false
                    void generateRef()
                  }}
                >
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
  twoFaWrap: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#f8f9fa',
  },
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
    lineHeight: 20,
  },
  qrContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  qrBox: {
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 20,
    position: 'relative',
  },
  ring: {
    position: 'absolute',
    top: -10,
    right: -10,
    backgroundColor: '#fff',
    padding: 8,
    borderRadius: 30,
  },
  info: { marginTop: 24, alignItems: 'center' },
  timer: { fontSize: 16, color: '#333', textAlign: 'center' },
  bold: { fontWeight: 'bold' },
  qrErr: { marginTop: 8, color: '#dc2626', fontSize: 13, textAlign: 'center' },
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
  loading: { fontSize: 16, color: '#666', textAlign: 'center' },
  formContainerDesktop: {
    width: 420,
    maxWidth: '45%',
    backgroundColor: '#fff',
    borderLeftWidth: 1,
    borderLeftColor: '#eee',
  },
})
