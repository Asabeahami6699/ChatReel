import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Image,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import Portal from './Portal';

interface DropdownMenuProps {
  triggerIcon?: 'ellipsis-horizontal' | 'ellipsis-vertical';
}

interface Profile {
  display_name: string;
  avatar_url: string;
  email: string;
}

export default function DropdownMenu({ triggerIcon = 'ellipsis-vertical' }: DropdownMenuProps) {
  const [visible, setVisible] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const { user, signOut } = useAuth();
  const navigation = useNavigation<any>(); // Using any for now, adjust later based on type

  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  // === AUTO CLOSE ON NAVIGATION ===
  useEffect(() => {
    const unsubscribe = navigation.addListener('state', () => {
      if (visible) {
        closeMenu();
      }
    });
    return unsubscribe;
  }, [navigation, visible]);

  // === FETCH + LIVE PROFILE UPDATE ===
  useEffect(() => {
    if (!user) return;

    const fetchProfile = async () => {
      // Fetch the profile from the 'profiles' table using user_id
      const { data, error } = await supabase
        .from('profiles')
        .select('display_name, avatar_url, email')
        .eq('user_id', user.id)  // Use user_id to filter in the 'profiles' table
        .single();
      
      if (error) {
        console.error('Error fetching profile:', error);
      } else {
        setProfile(data);
      }
    };

    fetchProfile();

    // Subscribe to real-time profile updates
    const channel = supabase
      .channel(`profile-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `user_id=eq.${user.id}`,  // Use user_id filter
        },
        (payload) => {
          setProfile(payload.new as Profile);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const closeMenu = () => {
    Animated.parallel([
      Animated.timing(opacityAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 0.8, duration: 120, useNativeDriver: true }),
    ]).start(() => setVisible(false));
  };

  const toggleMenu = () => {
    if (visible) {
      closeMenu();
    } else {
      setVisible(true);
      Animated.parallel([
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
          easing: Easing.out(Easing.ease),
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          friction: 6,
          tension: 80,
        }),
      ]).start();
    }
  };

  const menuItems = [
    { title: 'Profile', icon: 'person-outline', onPress: () => navigation.navigate('Profile') },
    { title: 'New Group', icon: 'people-outline', onPress: () => navigation.navigate('NewGroup') },
    { title: 'Settings', icon: 'settings-outline', onPress: () => navigation.navigate('Settings') },
    { title: 'Invite a Friend', icon: 'share-social-outline', onPress: () => navigation.navigate('Invite') },
    { title: 'My QR Code', icon: 'qr-code-outline', onPress: () => navigation.navigate('QRCode') },
    { title: 'Link a Device', icon: 'phone-portrait-outline', onPress: () => navigation.navigate('QRScanner') },
    {
      title: 'Sign Out',
      icon: 'log-out-outline',
      danger: true,
      onPress: async () => {
        await signOut();
        setVisible(false);
      },
    },
  ];

  // Debugging navigation on the web side
  useEffect(() => {
    if (Platform.OS === 'web') {
      console.log('Navigation:', navigation);  // Check navigation object
      console.log('Navigation state:', navigation.getState()); // Get the full state of navigation
    }
  }, [navigation]);

  return (
    <>
      {/* Trigger */}
      <TouchableOpacity onPress={toggleMenu} style={styles.trigger}>
        <Ionicons name={triggerIcon} size={24} color="#000" />
      </TouchableOpacity>

      {/* PORTAL: Always on top */}
      {visible && (
        <Portal>
          <View style={styles.portalContainer}>
            {/* Overlay */}
            <Pressable
              onPress={closeMenu}
              style={styles.overlay}
            />

            {/* Dropdown */}
            <Animated.View
              style={[styles.dropdown, { opacity: opacityAnim, transform: [{ scale: scaleAnim }], top: Platform.OS === 'web' ? 70 : 60, right: Platform.OS === 'web' ? 16 : 10 }]}
            >
              {/* User Info */}
              <View style={styles.userInfo}>
                <Image
                  source={{
                    uri: profile?.avatar_url || 'https://via.placeholder.com/60?text=User',
                  }}
                  style={styles.avatar}
                  defaultSource={{ uri: 'https://via.placeholder.com/60?text=User' }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.displayName} numberOfLines={1}>
                    {profile?.display_name || 'User'}
                  </Text>
                  <Text style={styles.email} numberOfLines={1}>
                    {profile?.email || 'user@example.com'}
                  </Text>
                </View>
              </View>

              <View style={styles.separator} />

              {/* Menu Items */}
              {menuItems.map((item, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.menuItem}
                  onPress={() => {
                    closeMenu();
                    item.onPress();
                  }}
                >
                  <Ionicons
                    name={item.icon as any}
                    size={20}
                    color={item.danger ? '#ff3b30' : '#000'}
                  />
                  <Text style={[styles.menuText, item.danger && styles.dangerText]}>
                    {item.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </Animated.View>
          </View>
        </Portal>
      )}
    </>
  );
}

// === STYLES ===
const styles = StyleSheet.create({
  trigger: {
    padding: 6,
    zIndex: 100000,
  },
  portalContainer: {
    position: Platform.OS === 'web' ? 'fixed' : 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999999,
    pointerEvents: 'box-none',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  dropdown: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    width: 240,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 20,
    zIndex: 9999999,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 10,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
    backgroundColor: '#f0f0f0',
  },
  displayName: {
    fontWeight: '600',
    fontSize: 16,
    color: '#000',
  },
  email: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  separator: {
    height: 1,
    backgroundColor: '#eee',
    marginVertical: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  menuText: {
    marginLeft: 14,
    fontSize: 15,
    color: '#000',
    flex: 1,
  },
  dangerText: {
    color: '#ff3b30',
  },
});
