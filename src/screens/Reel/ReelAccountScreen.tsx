import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, View } from 'react-native';
import { api } from '../../lib/api';
import { useReelProfileStore } from '../../stores/reelProfileStore';
import ReelProfileView from './ReelProfileView';

export default function ReelAccountScreen() {
  const [profileId, setProfileId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.profiles
      .me()
      .then((res) => {
        const id = (res.profile as { id?: string }).id ?? null;
        if (alive) {
          setProfileId(id);
          if (id) void useReelProfileStore.getState().ensureLoaded(id, 48);
        }
      })
      .catch(() => {
        if (alive) setProfileId(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!profileId) {
    return (
      <View style={styles.loader}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  return <ReelProfileView profileId={profileId} isSelf />;
}

const styles = StyleSheet.create({
  loader: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
});
