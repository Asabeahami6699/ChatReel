import React from 'react';
import { RouteProp, useRoute } from '@react-navigation/native';
import type { ReelsStackParamList } from '../../navigation/reelsNavigation';
import ReelProfileView from './ReelProfileView';

export default function ReelCreatorProfileScreen() {
  const route = useRoute<RouteProp<ReelsStackParamList, 'ReelCreatorProfile'>>();
  return (
    <ReelProfileView
      profileId={route.params.profileId}
      showBack
    />
  );
}
