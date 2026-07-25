import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChatSettings } from '../context/ChatSettingsContext';
import {
  isWallpaperImageUri,
  WALLPAPER_OPTIONS,
} from '../screens/Chat/chatMessageUtils';
import { showAppToast } from '../lib/appToast';

type Props = {
  visible: boolean;
  selectedId: string | null;
  onClose: () => void;
  onSelect: (wallpaperId: string | null) => void;
};

/** Visual wallpaper picker — color swatches + custom photo. */
export function WallpaperPickerSheet({ visible, selectedId, onClose, onSelect }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useChatSettings();
  const [picking, setPicking] = useState(false);

  const imageSelected = isWallpaperImageUri(selectedId);
  const current = imageSelected ? 'photo' : selectedId ?? 'default';

  const pickPhoto = async () => {
    try {
      setPicking(true);
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        showAppToast('Photo access is required for wallpapers', { isError: true });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [9, 16],
        quality: 0.85,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      onSelect(result.assets[0].uri);
      onClose();
    } catch {
      showAppToast('Could not open photo library', { isError: true });
    } finally {
      setPicking(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Dismiss" />
        <View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, 16) + 8,
              backgroundColor: theme.listCardBg,
              borderColor: theme.listBorder,
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: theme.listBorder }]} />
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.listPrimaryText }]}>Chat wallpaper</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={theme.listSecondaryText} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.subtitle, { color: theme.listSecondaryText }]}>
            Pick a color or add your own photo
          </Text>

          <TouchableOpacity
            style={[
              styles.photoRow,
              {
                backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                borderColor: imageSelected ? theme.primary : theme.listBorder,
              },
            ]}
            activeOpacity={0.85}
            disabled={picking}
            onPress={() => void pickPhoto()}
          >
            <View
              style={[
                styles.photoPreview,
                { backgroundColor: theme.chatBg, borderColor: theme.listBorder },
              ]}
            >
              {imageSelected && selectedId ? (
                <Image source={{ uri: selectedId }} style={styles.photoImage} />
              ) : (
                <Ionicons name="image-outline" size={22} color={theme.listSecondaryText} />
              )}
            </View>
            <View style={styles.photoTextWrap}>
              <Text style={[styles.photoTitle, { color: theme.listPrimaryText }]}>
                {imageSelected ? 'Change photo' : 'Add photo'}
              </Text>
              <Text style={[styles.photoSub, { color: theme.listSecondaryText }]}>
                Use a picture from your gallery
              </Text>
            </View>
            {picking ? (
              <ActivityIndicator color={theme.primary} />
            ) : (
              <Ionicons name="chevron-forward" size={18} color={theme.listSecondaryText} />
            )}
          </TouchableOpacity>

          <ScrollView
            horizontal={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.grid}
            keyboardShouldPersistTaps="handled"
          >
            {WALLPAPER_OPTIONS.map((opt) => {
              const active = current === opt.id;
              const previewColor = opt.id === 'default' ? theme.chatBg : opt.color;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={styles.cell}
                  activeOpacity={0.85}
                  onPress={() => {
                    onSelect(opt.id === 'default' ? null : opt.id);
                    onClose();
                  }}
                >
                  <View
                    style={[
                      styles.swatch,
                      {
                        backgroundColor: previewColor,
                        borderColor: active ? theme.primary : theme.listBorder,
                        borderWidth: active ? 3 : 1,
                      },
                    ]}
                  >
                    {opt.id === 'default' ? (
                      <Ionicons
                        name="phone-portrait-outline"
                        size={22}
                        color={theme.listSecondaryText}
                      />
                    ) : null}
                    {active ? (
                      <View style={[styles.check, { backgroundColor: theme.primary }]}>
                        <Ionicons name="checkmark" size={14} color="#fff" />
                      </View>
                    ) : null}
                  </View>
                  <Text
                    style={[
                      styles.label,
                      { color: active ? theme.primary : theme.listPrimaryText },
                    ]}
                    numberOfLines={1}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    paddingHorizontal: 16,
    maxHeight: '78%',
    zIndex: 2,
    elevation: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: { fontSize: 18, fontWeight: '800' },
  subtitle: { fontSize: 13, marginBottom: 14 },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 16,
  },
  photoPreview: {
    width: 52,
    height: 52,
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  photoImage: { width: '100%', height: '100%' },
  photoTextWrap: { flex: 1, minWidth: 0 },
  photoTitle: { fontSize: 15, fontWeight: '700' },
  photoSub: { fontSize: 12, marginTop: 2 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingBottom: 8,
  },
  cell: {
    width: '22%',
    minWidth: 72,
    alignItems: 'center',
    gap: 6,
  },
  swatch: {
    width: 64,
    height: 64,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  check: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 12, fontWeight: '600' },
});
