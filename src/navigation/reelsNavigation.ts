export type ReelsTabParamList = {
  ReelHome: undefined;
  ReelSearch: undefined;
  ReelInbox: undefined;
  ReelAccount: undefined;
};

export type ReelsStackParamList = {
  ReelTabs: undefined;
  ReelCreatorProfile: { profileId: string; displayName?: string };
  ReelDetail: { reelId: string; contextReels?: import('../lib/api').ReelDTO[]; initialIndex?: number };
  ReelSound: { soundId: string };
};
