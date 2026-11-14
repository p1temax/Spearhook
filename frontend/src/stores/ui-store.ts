"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Shell-level UI state. Persisted so the sidebar keeps its layout across
 * reloads and route changes no longer reset the navigation groups.
 */
type UiState = {
  sidebarCollapsed: boolean;
  workbenchOpen: boolean;
  systemOpen: boolean;
  /** Percentage layout of the chat rail/thread split, keyed by panel id. */
  chatLayout: Record<string, number> | null;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setWorkbenchOpen: (open: boolean) => void;
  setSystemOpen: (open: boolean) => void;
  setChatLayout: (layout: Record<string, number>) => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      workbenchOpen: true,
      systemOpen: true,
      chatLayout: null,
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setWorkbenchOpen: (workbenchOpen) => set({ workbenchOpen }),
      setSystemOpen: (systemOpen) => set({ systemOpen }),
      setChatLayout: (chatLayout) => set({ chatLayout }),
    }),
    {
      name: "spearhook.ui",
      partialize: ({ sidebarCollapsed, workbenchOpen, systemOpen, chatLayout }) => ({
        sidebarCollapsed,
        workbenchOpen,
        systemOpen,
        chatLayout,
      }),
    },
  ),
);
