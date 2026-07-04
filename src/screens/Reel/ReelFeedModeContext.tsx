import React, { createContext, useContext, useState, type ReactNode } from 'react';

type FeedMode = 'forYou' | 'following';
type ReelSidebarCtx = {
  feedMode: FeedMode;
  setFeedMode: (mode: FeedMode) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
};

const Ctx = createContext<ReelSidebarCtx>({
  feedMode: 'forYou',
  setFeedMode: () => {},
  sidebarCollapsed: false,
  toggleSidebar: () => {},
});

export function ReelFeedModeProvider({ children }: { children: ReactNode }) {
  const [feedMode, setFeedMode] = useState<FeedMode>('forYou');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const toggleSidebar = () => setSidebarCollapsed((c) => !c);

  return (
    <Ctx.Provider value={{ feedMode, setFeedMode, sidebarCollapsed, toggleSidebar }}>
      {children}
    </Ctx.Provider>
  );
}

export function useReelFeedMode() {
  return useContext(Ctx);
}
