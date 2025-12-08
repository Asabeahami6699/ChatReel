// D:\chatApp\chatApp\src\screens\Reel\ReelShareSheet.tsx
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Share,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ReelShareSheetProps {
  reelId: string;
  onClose: () => void;
}

export default function ReelShareSheet({ onClose }: ReelShareSheetProps) {
  const shareUrl = `https://myapp.com/reel/123`;

  const onShare = async () => {
    try {
      await Share.share({
        message: `Check out this reel! ${shareUrl}`,
        url: shareUrl,
      });
      onClose();
    } catch (error) {
      Alert.alert('Error', 'Failed to share');
    }
  };

  const copyLink = () => {
    // In real app: Clipboard.setString(shareUrl)
    Alert.alert('Copied!', 'Link copied to clipboard');
    onClose();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Share</Text>
        <TouchableOpacity onPress={onClose}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.grid}>
        <TouchableOpacity style={styles.shareButton} onPress={onShare}>
          <View style={[styles.iconCircle, { backgroundColor: '#25D366' }]}>
            <Ionicons name="logo-whatsapp" size={28} color="#fff" />
          </View>
          <Text style={styles.label}>WhatsApp</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.shareButton} onPress={onShare}>
          <View style={[styles.iconCircle, { backgroundColor: '#1877F2' }]}>
            <Ionicons name="logo-facebook" size={28} color="#fff" />
          </View>
          <Text style={styles.label}>Facebook</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.shareButton} onPress={onShare}>
          <View style={[styles.iconCircle, { backgroundColor: '#1DA1F2' }]}>
            <Ionicons name="logo-twitter" size={28} color="#fff" />
          </View>
          <Text style={styles.label}>Twitter</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.shareButton} onPress={copyLink}>
          <View style={[styles.iconCircle, { backgroundColor: '#888' }]}>
            <Ionicons name="link" size={28} color="#fff" />
          </View>
          <Text style={styles.label}>Copy Link</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#111', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 0.5,
    borderColor: '#333',
  },
  title: { color: '#fff', fontSize: 18, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 20, justifyContent: 'space-around' },
  shareButton: { alignItems: 'center', width: '25%', marginBottom: 20 },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: { color: '#fff', fontSize: 12 },
});