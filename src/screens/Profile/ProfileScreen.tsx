import React, { useEffect, useRef, useState, useCallback } from 'react';
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
  KeyboardAvoidingView,
  Platform,
  AppState,
  AppStateStatus,
  Animated,
} from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../../lib/supabase';
import { Ionicons } from '@expo/vector-icons'; // Make sure to install: expo install @expo/vector-icons

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
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const pulse = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 1.1, duration: 300, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  };

  return (
    <View style={styles.avatarContainer}>
      <TouchableOpacity onPress={onPress} disabled={loading} activeOpacity={0.8}>
        <Animated.View style={[styles.avatarWrapper, { transform: [{ scale: scaleAnim }] }]}>
          <View style={styles.gradientBorder}>
            {uri ? (
              <Image source={{ uri }} style={styles.avatar} resizeMode="cover" />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>👤</Text>
              </View>
            )}
          </View>
        </Animated.View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.changeAvatarBtn, loading && styles.disabledBtn]}
        onPress={() => {
          pulse();
          onPress();
        }}
        disabled={loading}
      >
        <Text style={[styles.changeAvatarText, loading && styles.disabledText]}>
          {loading ? 'Uploading...' : 'Change Avatar'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

// === Main Screen ===
const ProfileScreen = ({ navigation }: { navigation: any }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [currentAppStatus, setCurrentAppStatus] = useState<'Online' | 'Offline'>('Offline');
  const [avatarUrl, setAvatarUrl] = useState<string>('');

  const appStateRef = useRef(AppState.currentState);

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

  // === Load Profile ===
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        setUserId(user.id);

        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (error && error.code !== 'PGRST116') throw error;

        const profile = data || {};
        const formData = {
          display_name: profile.display_name || '',
          email: profile.email || user.email || '',
          avatar_url: profile.avatar_url || '',
          bio: profile.bio || '',
          country: profile.country || '',
          region: profile.region || '',
          language: profile.language || '',
        };

        reset(formData);
        setAvatarUrl(formData.avatar_url);
        setCurrentAppStatus(AppState.currentState === 'active' ? 'Online' : 'Offline');
      } catch (err: any) {
        Alert.alert('Error', err.message);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [reset]);

  // === Auto Status Sync ===
  useEffect(() => {
    if (!userId) return;

    let timeout: NodeJS.Timeout;

    const updateStatus = async (isActive: boolean) => {
      clearTimeout(timeout);
      timeout = setTimeout(async () => {
        const newStatus: 'Online' | 'Offline' = isActive ? 'Online' : 'Offline';
        setCurrentAppStatus(newStatus);

        await supabase
          .from('profiles')
          .upsert({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('user_id', userId);
      }, 1000);
    };

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        updateStatus(true);
      } else if (nextState.match(/inactive|background/)) {
        updateStatus(false);
      }
      appStateRef.current = nextState;
    };

    updateStatus(AppState.currentState === 'active');
    const sub = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      sub.remove();
      clearTimeout(timeout);
    };
  }, [userId]);

  // === Save Profile ===
  const onSubmit = async (data: ProfileFormData) => {
    if (!userId) return;
    setSaving(true);

    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (!profileData) {
        const { error: insertError } = await supabase
          .from('profiles')
          .insert({
            user_id: userId,
            display_name: data.display_name,
            email: data.email,
            avatar_url: data.avatar_url || '',
            bio: data.bio || '',
            country: data.country || '',
            region: data.region || '',
            language: data.language || '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

        if (insertError) throw insertError;
        Alert.alert('Success', 'Profile created!');
      } else {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            display_name: data.display_name,
            email: data.email,
            avatar_url: data.avatar_url || '',
            bio: data.bio || '',
            country: data.country || '',
            region: data.region || '',
            language: data.language || '',
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId);

        if (updateError) throw updateError;
        Alert.alert('Success', 'Profile updated!');
      }
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
    const fileExt = result.assets[0].uri.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `${userId}/avatar.${fileExt}`;
    const filePath = `avatars/${fileName}`;

    setUploadingAvatar(true);
    setAvatarUrl(result.assets[0].uri);

    try {
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, decode(base64), {
          upsert: true,
          contentType: `image/${fileExt === 'png' ? 'png' : 'jpeg'}`,
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const publicUrl = `${data.publicUrl}?t=${Date.now()}`;

      setAvatarUrl(publicUrl);
      setValue('avatar_url', publicUrl);

      Alert.alert('Success', 'Avatar updated!');
    } catch (err: any) {
      Alert.alert('Upload failed', err.message);
    } finally {
      setUploadingAvatar(false);
    }
  }, [userId, setValue]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0066cc" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: '#f8f9fa' }}
    >
      {/* === Header with Back Button === */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* === Profile Card === */}
        <View style={styles.card}>
          <AvatarPreview uri={avatarUrl} onPress={uploadAvatar} loading={uploadingAvatar} />

          <FormField label="Display Name" control={control} name="display_name" error={errors.display_name} placeholder="John Doe" />
          <FormField label="Email" control={control} name="email" error={errors.email} placeholder="john@example.com" keyboardType="email-address" />
          <FormField label="Bio" control={control} name="bio" error={errors.bio} placeholder="Tell us about yourself..." multiline />
          <FormField label="Country" control={control} name="country" error={errors.country} placeholder="USA" />
          <FormField label="Region" control={control} name="region" error={errors.region} placeholder="California" />
          <FormField label="Language" control={control} name="language" error={errors.language} placeholder="en" />

          {/* === Status === */}
          <View style={styles.field}>
            <Text style={styles.label}>Status</Text>
            <View style={styles.statusBadge}>
              <View style={[styles.statusDot, currentAppStatus === 'Online' ? styles.onlineDot : styles.offlineDot]} />
              <Text style={styles.statusBadgeText}>{currentAppStatus}</Text>
              {currentAppStatus === 'Online' && <View style={styles.pulseDot} />}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* === Floating Save Button === */}
      <View style={styles.floatingButtonContainer}>
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
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
    </KeyboardAvoidingView>
  );
};

