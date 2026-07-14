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
import { setStringAsync as copyToClipboard } from '../../lib/clipboard';
import { Ionicons } from '@expo/vector-icons';
import { api, ApiError, type ReelDTO } from '../../lib/api';
import { downloadReelVideo } from '../../lib/downloadReel';
import { config } from '../../lib/config';
import { getReelGridThumbnail } from '../../lib/reelThumbnails';
import ShareReelToChatSheet from './ShareReelToChatSheet';
import {
  CaptionChoiceModal,
  captionChoiceToApi,
  type CaptionChoiceResult,
} from '../../components/CaptionChoiceModal';
import { showAppToast } from '../../lib/appToast';
import { showErrorAlert } from '../../lib/confirmAction';
import { startCallGuarded } from '../../lib/startCallGuarded';
import { navigateToOutgoingCall } from '../../navigation/rootNavigation';
import { useAuth } from '../../hooks/useAuth';

interface Props {
  reel: ReelDTO;
  onClose: () => void;
}

function buildShareUrl(reelId: string): string {
  // Deep link first; fall back to public web link if defined.
  const base =
    (config as unknown as { webBaseUrl?: string; deepLinkPrefix?: string }).webBaseUrl ||
    (config as unknown as { deepLinkPrefix?: string }).deepLinkPrefix ||
    'chatapp://';
  const sep = base.endsWith('/') ? '' : '/';
  return `${base}${sep}reel/${reelId}`;
}

export default function ReelShareSheet({ reel, onClose }: Props) {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [postingMoment, setPostingMoment] = useState(false);
  const [captionModalOpen, setCaptionModalOpen] = useState(false);
  const [calling, setCalling] = useState(false);
  const link = buildShareUrl(reel.id);
  const thumb = getReelGridThumbnail(reel);
  const shareMessage = reel.caption
    ? `${reel.caption}\n${link}`
    : `Check out this reel ${link}`;
  const authorAuthId = (reel.author as { user_id?: string } | null)?.user_id ?? null;
  const canCallAbout =
    !!authorAuthId && !!user?.id && authorAuthId !== user.id;

  const onCallAboutReel = async () => {
    if (!authorAuthId || calling) return;
    setCalling(true);
    try {
      const { call, live_kit } = await startCallGuarded({
        type: 'voice',
        callee_id: authorAuthId,
        metadata: { reel_id: reel.id, source: 'reel' },
      });
      onClose();
      navigateToOutgoingCall({
        call,
        token: live_kit.token,
        url: live_kit.url,
      });
    } catch (err) {
      showErrorAlert(
        'Call',
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Could not start call'
      );
    } finally {
      setCalling(false);
    }
  };

  const onSystemShare = async () => {
    try {
      await Share.share({
        message: shareMessage,
        url: Platform.OS === 'ios' ? link : undefined,
      });
      onClose();
    } catch {
      showErrorAlert('Share', 'Failed to open share sheet');
    }
  };

  const copyLink = async () => {
    try {
      await copyToClipboard(link);
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

  const onDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadReelVideo(reel);
      onClose();
    } catch {
      showErrorAlert('Download', 'Could not download this video.');
    } finally {
      setDownloading(false);
    }
  };

  const onAddToMoment = () => {
    setCaptionModalOpen(true);
  };

  const postToMoment = async (result: CaptionChoiceResult) => {
    setCaptionModalOpen(false);
    if (result.action === 'cancel' || postingMoment) return;
    const caption = captionChoiceToApi(result);
    if (caption === null) return;

    setPostingMoment(true);
    try {
      await api.moments.fromReel(
        reel.id,
        caption !== undefined ? { caption } : {}
      );
      showAppToast('Added to your moment');
      onClose();
    } catch (e) {
      const message = e instanceof ApiError ? e.message : 'Could not add to moment';
      showErrorAlert('Moment', message);
    } finally {
      setPostingMoment(false);
    }
  };

  const encoded = encodeURIComponent(shareMessage);

  if (chatOpen) {
    return (
      <ShareReelToChatSheet
        reel={reel}
        onClose={() => setChatOpen(false)}
        onSent={onClose}
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.handle} />
      <View style={styles.header}>
        <Text style={styles.title}>Share reel</Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.previewCard}>
          {thumb ? (
            <Image source={{ uri: thumb }} style={styles.previewImage} />
          ) : (
            <View style={[styles.previewImage, styles.previewPlaceholder]}>
              <Ionicons name="film-outline" size={32} color="#666" />
            </View>
          )}
          <View style={styles.previewBody}>
            <Text style={styles.previewTitle} numberOfLines={2}>
              {reel.caption?.trim() || 'Watch this reel on ChatReel'}
            </Text>
            <Text style={styles.previewSub} numberOfLines={1}>
              {link}
            </Text>
          </View>
        </View>

        <View style={styles.linkRow}>
          <Text style={styles.linkText} numberOfLines={1}>
            {link}
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

        {canCallAbout ? (
          <TouchableOpacity
            style={styles.shareButton}
            onPress={() => void onCallAboutReel()}
            disabled={calling}
          >
            <View style={[styles.iconCircle, { backgroundColor: '#059669' }]}>
              <Ionicons name={calling ? 'hourglass-outline' : 'call-outline'} size={28} color="#fff" />
            </View>
            <Text style={styles.label}>{calling ? 'Calling…' : 'Call about'}</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={styles.shareButton}
          onPress={onAddToMoment}
          disabled={postingMoment}
        >
          <View style={[styles.iconCircle, { backgroundColor: '#7c3aed' }]}>
            <Ionicons
              name={postingMoment ? 'hourglass-outline' : 'albums-outline'}
              size={28}
              color="#fff"
            />
          </View>
          <Text style={styles.label}>{postingMoment ? 'Posting…' : 'Moment'}</Text>
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
            `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`,
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

        <TouchableOpacity
          style={styles.shareButton}
          onPress={onDownload}
          disabled={downloading}
        >
          <View style={[styles.iconCircle, { backgroundColor: '#334155' }]}>
            <Ionicons name={downloading ? 'hourglass-outline' : 'download-outline'} size={28} color="#fff" />
          </View>
          <Text style={styles.label}>{downloading ? 'Saving…' : 'Download'}</Text>
        </TouchableOpacity>
        </View>
      </ScrollView>

      <CaptionChoiceModal
        visible={captionModalOpen}
        title="Caption for your moment"
        originalCaption={reel.caption}
        onClose={() => setCaptionModalOpen(false)}
        onConfirm={(result) => void postToMoment(result)}
      />
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20, paddingTop: 8, justifyContent: 'space-around' },
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
