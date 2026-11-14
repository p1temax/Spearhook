"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Local display order for the phishing page library. The backend has no
 * ordering field, so drag-and-drop ordering is a client preference.
 */
type PageOrderState = {
  order: number[];
  setOrder: (order: number[]) => void;
};

export const usePageOrderStore = create<PageOrderState>()(
  persist(
    (set) => ({
      order: [],
      setOrder: (order) => set({ order }),
    }),
    { name: "spearhook.page-order" },
  ),
);
