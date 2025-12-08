// src/screens/QR/QRCodeScreen.tsx
import React, { useState, useEffect, useRef } from 'react';
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
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useNavigation } from '@react-navigation/native';

export default function QRCodeScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const [qrRef, setQrRef] = useState('');
  const [timeLeft, setTimeLeft] = useState(30);

  // FIXED: Keep full ref
  const spinRef = useRef(new Animated.Value(0)).current;
  const spin = spinRef.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const generateRef = async () => {
    if (!user) return;
    const ref = `${user.id}_${Date.now()}`;
    const { error } = await supabase
      .from('qr_sessions')
      .insert({
        user_id: user.id,
        ref,
        expires_at: new Date(Date.now() + 30 * 1000).toISOString(),
      });
    if (error) {
      Alert.alert('Error', 'Failed to generate QR');
      return;
    }
    setQrRef(ref);
    setTimeLeft(30);
  };

  // Auto refresh
  useEffect(() => {
    generateRef();
    const id = setInterval(generateRef, 30000);
    return () => clearInterval(id);
  }, [user]);

  // Countdown
  useEffect(() => {
    const id = setInterval(() => {
      setTimeLeft(t => t > 0 ? t - 1 : 0);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // FIXED: Animate the ref, not .current
  useEffect(() => {
    Animated.loop(
      Animated.timing(spinRef, {
        toValue: 1,
        duration: 3000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, [spinRef]);

  if (!qrRef) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.loading}>Generating QR...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={28} color="#000" />
        </TouchableOpacity>
        <Text style={styles.title}>Link a Device</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.subtitle}>Scan with your phone</Text>

        <View style={styles.qrBox}>
          <QRCode
            value={`myapp://link?ref=${qrRef}`}
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
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9f9f9' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: { fontSize: 20, fontWeight: 'bold' },
  content: { flex: 1, alignItems: 'center', padding: 24 },
  subtitle: { fontSize: 18, fontWeight: '600', marginBottom: 24, color: '#333' },
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
  timer: { fontSize: 16, color: '#007AFF' },
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
  loading: { flex: 1, textAlign: 'center', paddingTop: 100, fontSize: 18 },
});