export type ReelsTabParamList = {
  ReelHome: undefined;
  ReelSearch: undefined;
  ReelInbox: undefined;
  ReelAccount: undefined;
};

export type ReelsStackParamList = {
  ReelTabs: undefined | { screen?: keyof ReelsTabParamList };
  ReelCreatorProfile: { profileId: string; displayName?: string };
  ReelCreatorWallet: undefined;
  ReelCreatorAnalytics: undefined;
  ReelDetail: {
    reelId: string;
    contextReels?: import('../lib/api').ReelDTO[];
    initialIndex?: number;
    disableProfileNavigation?: boolean;
  };
  ReelSound: { soundId?: string; fromReelId?: string };
};