// === Reusable Input ===
const FormField = ({
  label,
  control,
  name,
  error,
  ...props
}: {
  label: string;
  control: any;
  name: keyof ProfileFormData;
  error?: any;
  [key: string]: any;
}) => {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <TextInput
            {...props}
            style={[
              styles.input,
              error && styles.inputError,
              focused && styles.inputFocused,
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

// === Styles ===
const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8f9fa' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    backgroundColor: '#0066cc',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  backButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
  scrollContainer: {
    padding: 20,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  avatarContainer: { alignItems: 'center', marginBottom: 24 },
  avatarWrapper: {
    position: 'relative',
  },
  gradientBorder: {
    width: 70,
    height: 70,
    borderRadius: 55,
    padding: 4,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#0066cc',
    elevation: 4,
    shadowColor: '#0066cc',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 50,
  },
  avatarPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 50,
    backgroundColor: '#e3f2fd',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 42,
  },
  changeAvatarBtn: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#e3f2fd',
    borderRadius: 20,
    elevation: 2,
  },
  changeAvatarText: {
    color: '#0066cc',
    fontWeight: '600',
    fontSize: 14,
  },
  disabledBtn: { opacity: 0.6 },
  disabledText: { color: '#999' },
  field: { marginBottom: 18 },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#1a1a1a',
    letterSpacing: 0.3,
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    backgroundColor: '#fafafa',
    color: '#1a1a1a',
  },
  inputFocused: {
    borderColor: '#0066cc',
    backgroundColor: '#fff',
    elevation: 3,
    shadowColor: '#0066cc',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
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
    paddingHorizontal: 16,
    backgroundColor: '#f0f7ff',
    borderRadius: 25,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#b3e0ff',
    position: 'relative',
    overflow: 'hidden',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
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
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4CAF50',
    opacity: 0,
    left: 16,
    animation: 'pulse 2s infinite',
  },
  statusBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0066cc',
  },
  floatingButtonContainer: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  saveBtn: {
    flexDirection: 'row',
    backgroundColor: '#0066cc',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#0066cc',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    minWidth: 200,
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 0.5,
  },
});

export default ProfileScreen;