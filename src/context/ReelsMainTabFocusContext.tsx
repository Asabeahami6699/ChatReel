import React, { createContext, useContext } from 'react';

/** True when the main app "Reels" tab is focused (not Chats/Explore/Calls). */
export const ReelsMainTabFocusContext = createContext(true);

export function useReelsMainTabFocused(): boolean {
  return useContext(ReelsMainTabFocusContext);
}
