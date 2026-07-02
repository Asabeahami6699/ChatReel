// src/screens/QR/QRScannerScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Platform,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';

const isWeb = Platform.OS === 'web';

export default function QRScannerScreen() {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [CameraView, setCameraView] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const navigation = useNavigation<any>();

  const initCamera = async () => {
    if (isWeb) return;

    try {
      setError(null);
      const { CameraView: ExpoCameraView } = await import('expo-camera');
      setCameraView(() => ExpoCameraView);

      const { status } = await ExpoCameraView.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
      if (status !== 'granted') {
        setError('Camera permission denied');
      }
    } catch (err: any) {
      console.error('Camera load error:', err);
      setError('Failed to load camera');
      setHasPermission(false);
    }
  };

  useEffect(() => {
    initCamera();
  }, []);

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (scanned || loading) return;
    setScanned(true);
    setLoading(true);

    try {
      if (!user?.id) throw new Error('You must be logged in');

      const url = new URL(data);
      const ref = url.searchParams.get('ref');
      if (!ref || !data.startsWith('myapp://link')) throw new Error('Invalid QR code');

      await api.qr.link(ref);

      Alert.alert('Success!', 'Device linked successfully', [
        { text: 'OK', onPress: () => navigation.replace('Chats') },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Linking failed');
      setScanned(false);
    } finally {
      setLoading(false);
    }
  };

  // Web fallback
  if (isWeb) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <View style={styles.web}>
          <Ionicons name="phone-portrait" size={80} color="#007AFF" />
          <Text style={styles.webTitle}>Open on Mobile</Text>
          <Text style={styles.webText}>QR scanning is only available on the mobile app</Text>
          <TouchableOpacity style={styles.btn} onPress={() => navigation.navigate('QRCode')}>
            <Text style={styles.btnText}>Show My QR Code</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (hasPermission === null) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.text}>Loading camera...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (hasPermission === false || error) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <View style={styles.center}>
          <Ionicons name="camera-outline" size={80} color="#fff" />
          <Text style={styles.text}>Camera access required</Text>
          <Text style={[styles.text, { fontSize: 14, color: '#ccc', marginTop: 10 }]}>
            {error || 'Please allow camera permission'}
          </Text>
          <TouchableOpacity style={styles.btn} onPress={() => Linking.openSettings()}>
            <Text style={styles.btnText}>Open Settings</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#007AFF', marginTop: 10 }]} onPress={initCamera}>
            <Text style={[styles.btnText, { color: '#007AFF' }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      {CameraView && (
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: ["qr"],
          }}
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        />
      )}

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={32} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Scan QR Code</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.frame}>
        <View style={[styles.corner, styles.tl]} />
        <View style={[styles.corner, styles.tr]} />
        <View style={[styles.corner, styles.bl]} />
        <View style={[styles.corner, styles.br]} />
      </View>

      {loading && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>Linking device...</Text>
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.instruction}>Align QR code within frame</Text>
        <TouchableOpacity style={styles.btn} onPress={() => setScanned(false)}>
          <Text style={styles.btnText}>Scan Again</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  web: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  webTitle: { fontSize: 28, fontWeight: 'bold', color: '#007AFF', marginTop: 20 },
  webText: { fontSize: 16, color: '#ccc', marginTop: 10, textAlign: 'center' },
  header: { position: 'absolute', top: 50, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  frame: { position: 'absolute', top: '50%', left: '50%', width: 260, height: 260, marginLeft: -130, marginTop: -130, borderWidth: 2, borderColor: 'rgba(0,255,0,0.3)', backgroundColor: 'transparent' },
  corner: { position: 'absolute', width: 60, height: 60, borderColor: '#00ff00', borderWidth: 6 },
  tl: { top: -6, left: -6, borderRightWidth: 0, borderBottomWidth: 0 },
  tr: { top: -6, right: -6, borderLeftWidth: 0, borderBottomWidth: 0 },
  bl: { bottom: -6, left: -6, borderRightWidth: 0, borderTopWidth: 0 },
  br: { bottom: -6, right: -6, borderLeftWidth: 0, borderTopWidth: 0 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', zIndex: 20 },
  loadingText: { color: '#fff', marginTop: 16, fontSize: 18, fontWeight: '600' },
  footer: { position: 'absolute', bottom: 80, left: 0, right: 0, alignItems: 'center', zIndex: 10 },
  instruction: { color: '#fff', fontSize: 16, marginBottom: 20 },
  btn: { backgroundColor: '#007AFF', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 30 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  text: { color: '#fff', marginTop: 20, fontSize: 16, textAlign: 'center' },
});