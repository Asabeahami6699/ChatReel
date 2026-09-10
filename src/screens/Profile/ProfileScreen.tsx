import React, { useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
  Image,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardSafeScreen } from '../../components/KeyboardSafeScreen';
import { KeyboardStickyFooter } from '../../components/KeyboardStickyFooter';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import * as ImagePicker from 'expo-image-picker';
import { api } from '../../lib/api';
import { uploadBase64 } from '../../lib/uploads';
import { useAuth } from '../../hooks/useAuth';
import { useRealtimeTopic } from '../../hooks/useRealtimeTopic';
import { Ionicons } from '@expo/vector-icons';
import { USE_NATIVE_DRIVER } from '../../lib/animation';
import { FormSelectField } from '../../components/FormSelectField';
import {
  COUNTRY_OPTIONS,
  LANGUAGE_OPTIONS,
  normalizeCountryValue,
  normalizeLanguageValue,
  optionsWithCurrentValue,
} from '../../lib/profileLocaleOptions';
import { useChatSettings } from '../../context/ChatSettingsContext';
import { useHeaderChrome } from '../../context/AppChromeContext';
import { getCachedProfile, setCachedProfile, patchCachedProfile, hydrateProfileCache, prefetchMyProfile } from '../../lib/profileCache';

// === Schema ===
const profileSchema = z.object({
  display_name: z.string().min(1, 'Display name is required'),
  email: z.string().email('Invalid email'),
  avatar_url: z.string().url().optional().or(z.literal('')),
  bio: z.string().optional(),
  country: z.string().optional(),
  region: z.string().optional(),
  language: z.string().optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

// === Avatar with Gradient Border ===
const AvatarPreview = ({
  uri,
  onPress,
  loading,
}: {
  uri?: string;
  onPress: () => void;
  loading: boolean;
}) => {
  const { theme } = useChatSettings();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const pulse = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 1.1, duration: 300, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 300, useNativeDriver: USE_NATIVE_DRIVER }),
    ]).start();
  };

  return (
    <View style={styles.avatarContainer}>
      <TouchableOpacity onPress={onPress} disabled={loading} activeOpacity={0.8}>
        <Animated.View style={[styles.avatarWrapper, { transform: [{ scale: scaleAnim }] }]}>
          <View style={[styles.gradientBorder, { backgroundColor: theme.listCardBg, borderColor: theme.primary }]}>
            {uri ? (
              <Image source={{ uri }} style={styles.avatar} resizeMode="cover" />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: theme.inputFieldBg }]}>
                <Ionicons name="person" size={36} color={theme.listSecondaryText} />
              </View>
            )}
          </View>
        </Animated.View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.changeAvatarBtn,
          { backgroundColor: theme.searchBg, borderColor: theme.listBorder },
          loading && styles.disabledBtn,
        ]}
        onPress={() => {
          pulse();
          onPress();
        }}
        disabled={loading}
      >
        <Text
          style={[
            styles.changeAvatarText,
            { color: theme.primary },
            loading && styles.disabledText,
          ]}
        >
          {loading ? 'Uploading...' : 'Change photo'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const StatusPulseDot = () => {
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  const scale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 2.2],
  });
  const opacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 0],
  });

  return (
    <Animated.View
      style={[styles.pulseDot, { transform: [{ scale }], opacity }]}
      pointerEvents="none"
    />
  );
};

