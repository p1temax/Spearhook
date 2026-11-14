"use client";

import { Link, useLocation } from "react-router-dom";
import { isAdminRole, useAuthStore } from "@/auth/auth-store";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

export type SettingsTab = {
  href: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
};

/** Segmented sub-navigation shared by consolidated settings pages. */
export function SettingsTabs({ tabs }: { tabs: SettingsTab[] }) {
  const { t } = useI18n();
  const pathname = useLocation().pathname;
  const user = useAuthStore((s) => s.user);
  const isAdmin = isAdminRole(user?.role);

  return (
    <nav
      aria-label={t("common.settingsSections")}
      className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-border bg-muted/60 p-1"
    >
      {tabs
        .filter((tab) => !tab.adminOnly || isAdmin)
        .map((tab) => {
          const active =
            pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              to={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                active
                  ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
              )}
            >
              {Icon ? (
                <Icon
                  className={cn(
                    "h-4 w-4",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                />
              ) : null}
              {tab.label}
            </Link>
          );
        })}
    </nav>
  );
}
