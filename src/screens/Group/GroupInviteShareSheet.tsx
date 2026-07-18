import React, { useState } from 'react';
import {
  Image,
  Linking,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { setStringAsync as copyToClipboard } from '../../lib/clipboard';
import { showErrorAlert } from '../../lib/confirmAction';
import ShareInviteToChatSheet from './ShareInviteToChatSheet';

type Props = {
  groupName: string;
  inviteLink: string;
  avatarUrl?: string | null;
  onClose: () => void;
};

export default function GroupInviteShareSheet({
  groupName,
  inviteLink,
  avatarUrl,
  onClose,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const shareMessage = `Join my group "${groupName}"\n${inviteLink}`;
  const encoded = encodeURIComponent(shareMessage);

  const onSystemShare = async () => {
    try {
      await Share.share({
        message: shareMessage,
        url: Platform.OS === 'ios' ? inviteLink : undefined,
      });
      onClose();
    } catch {
      showErrorAlert('Share', 'Failed to open share sheet');
    }
  };

  const copyLink = async () => {
    try {
      await copyToClipboard(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      showErrorAlert('Copy', 'Failed to copy link');
    }
  };

  const openExternal = (url: string, label: string) => async () => {
    const canOpen = await Linking.canOpenURL(url).catch(() => false);
    if (!canOpen) {
      showErrorAlert(label, `${label} is not installed.`);
      return;
    }
    Linking.openURL(url);
    onClose();
  };

  if (chatOpen) {
    return (
      <ShareInviteToChatSheet
        inviteLink={inviteLink}
        groupName={groupName}
        onClose={() => setChatOpen(false)}
        onSent={onClose}
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.handle} />
      <View style={styles.header}>
        <Text style={styles.title}>Share group invite</Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.previewCard}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.previewImage} />
          ) : (
            <View style={[styles.previewImage, styles.previewPlaceholder]}>
              <Ionicons name="people-outline" size={32} color="#666" />
            </View>
          )}
          <View style={styles.previewBody}>
            <Text style={styles.previewTitle} numberOfLines={2}>
              {groupName}
            </Text>
            <Text style={styles.previewSub} numberOfLines={1}>
              {inviteLink}
            </Text>
          </View>
        </View>

        <View style={styles.linkRow}>
          <Text style={styles.linkText} numberOfLines={1}>
            {inviteLink}
          </Text>
          <TouchableOpacity onPress={copyLink} style={styles.copyButton}>
            <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={18} color="#fff" />
            <Text style={styles.copyText}>{copied ? 'Copied' : 'Copy'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>Share to</Text>
        <View style={styles.grid}>
          <TouchableOpacity style={styles.shareButton} onPress={() => setChatOpen(true)}>
            <View style={[styles.iconCircle, { backgroundColor: '#0ea5e9' }]}>
              <Ionicons name="chatbubble-outline" size={28} color="#fff" />
            </View>
            <Text style={styles.label}>Send to chat</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.shareButton}
            onPress={openExternal(`whatsapp://send?text=${encoded}`, 'WhatsApp')}
          >
            <View style={[styles.iconCircle, { backgroundColor: '#25D366' }]}>
              <Ionicons name="logo-whatsapp" size={28} color="#fff" />
            </View>
            <Text style={styles.label}>WhatsApp</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.shareButton}
            onPress={openExternal(
              `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(inviteLink)}`,
              'Facebook'
            )}
          >
            <View style={[styles.iconCircle, { backgroundColor: '#1877F2' }]}>
              <Ionicons name="logo-facebook" size={28} color="#fff" />
            </View>
            <Text style={styles.label}>Facebook</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.shareButton}
            onPress={openExternal(
              `https://twitter.com/intent/tweet?text=${encoded}`,
              'Twitter / X'
            )}
          >
            <View style={[styles.iconCircle, { backgroundColor: '#000' }]}>
              <Ionicons name="logo-twitter" size={28} color="#fff" />
            </View>
            <Text style={styles.label}>X / Twitter</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.shareButton} onPress={onSystemShare}>
            <View style={[styles.iconCircle, { backgroundColor: '#1976d2' }]}>
              <Ionicons name="share-social" size={28} color="#fff" />
            </View>
            <Text style={styles.label}>More</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  scrollContent: { paddingBottom: 24 },
  previewCard: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  previewImage: { width: 88, height: 110, backgroundColor: '#222' },
  previewPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  previewBody: { flex: 1, padding: 12, justifyContent: 'center' },
  previewTitle: { color: '#fff', fontWeight: '700', fontSize: 14, lineHeight: 20 },
  previewSub: { color: '#888', fontSize: 11, marginTop: 6 },
  sectionLabel: {
    color: '#888',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 4,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#444',
    alignSelf: 'center',
    marginTop: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 0.5,
    borderColor: '#333',
  },
  title: { color: '#fff', fontSize: 18, fontWeight: '600' },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#181818',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
  },
  linkText: { flex: 1, color: '#ddd', marginRight: 12 },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1976d2',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    gap: 4,
  },
  copyText: { color: '#fff', fontWeight: '600', marginLeft: 4 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    paddingTop: 8,
    justifyContent: 'space-around',
  },
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