// === Main Screen ===
const ProfileScreen = ({ navigation }: { navigation: any }) => {
  const { user } = useAuth();
  const { theme } = useChatSettings();
  useHeaderChrome(theme.headerBg);
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(() => !getCachedProfile());
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [currentAppStatus, setCurrentAppStatus] = useState<'Online' | 'Offline'>('Offline');
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [countryOptions, setCountryOptions] = useState(COUNTRY_OPTIONS);
  const [languageOptions, setLanguageOptions] = useState(LANGUAGE_OPTIONS);

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      display_name: '',
      email: '',
      avatar_url: '',
      bio: '',
      country: '',
      region: '',
      language: '',
    },
  });

  const loadProfile = useCallback(async () => {
    try {
      if (!user?.id) throw new Error('Not authenticated');

      setUserId(user.id);

      await hydrateProfileCache();
      // Instant fill from Settings (or prior visit) while network refresh runs.
      const cached = getCachedProfile();
      if (cached) {
        const country = normalizeCountryValue(cached.country);
        const language = normalizeLanguageValue(cached.language);
        reset({
          display_name: cached.display_name || '',
          email: cached.email || user.email || '',
          avatar_url: cached.avatar_url || '',
          bio: cached.bio || '',
          country,
          region: cached.region || '',
          language,
        });
        setCountryOptions(optionsWithCurrentValue(COUNTRY_OPTIONS, country));
        setLanguageOptions(optionsWithCurrentValue(LANGUAGE_OPTIONS, language));
        setAvatarUrl(cached.avatar_url || '');
        setCurrentAppStatus(cached.status === 'Online' ? 'Online' : 'Offline');
        setLoading(false);
      }

      const refreshed = await prefetchMyProfile(user.email);
      const profile = refreshed ?? {
        display_name: undefined,
        email: user.email || undefined,
        avatar_url: undefined,
        bio: undefined,
        country: undefined,
        region: undefined,
        language: undefined,
        status: undefined as string | undefined,
        fetchedAt: 0,
      };
      const country = normalizeCountryValue(profile.country);
      const language = normalizeLanguageValue(profile.language);
      const formData = {
        display_name: profile.display_name || '',
        email: profile.email || user.email || '',
        avatar_url: profile.avatar_url || '',
        bio: profile.bio || '',
        country,
        region: profile.region || '',
        language,
      };

      setCachedProfile({
        display_name: formData.display_name,
        email: formData.email,
        avatar_url: formData.avatar_url,
        bio: formData.bio,
        country: formData.country,
        region: formData.region,
        language: formData.language,
        status: refreshed?.status === 'Online' ? 'Online' : 'Offline',
      });

      setCountryOptions(optionsWithCurrentValue(COUNTRY_OPTIONS, country));
      setLanguageOptions(optionsWithCurrentValue(LANGUAGE_OPTIONS, language));
      reset(formData);
      setAvatarUrl(formData.avatar_url);
      setCurrentAppStatus(refreshed?.status === 'Online' ? 'Online' : 'Offline');
    } catch (err: any) {
      if (!getCachedProfile()) {
        Alert.alert('Error', err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [reset, user?.id, user?.email]);

  useLayoutEffect(() => {
    const cached = getCachedProfile();
    if (!cached || !user?.id) return;
    setUserId(user.id);
    const country = normalizeCountryValue(cached.country);
    const language = normalizeLanguageValue(cached.language);
    reset({
      display_name: cached.display_name || '',
      email: cached.email || user.email || '',
      avatar_url: cached.avatar_url || '',
      bio: cached.bio || '',
      country,
      region: cached.region || '',
      language,
    });
    setCountryOptions(optionsWithCurrentValue(COUNTRY_OPTIONS, country));
    setLanguageOptions(optionsWithCurrentValue(LANGUAGE_OPTIONS, language));
    setAvatarUrl(cached.avatar_url || '');
    setCurrentAppStatus(cached.status === 'Online' ? 'Online' : 'Offline');
    setLoading(false);
  }, [reset, user?.id, user?.email]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useRealtimeTopic(user?.id ? 'profiles' : null, loadProfile);

  // Presence is synced globally via PresenceSyncRegistrar in App.tsx.
  const onSubmit = async (data: ProfileFormData) => {
    if (!userId) return;
    setSaving(true);

    try {
      await api.profiles.updateMe({
        display_name: data.display_name,
        email: data.email,
        avatar_url: data.avatar_url || '',
        bio: data.bio || '',
        country: data.country || '',
        region: data.region || '',
        language: data.language || '',
      });
      patchCachedProfile({
        display_name: data.display_name,
        email: data.email,
        avatar_url: data.avatar_url || '',
        bio: data.bio || '',
        country: data.country || '',
        region: data.region || '',
        language: data.language || '',
      });
      Alert.alert('Success', 'Profile saved!');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  // === Avatar Upload ===
  const uploadAvatar = useCallback(async () => {
    if (!userId) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Allow photo access.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true,
    });

    if (result.canceled || !result.assets[0].base64) return;

    const base64 = result.assets[0].base64;
    const rawExt = result.assets[0].uri.split('.').pop()?.toLowerCase() || 'jpg';
    const fileExt = rawExt === 'jpg' || rawExt === 'jpeg' ? 'jpg' : rawExt === 'png' ? 'png' : 'jpg';
    const storagePath = `${userId}/avatar.${fileExt}`;

    setUploadingAvatar(true);
    setAvatarUrl(result.assets[0].uri);

    try {
      const publicUrl = await uploadBase64({
        bucket: 'avatars',
        path: storagePath,
        contentBase64: base64,
        contentType: `image/${fileExt === 'png' ? 'png' : 'jpeg'}`,
      });
      const url = `${publicUrl}?t=${Date.now()}`;

      setAvatarUrl(url);
      setValue('avatar_url', url);
      patchCachedProfile({ avatar_url: url });

      Alert.alert('Success', 'Avatar updated!');
    } catch (err: any) {
      Alert.alert('Upload failed', err.message);
    } finally {
      setUploadingAvatar(false);
    }
  }, [userId, setValue]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.listBg }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.listBg }}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.headerBg,
            marginTop: -insets.top,
            paddingTop: insets.top + 8,
          },
        ]}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={theme.headerText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.headerText }]}>Edit Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardSafeScreen contentContainerStyle={styles.scrollContainer} bottomOffset={100}>
        <View style={styles.hero}>
          <AvatarPreview uri={avatarUrl} onPress={uploadAvatar} loading={uploadingAvatar} />
          <Text style={[styles.heroHint, { color: theme.listSecondaryText }]}>
            This is how you appear in chats and reels
          </Text>
        </View>

        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.listCardBg,
              borderColor: theme.listBorder,
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: theme.listSecondaryText }]}>About you</Text>
          <FormField
            label="Display Name"
            control={control}
            name="display_name"
            error={errors.display_name}
            placeholder="Your name"
            labelColor={theme.listPrimaryText}
            inputBg={theme.inputFieldBg}
            inputColor={theme.listPrimaryText}
            borderColor={theme.listBorder}
            placeholderColor={theme.searchPlaceholder}
            accent={theme.primary}
          />
          <FormField
            label="Email"
            control={control}
            name="email"
            error={errors.email}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            labelColor={theme.listPrimaryText}
            inputBg={theme.inputFieldBg}
            inputColor={theme.listPrimaryText}
            borderColor={theme.listBorder}
            placeholderColor={theme.searchPlaceholder}
            accent={theme.primary}
          />
          <FormField
            label="Bio"
            control={control}
            name="bio"
            error={errors.bio}
            placeholder="A short line about you"
            multiline
            labelColor={theme.listPrimaryText}
            inputBg={theme.inputFieldBg}
            inputColor={theme.listPrimaryText}
            borderColor={theme.listBorder}
            placeholderColor={theme.searchPlaceholder}
            accent={theme.primary}
          />
        </View>

        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.listCardBg,
              borderColor: theme.listBorder,
              marginTop: 14,
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: theme.listSecondaryText }]}>Location</Text>
          <FormSelectField
            label="Country"
            control={control}
            name="country"
            options={countryOptions}
            placeholder="Select country"
            error={errors.country}
          />
          <FormField
            label="Region"
            control={control}
            name="region"
            error={errors.region}
            placeholder="State or region"
            labelColor={theme.listPrimaryText}
            inputBg={theme.inputFieldBg}
            inputColor={theme.listPrimaryText}
            borderColor={theme.listBorder}
            placeholderColor={theme.searchPlaceholder}
            accent={theme.primary}
          />
          <FormSelectField
            label="Language"
            control={control}
            name="language"
            options={languageOptions}
            placeholder="Select language"
            error={errors.language}
          />

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.listPrimaryText }]}>Status</Text>
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor: theme.isDark ? theme.inputFieldBg : theme.searchBg,
                  borderColor: theme.listBorder,
                },
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  currentAppStatus === 'Online' ? styles.onlineDot : styles.offlineDot,
                ]}
              />
              <Text style={[styles.statusBadgeText, { color: theme.listPrimaryText }]}>
                {currentAppStatus}
              </Text>
              {currentAppStatus === 'Online' && <StatusPulseDot />}
            </View>
          </View>
        </View>
      </KeyboardSafeScreen>

      <KeyboardStickyFooter>
        <View
          style={[
            styles.floatingButtonContainer,
            { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.saveBtn,
              { backgroundColor: theme.primary },
              saving && styles.saveBtnDisabled,
            ]}
            onPress={handleSubmit(onSubmit)}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark" size={20} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.saveBtnText}>Save Changes</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardStickyFooter>
    </View>
  );
};

