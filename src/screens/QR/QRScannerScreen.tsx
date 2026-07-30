// src/screens/QR/QRScannerScreen.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';

const isWeb = Platform.OS === 'web';

function parseLinkRef(raw: string): string | null {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    const ref = url.searchParams.get('ref');
    if (ref && (url.protocol === 'myapp:' || url.protocol === 'chatapp:')) {
      return ref;
    }
    if (ref && url.pathname.includes('link')) return ref;
  } catch {
    /* not a full URL — try query string */
  }

  const match = trimmed.match(/(?:^|[?&])ref=([^&]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function NativeQRScanner() {
  let CameraMod: typeof import('react-native-vision-camera');
  try {
    // Already linked in the app (Link Device previously tried missing expo-camera).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    CameraMod = require('react-native-vision-camera');
  } catch (err) {
    console.error('vision-camera load failed', err);
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <View style={styles.center}>
          <Ionicons name="camera-outline" size={80} color="#fff" />
          <Text style={styles.text}>Camera module unavailable</Text>
          <Text style={[styles.text, { fontSize: 14, color: '#ccc', marginTop: 10 }]}>
            Rebuild the app with the ChatReel development client to enable QR scanning.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return <VisionQRScanner CameraMod={CameraMod} />;
}

function VisionQRScanner({
  CameraMod,
}: {
  CameraMod: typeof import('react-native-vision-camera');
}) {
  const { Camera, useCameraDevice, useCameraPermission, useCodeScanner } = CameraMod;

  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [permissionAsked, setPermissionAsked] = useState(false);
  const linkingRef = useRef(false);

  useEffect(() => {
    if (hasPermission || permissionAsked) return;
    setPermissionAsked(true);
    void requestPermission();
  }, [hasPermission, permissionAsked, requestPermission]);

  const handleLink = useCallback(
    async (data: string) => {
      if (linkingRef.current || loading) return;
      linkingRef.current = true;
      setScanned(true);
      setLoading(true);

      try {
        if (!user?.id) throw new Error('You must be logged in');
        const ref = parseLinkRef(data);
        if (!ref) throw new Error('Invalid QR code. Scan a ChatReel link device code.');

        await api.qr.link(ref);

        Alert.alert('Success!', 'Device linked successfully', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Linking failed';
        Alert.alert('Error', message);
        setScanned(false);
        linkingRef.current = false;
      } finally {
        setLoading(false);
      }
    },
    [loading, navigation, user?.id]
  );

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: (codes) => {
      if (scanned || loading || linkingRef.current) return;
      const value = codes.find((c) => c.value)?.value;
      if (value) void handleLink(value);
    },
  });

  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <View style={styles.center}>
          <Ionicons name="camera-outline" size={80} color="#fff" />
          <Text style={styles.text}>Camera access required</Text>
          <Text style={[styles.text, { fontSize: 14, color: '#ccc', marginTop: 10 }]}>
            Allow camera permission to scan a link-device QR code.
          </Text>
          <TouchableOpacity style={styles.btn} onPress={() => void requestPermission()}>
            <Text style={styles.btnText}>Allow Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.btnOutline]}
            onPress={() => void Linking.openSettings()}
          >
            <Text style={[styles.btnText, { color: '#007AFF' }]}>Open Settings</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!device) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.text}>Looking for camera…</Text>
          <TouchableOpacity style={[styles.btn, { marginTop: 20 }]} onPress={() => navigation.goBack()}>
            <Text style={styles.btnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isFocused && !loading}
        codeScanner={scanned ? undefined : codeScanner}
        onError={(err) => {
          console.error('QR camera error:', err);
          Alert.alert('Camera', err.message || 'Camera failed to start');
        }}
      />

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
        <TouchableOpacity
          style={styles.btn}
          onPress={() => {
            linkingRef.current = false;
            setScanned(false);
          }}
        >
          <Text style={styles.btnText}>Scan Again</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

export default function QRScannerScreen() {
  const navigation = useNavigation<any>();

  if (isWeb) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <View style={styles.web}>
          <Ionicons name="phone-portrait" size={80} color="#007AFF" />
          <Text style={styles.webTitle}>Open on Mobile</Text>
          <Text style={styles.webText}>
            QR scanning is only available on the mobile app. On this device, show your QR
            code instead.
          </Text>
          <TouchableOpacity style={styles.btn} onPress={() => navigation.navigate('QRCode')}>
            <Text style={styles.btnText}>Show My QR Code</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return <NativeQRScanner />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  web: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  webTitle: { fontSize: 28, fontWeight: 'bold', color: '#007AFF', marginTop: 20 },
  webText: { fontSize: 16, color: '#ccc', marginTop: 10, textAlign: 'center' },
  header: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  title: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  frame: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 260,
    height: 260,
    marginLeft: -130,
    marginTop: -130,
    borderWidth: 2,
    borderColor: 'rgba(0,255,0,0.3)',
    backgroundColor: 'transparent',
  },
  corner: { position: 'absolute', width: 60, height: 60, borderColor: '#00ff00', borderWidth: 6 },
  tl: { top: -6, left: -6, borderRightWidth: 0, borderBottomWidth: 0 },
  tr: { top: -6, right: -6, borderLeftWidth: 0, borderBottomWidth: 0 },
  bl: { bottom: -6, left: -6, borderRightWidth: 0, borderTopWidth: 0 },
  br: { bottom: -6, right: -6, borderLeftWidth: 0, borderTopWidth: 0 },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  loadingText: { color: '#fff', marginTop: 16, fontSize: 18, fontWeight: '600' },
  footer: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  instruction: { color: '#fff', fontSize: 16, marginBottom: 20 },
  btn: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 30,
    marginTop: 12,
  },
  btnOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  text: { color: '#fff', marginTop: 20, fontSize: 16, textAlign: 'center' },
});
