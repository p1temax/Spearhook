"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark";
export const THEME_STORAGE_KEY = "spearhook.theme";

function systemTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

type ThemeState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

/**
 * Explicit light/dark choice. First visit follows the OS preference; the inline
 * script in app/layout.tsx applies the class before paint to avoid a flash.
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: systemTheme(),
      setTheme: (theme) => set({ theme }),
      toggleTheme: () =>
        set({ theme: get().theme === "dark" ? "light" : "dark" }),
    }),
    {
      name: THEME_STORAGE_KEY,
      partialize: ({ theme }) => ({ theme }),
    },
  ),
);
