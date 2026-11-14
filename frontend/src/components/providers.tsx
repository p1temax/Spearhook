"use client";

import { useEffect, type ReactNode } from "react";
import { I18nProvider } from "@/i18n";
import { DEMO_MODE } from "@/demo/config";
import { DemoBanner } from "@/demo/demo-banner";
import { useAuthStore } from "@/auth/auth-store";
import { useThemeStore } from "@/stores/theme-store";

function ThemeSync() {
  const theme = useThemeStore((s) => s.theme);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
  }, [theme]);
  return null;
}

function AuthHydrator({ children }: { children: ReactNode }) {
  const hydrate = useAuthStore((s) => s.hydrate);
  useEffect(() => {
    hydrate();
  }, [hydrate]);
  return <>{children}</>;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <ThemeSync />
      <AuthHydrator>{children}</AuthHydrator>
      {DEMO_MODE ? <DemoBanner /> : null}
    </I18nProvider>
  );
}
