// Updated: D:\chatApp\chatApp\src\components\AuthForm.tsx
import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'

interface AuthFormProps {
  title: string
  displayName?: string
  setDisplayName?: (text: string) => void
  email: string
  setEmail: (text: string) => void
  password: string
  setPassword: (text: string) => void
  confirmPassword?: string
  setConfirmPassword?: (text: string) => void
  onSubmit: () => void
  loading?: boolean
  footerText: string
  footerActionText: string
  onFooterAction: () => void
  secondaryActionText?: string
  onSecondaryAction?: () => void
  noGradient?: boolean // New prop to disable gradient for desktop layouts
}

export default function AuthForm({
  title,
  displayName,
  setDisplayName,
  email,
  setEmail,
  password,
  setPassword,
  confirmPassword,
  setConfirmPassword,
  onSubmit,
  loading,
  footerText,
  footerActionText,
  onFooterAction,
  secondaryActionText,
  onSecondaryAction,
  noGradient = false,
}: AuthFormProps) {
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [confirmPasswordError, setConfirmPasswordError] = useState('')
  const [displayNameError, setDisplayNameError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const { width } = useWindowDimensions()
  const isDesktop = width > 700

  // Validation handlers
  const validateEmail = (text: string) => {
    setEmail(text)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    setEmailError(emailRegex.test(text) ? '' : 'Enter a valid email address')
  }

  const validatePassword = (text: string) => {
    setPassword(text)
    setPasswordError(
      text.length < 6 ? 'Password must be at least 6 characters' : ''
    )
  }

  const validateConfirmPassword = (text: string) => {
    if (setConfirmPassword) {
      setConfirmPassword(text)
      setConfirmPasswordError(
        text !== password ? 'Passwords do not match' : ''
      )
    }
  }

  const validateDisplayName = (text: string) => {
    if (setDisplayName) {
      setDisplayName(text)
      setDisplayNameError(
        text.trim().length < 2 ? 'Display name must be at least 2 characters' : ''
      )
    }
  }

  const formContent = (
    <View style={[styles.formContainer, isDesktop && styles.desktopCard]}>
      <Text style={styles.title}>{title}</Text>

      {setDisplayName && (
        <>
          <TextInput
            placeholder="Display name"
            value={displayName}
            onChangeText={validateDisplayName}
            style={[
              styles.input,
              displayNameError ? styles.inputError : undefined,
            ]}
            autoCapitalize="words"
          />
          {displayNameError ? (
            <Text style={styles.errorText}>{displayNameError}</Text>
          ) : null}
        </>
      )}

      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={validateEmail}
        style={[styles.input, emailError ? styles.inputError : undefined]}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}

      {/* Password field with eye icon */}
      <View style={styles.passwordContainer}>
        <TextInput
          placeholder="Password"
          value={password}
          onChangeText={validatePassword}
          style={[styles.input, styles.passwordInput, passwordError ? styles.inputError : undefined]}
          secureTextEntry={!showPassword}
        />
        <TouchableOpacity
          style={styles.eyeIcon}
          onPress={() => setShowPassword(!showPassword)}
        >
          <Ionicons
            name={showPassword ? 'eye-off' : 'eye'}
            size={22}
            color="#555"
          />
        </TouchableOpacity>
      </View>
      {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}

      {/* Confirm password field */}
      {setConfirmPassword && (
        <>
          <View style={styles.passwordContainer}>
            <TextInput
              placeholder="Confirm password"
              value={confirmPassword}
              onChangeText={validateConfirmPassword}
              style={[
                styles.input,
                styles.passwordInput,
                confirmPasswordError ? styles.inputError : undefined,
              ]}
              secureTextEntry={!showConfirmPassword}
            />
            <TouchableOpacity
              style={styles.eyeIcon}
              onPress={() => setShowConfirmPassword(!showConfirmPassword)}
            >
              <Ionicons
                name={showConfirmPassword ? 'eye-off' : 'eye'}
                size={22}
                color="#555"
              />
            </TouchableOpacity>
          </View>
          {confirmPasswordError ? (
            <Text style={styles.errorText}>{confirmPasswordError}</Text>
          ) : null}
        </>
      )}

      <TouchableOpacity
        style={[
          styles.button,
          (loading || emailError || passwordError || confirmPasswordError) && {
            opacity: 0.7,
          },
        ]}
        onPress={onSubmit}
        disabled={
          loading ||
          !!emailError ||
          !!passwordError ||
          !!confirmPasswordError ||
          !!displayNameError
        }
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>{title}</Text>
        )}
      </TouchableOpacity>

      <View style={styles.footer}>
        <Text style={styles.footerText}>{footerText}</Text>
        <TouchableOpacity onPress={onFooterAction}>
          <Text style={styles.footerLink}>{footerActionText}</Text>
        </TouchableOpacity>
      </View>

      {secondaryActionText && onSecondaryAction ? (
        <TouchableOpacity
          style={styles.secondaryAction}
          onPress={onSecondaryAction}
          activeOpacity={0.75}
        >
          <Text style={styles.secondaryActionText}>{secondaryActionText}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  )

  return noGradient ? (
    <KeyboardAvoidingView
      style={[styles.safeContainer, isDesktop && styles.desktopContainer]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {formContent}
    </KeyboardAvoidingView>
  ) : (
    <LinearGradient
      colors={['#E3F2FD', '#BBDEFB', '#90CAF9']}
      style={styles.gradientBackground}
    >
      <KeyboardAvoidingView
        style={[styles.safeContainer, isDesktop && styles.desktopContainer]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {formContent}
      </KeyboardAvoidingView>
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  gradientBackground: {
    flex: 1,
  },
  safeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  desktopContainer: {
    justifyContent: 'center',
  },
  formContainer: {
    width: '100%',
    maxWidth: 420,
  },
  desktopCard: {
    backgroundColor: '#fff',
    padding: 32,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 35,
    color: '#222',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: '#fafafa',
    padding: 14,
    borderRadius: 10,
    marginBottom: 10,
    fontSize: 16,
  },
  passwordContainer: {
    position: 'relative',
    width: '100%',
  },
  passwordInput: {
    paddingRight: 45,
  },
  eyeIcon: {
    position: 'absolute',
    right: 15,
    top: 16,
  },
  inputError: { borderColor: '#e63946' },
  errorText: {
    color: '#e63946',
    fontSize: 13,
    marginBottom: 8,
    marginLeft: 4,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 30,
  },
  footerText: { color: '#555', fontSize: 15 },
  footerLink: {
    color: '#007AFF',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 6,
  },
  secondaryAction: {
    marginTop: 22,
    alignItems: 'center',
    paddingVertical: 10,
  },
  secondaryActionText: {
    color: '#007AFF',
    fontSize: 15,
    fontWeight: '600',
  },
})