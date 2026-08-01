// src/screens/QR/QRCodeScreen.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { useChatSettings } from '../../context/ChatSettingsContext';
import { useRealtimeTopic } from '../../hooks/useRealtimeTopic';
import { useNavigation } from '@react-navigation/native';
import { USE_NATIVE_DRIVER } from '../../lib/animation';

const DEFAULT_TTL_SEC = 180;

export default function QRCodeScreen() {
  const { user } = useAuth();
  const { theme } = useChatSettings();
  const navigation = useNavigation<any>();
  const [qrRef, setQrRef] = useState('');
  const [timeLeft, setTimeLeft] = useState(DEFAULT_TTL_SEC);
  const [ttlSec, setTtlSec] = useState(DEFAULT_TTL_SEC);
  const generatingRef = useRef(false);

  const spinRef = useRef(new Animated.Value(0)).current;
  const spin = spinRef.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const generateRef = useCallback(async () => {
    if (!user || generatingRef.current) return;
    generatingRef.current = true;
    try {
      const res = await api.qr.createSession();
      setQrRef(res.ref);
      const nextTtl = res.expires_in_sec ?? DEFAULT_TTL_SEC;
      setTtlSec(nextTtl);
      setTimeLeft(nextTtl);
    } catch {
      Alert.alert('Error', 'Failed to generate QR');
    } finally {
      generatingRef.current = false;
    }
  }, [user]);

  useEffect(() => {
    void generateRef();
  }, [generateRef]);

  useRealtimeTopic(user ? 'linkedDevices' : null, () => {
    Alert.alert('Device linked', 'A device was linked to your account.', [
      { text: 'OK', onPress: () => navigation.navigate('Chats') },
    ]);
  });

  useEffect(() => {
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t > 1) return t - 1;
        // Auto-refresh when expired so scanners never hit a dead code.
        void generateRef();
        return ttlSec;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [generateRef, ttlSec]);

  useEffect(() => {
    Animated.loop(
      Animated.timing(spinRef, {
        toValue: 1,
        duration: 3000,
        easing: Easing.linear,
        useNativeDriver: USE_NATIVE_DRIVER,
      })
    ).start();
  }, [spinRef]);

  if (!qrRef) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.listBg }]}
        edges={['left', 'right', 'bottom']}
      >
        <Text style={[styles.loading, { color: theme.listSecondaryText }]}>
          Generating QR...
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.listBg }]}
      edges={['left', 'right', 'bottom']}
    >
      <View
        style={[
          styles.header,
          { backgroundColor: theme.listCardBg, borderBottomColor: theme.listBorder },
        ]}
      >
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={28} color={theme.listPrimaryText} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.listPrimaryText }]}>Link a Device</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.content}>
        <Text style={[styles.subtitle, { color: theme.listSecondaryText }]}>
          Open ChatReel on your other device → Scan QR. Hold steady until it locks.
        </Text>

        <View style={styles.qrBox}>
          <QRCode
            value={`myapp://link?ref=${encodeURIComponent(qrRef)}`}
            size={240}
            color="#000"
            backgroundColor="#fff"
            ecl="M"
          />
          <Animated.View style={[styles.ring, { transform: [{ rotate: spin }] }]}>
            <Ionicons name="sync" size={32} color={theme.primary} />
          </Animated.View>
        </View>

        <View style={styles.info}>
          <Text style={[styles.timer, { color: theme.primary }]}>
            Expires in <Text style={styles.bold}>{timeLeft}s</Text>
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.refreshBtn, { backgroundColor: theme.primary }]}
          onPress={() => void generateRef()}
        >
          <Ionicons name="refresh" size={20} color="#fff" />
          <Text style={styles.refreshText}>New Code</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  title: { fontSize: 18, fontWeight: '700' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  subtitle: { fontSize: 15, textAlign: 'center', marginBottom: 28, lineHeight: 22 },
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
  timer: { fontSize: 16, textAlign: 'center' },
  bold: { fontWeight: 'bold' },
  refreshBtn: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 30,
    marginTop: 24,
    alignItems: 'center',
  },
  refreshText: { color: '#fff', marginLeft: 8, fontWeight: '600' },
  loading: { fontSize: 18, textAlign: 'center', marginTop: 80 },
});