// === Reusable Input ===
const FormField = ({
  label,
  control,
  name,
  error,
  labelColor,
  inputBg,
  inputColor,
  borderColor,
  placeholderColor,
  accent,
  ...props
}: {
  label: string;
  control: any;
  name: keyof ProfileFormData;
  error?: any;
  labelColor?: string;
  inputBg?: string;
  inputColor?: string;
  borderColor?: string;
  placeholderColor?: string;
  accent?: string;
  [key: string]: any;
}) => {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.field}>
      <Text style={[styles.label, labelColor ? { color: labelColor } : null]}>{label}</Text>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <TextInput
            {...props}
            placeholderTextColor={placeholderColor || '#999'}
            underlineColorAndroid="transparent"
            style={[
              styles.input,
              inputBg ? { backgroundColor: inputBg } : null,
              inputColor ? { color: inputColor } : null,
              borderColor ? { borderColor } : null,
              error && styles.inputError,
              focused && accent ? { borderColor: accent } : null,
              props.multiline ? styles.inputMultiline : null,
            ]}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={() => {
              field.onBlur();
              setFocused(false);
            }}
            onFocus={() => setFocused(true)}
          />
        )}
      />
      {error && <Text style={styles.errorText}>{error.message}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 14,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  scrollContainer: {
    padding: 16,
    paddingBottom: 120,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 8,
    paddingTop: 8,
  },
  heroHint: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  card: {
    borderRadius: 16,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  avatarContainer: { alignItems: 'center', marginBottom: 8 },
  avatarWrapper: {
    position: 'relative',
  },
  gradientBorder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    padding: 3,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  avatarPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  changeAvatarBtn: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  changeAvatarText: {
    fontWeight: '600',
    fontSize: 14,
  },
  disabledBtn: { opacity: 0.6 },
  disabledText: { opacity: 0.7 },
  field: { marginBottom: 16 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    fontSize: 16,
    minHeight: 48,
  },
  inputMultiline: {
    minHeight: 96,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  inputError: {
    borderColor: '#d32f2f',
  },
  errorText: {
    color: '#d32f2f',
    fontSize: 12,
    marginTop: 6,
    fontWeight: '500',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    position: 'relative',
    overflow: 'hidden',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  onlineDot: {
    backgroundColor: '#4CAF50',
  },
  offlineDot: {
    backgroundColor: '#999',
  },
  pulseDot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4CAF50',
    left: 14,
  },
  statusBadgeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  floatingButtonContainer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    alignItems: 'center',
  },
  saveBtn: {
    flexDirection: 'row',
    paddingVertical: 15,
    paddingHorizontal: 28,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 200,
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});

export default ProfileScreen;