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
import * as ImagePicker from 'expo-image-picker';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { withPrivacyLockPause } from '../../lib/privacyLockPause';

const isWeb = Platform.OS === 'web';

/** Prefer a stable read: same payload seen this many times before linking. */
const STABLE_HITS = 3;

function parseLinkRef(raw: string): string | null {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;

  // Bare ref payload (some generators encode only the token).
  if (/^[0-9a-f-]{8,}_[0-9]+[_a-z0-9]*$/i.test(trimmed) && !trimmed.includes('://')) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const ref = url.searchParams.get('ref');
    if (ref) return decodeURIComponent(ref);
  } catch {
    /* not a full URL */
  }

  const match = trimmed.match(/(?:^|[?&#/])ref=([^&\s#]+)/i);
  if (match?.[1]) return decodeURIComponent(match[1]);

  // Last resort: whole string looks like our session ref.
  if (trimmed.includes('_') && trimmed.length >= 20 && !/\s/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

function NativeQRScanner() {
  let CameraMod: typeof import('react-native-vision-camera');
  try {
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
  const [lockHint, setLockHint] = useState('Align the QR code in the frame');
  const [permissionAsked, setPermissionAsked] = useState(false);
  const linkingRef = useRef(false);
  const pendingRef = useRef<{ value: string; hits: number } | null>(null);

  useEffect(() => {
    if (hasPermission || permissionAsked) return;
    setPermissionAsked(true);
    void requestPermission();
  }, [hasPermission, permissionAsked, requestPermission]);

  const completeLink = useCallback(
    async (data: string) => {
      if (linkingRef.current || loading) return;
      linkingRef.current = true;
      setScanned(true);
      setLoading(true);
      setLockHint('Checking QR…');

      try {
        if (!user?.id) throw new Error('You must be logged in');
        const ref = parseLinkRef(data);
        if (!ref) throw new Error('Invalid QR code. Scan a ChatReel link-device code.');

        // Validate before linking so we never stick on a stale/expired code silently.
        try {
          await api.qr.getSession(ref);
        } catch (err) {
          if (err instanceof ApiError) {
            if (err.status === 410) throw new Error('QR code expired. Ask for a new code.');
            if (err.status === 404) throw new Error('Invalid QR code. Generate a new one and try again.');
          }
          throw err;
        }

        setLockHint('Linking device…');
        await api.qr.link(ref);

        Alert.alert('Success!', 'Device linked successfully', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Linking failed';
        Alert.alert('Could not link', message);
        setScanned(false);
        linkingRef.current = false;
        pendingRef.current = null;
        setLockHint('Align the QR code in the frame');
      } finally {
        setLoading(false);
      }
    },
    [loading, navigation, user?.id]
  );

  const onRawCode = useCallback(
    (value: string) => {
      if (scanned || loading || linkingRef.current) return;
      const ref = parseLinkRef(value);
      if (!ref) {
        setLockHint('Unrecognized code — use a ChatReel link QR');
        return;
      }

      const pending = pendingRef.current;
      if (!pending || pending.value !== value) {
        pendingRef.current = { value, hits: 1 };
        setLockHint('Hold steady… locking onto QR');
        return;
      }
      pending.hits += 1;
      if (pending.hits < STABLE_HITS) {
        setLockHint(`Hold steady… ${pending.hits}/${STABLE_HITS}`);
        return;
      }
      // Stable read — proceed.
      void completeLink(value);
    },
    [completeLink, loading, scanned]
  );

  const pickFromGallery = useCallback(async () => {
    if (loading || linkingRef.current) return;
    const result = await withPrivacyLockPause(() =>
      ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
        allowsEditing: false,
        exif: false,
      })
    );
    if (result.canceled || !result.assets?.[0]?.uri) return;

    // Vision Camera can't decode stills here — guide the user to the live scanner
    // but keep the image picker entry for future ML-kit builds. For now try to
    // read a ChatReel deep link if the asset name/uri somehow embeds it (rare),
    // otherwise show a clear tip.
    Alert.alert(
      'Scan with camera',
      'For the most reliable link, point your camera at the QR and hold steady until it locks. Make sure the code on the other device is still valid (under 3 minutes).',
      [{ text: 'OK' }]
    );
  }, [loading]);

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: (codes) => {
      if (scanned || loading || linkingRef.current) return;
      // Prefer the largest / first QR with a value.
      const value = codes.map((c) => c.value).find((v): v is string => Boolean(v));
      if (value) onRawCode(value);
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
        <TouchableOpacity onPress={() => void pickFromGallery()} hitSlop={10}>
          <Ionicons name="images-outline" size={26} color="#fff" />
        </TouchableOpacity>
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
          <Text style={styles.loadingText}>{lockHint}</Text>
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.instruction}>{lockHint}</Text>
        <TouchableOpacity
          style={styles.btn}
          onPress={() => {
            linkingRef.current = false;
            pendingRef.current = null;
            setScanned(false);
            setLockHint('Align the QR code in the frame');
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
    width: 280,
    height: 280,
    marginLeft: -140,
    marginTop: -140,
    borderWidth: 2,
    borderColor: 'rgba(0,255,0,0.35)',
    backgroundColor: 'transparent',
  },
  corner: { position: 'absolute', width: 60, height: 60, borderColor: '#00ff00', borderWidth: 6 },
  tl: { top: -6, left: -6, borderRightWidth: 0, borderBottomWidth: 0 },
  tr: { top: -6, right: -6, borderLeftWidth: 0, borderBottomWidth: 0 },
  bl: { bottom: -6, left: -6, borderRightWidth: 0, borderTopWidth: 0 },
  br: { bottom: -6, right: -6, borderLeftWidth: 0, borderTopWidth: 0 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
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
  instruction: { color: '#fff', fontSize: 16, marginBottom: 20, textAlign: 'center', paddingHorizontal: 24 },
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
