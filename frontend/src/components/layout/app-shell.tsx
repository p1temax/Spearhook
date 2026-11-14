"use client";

import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import {
  BrainCircuit,
  ChevronRight,
  Kanban,
  LayoutDashboard,
  LayoutTemplate,
  LogOut,
  Mail,
  MessageSquare,
  Network,
  PanelLeft,
  QrCode,
  ScrollText,
  Search,
  Send,
  Settings,
  ShieldBan,
  Wrench,
} from "lucide-react";
import { useEffect, useMemo } from "react";
import { useI18n } from "@/i18n";
import { isAdminRole, useAuthStore } from "@/auth/auth-store";
import { api } from "@/api";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand-logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useUiStore } from "@/stores/ui-store";

const SIDEBAR_WIDTH = 256;
const SIDEBAR_WIDTH_COLLAPSED = 64;
const SPRING = { type: "spring" as const, stiffness: 420, damping: 40 };

function userInitials(username?: string | null) {
  const name = (username || "").trim();
  if (!name) return "U";
  const parts = name.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

type NavItem = {
  href: string;
  key: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  /** Sibling routes that keep this group highlighted. */
  aliases?: string[];
};

const primaryNav: NavItem[] = [
  { href: "/", key: "nav.dashboard", icon: LayoutDashboard },
  { href: "/chat", key: "nav.chat", icon: MessageSquare },
  { href: "/projects", key: "nav.projects", icon: Kanban },
  { href: "/audit-logs", key: "nav.auditLogs", icon: ScrollText, adminOnly: true },
];

const workbenchNav: NavItem[] = [
  { href: "/workbench/mail", key: "nav.sendMail", icon: Send },
  { href: "/workbench/page-builder", key: "nav.pageBuilder", icon: LayoutTemplate },
  { href: "/workbench/info-gathering", key: "nav.infoGathering", icon: Search },
  { href: "/workbench/qr-phishing", key: "nav.qrPhishing", icon: QrCode },
];

const systemNav: NavItem[] = [
  {
    href: "/ip-blacklist",
    key: "nav.accessControl",
    icon: ShieldBan,
    aliases: ["/users"],
  },
  {
    href: "/agents",
    key: "nav.integrations",
    icon: Network,
    aliases: ["/robots"],
  },
  {
    href: "/smtp-services",
    key: "nav.email",
    icon: Mail,
    aliases: ["/mail-tracking"],
  },
  {
    href: "/ai-settings",
    key: "nav.ai",
    icon: BrainCircuit,
    adminOnly: true,
    aliases: ["/search-settings"],
  },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function matchesNav(pathname: string, item: NavItem) {
  if (isActivePath(pathname, item.href)) return true;
  return (item.aliases ?? []).some((alias) => isActivePath(pathname, alias));
}

function NavLink({
  item,
  collapsed,
  indented = false,
}: {
  item: NavItem;
  collapsed: boolean;
  indented?: boolean;
}) {
  const { t } = useI18n();
  const location = useLocation();
  const active = matchesNav(location.pathname, item);
  const Icon = item.icon;
  const label = t(item.key);

  const link = (
    <Link
      to={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative isolate flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
        indented && !collapsed && "pl-8",
        collapsed && "justify-center px-0",
        active
          ? "font-medium text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
      )}
    >
      {active ? (
        <motion.span
          layoutId="sidebar-active"
          className="absolute inset-0 -z-10 rounded-md bg-sidebar-accent"
          transition={SPRING}
        />
      ) : null}
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span className="truncate whitespace-nowrap">{label}</span>}
    </Link>
  );

  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function NavGroup({
  label,
  icon: Icon,
  open,
  onOpenChange,
  collapsed,
  active,
  onExpand,
  children,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collapsed: boolean;
  active: boolean;
  onExpand: () => void;
  children: React.ReactNode;
}) {
  return (
    <Collapsible open={collapsed ? true : open} onOpenChange={onOpenChange} className="space-y-0.5">
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => onExpand()}
              className="flex w-full items-center justify-center rounded-md py-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"
            >
              <Icon className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      ) : (
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
              active
                ? "font-medium text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate text-left">{label}</span>
            <motion.span
              animate={{ rotate: open ? 90 : 0 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              className="flex"
            >
              <ChevronRight className="h-3.5 w-3.5 opacity-60" />
            </motion.span>
          </button>
        </CollapsibleTrigger>
      )}
        <CollapsibleContent className="space-y-0.5">{children}</CollapsibleContent>
    </Collapsible>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const isAdmin = isAdminRole(user?.role);
  const isMobile = useIsMobile();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const setSidebarCollapsed = useUiStore((s) => s.setSidebarCollapsed);
  const workbenchOpen = useUiStore((s) => s.workbenchOpen);
  const setWorkbenchOpen = useUiStore((s) => s.setWorkbenchOpen);
  const systemOpen = useUiStore((s) => s.systemOpen);
  const setSystemOpen = useUiStore((s) => s.setSystemOpen);

  const visiblePrimaryNav = useMemo(
    () => primaryNav.filter((item) => !item.adminOnly || isAdmin),
    [isAdmin],
  );
  const visibleSystemNav = useMemo(
    () => systemNav.filter((item) => !item.adminOnly || isAdmin),
    [isAdmin],
  );

  const workbenchActive = useMemo(
    () => workbenchNav.some((item) => isActivePath(location.pathname, item.href)),
    [location.pathname],
  );
  const systemActive = useMemo(
    () => visibleSystemNav.some((item) => matchesNav(location.pathname, item)),
    [location.pathname, visibleSystemNav],
  );

  useEffect(() => {
    if (workbenchActive) setWorkbenchOpen(true);
  }, [workbenchActive, setWorkbenchOpen]);

  useEffect(() => {
    if (systemActive) setSystemOpen(true);
  }, [systemActive, setSystemOpen]);

  useEffect(() => {
    if (isMobile) setSidebarCollapsed(true);
  }, [isMobile, setSidebarCollapsed]);

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    logout();
    navigate("/login", { replace: true });
  };

  const pageTitle = useMemo(() => {
    const all = [...primaryNav, ...workbenchNav, ...systemNav];
    const hit = all.find((item) => matchesNav(location.pathname, item));
    return hit ? t(hit.key) : t("app.title");
  }, [location.pathname, t]);

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-svh max-h-svh w-full overflow-hidden bg-background">
        <motion.aside
          initial={false}
          animate={{
            width: collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH,
          }}
          transition={SPRING}
          className="z-20 flex h-svh shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
        >
          <div
            className={cn(
              "flex h-[var(--header-height)] shrink-0 items-center gap-2.5 border-b border-sidebar-border px-4",
              collapsed && "justify-center px-0",
            )}
          >
            <BrandLogo
              size={22}
              className="text-sidebar-foreground"
              title={t("app.title")}
            />
            {!collapsed && (
              <div className="min-w-0 leading-tight">
                <div className="truncate font-brand text-[13px] font-semibold tracking-[0.14em]">
                  {t("app.title")}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {user?.role === "operator"
                    ? t("users.roleOperator")
                    : t("app.admin")}
                </div>
              </div>
            )}
          </div>

          <nav className="flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-2 py-3">
            <div className="space-y-0.5">
              {!collapsed && (
                <div className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {t("nav.platform")}
                </div>
              )}
              {visiblePrimaryNav.map((item) => (
                <NavLink key={item.href} item={item} collapsed={collapsed} />
              ))}
            </div>

            <NavGroup
              label={t("nav.workbench")}
              icon={Wrench}
              open={workbenchOpen}
              onOpenChange={setWorkbenchOpen}
              collapsed={collapsed}
              active={workbenchActive}
              onExpand={() => {
                setSidebarCollapsed(false);
                setWorkbenchOpen(true);
              }}
            >
              {workbenchNav.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  collapsed={collapsed}
                  indented
                />
              ))}
            </NavGroup>

            <NavGroup
              label={t("nav.system")}
              icon={Settings}
              open={systemOpen}
              onOpenChange={setSystemOpen}
              collapsed={collapsed}
              active={systemActive}
              onExpand={() => {
                setSidebarCollapsed(false);
                setSystemOpen(true);
              }}
            >
              {visibleSystemNav.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  collapsed={collapsed}
                  indented
                />
              ))}
            </NavGroup>
          </nav>

          <div className="shrink-0 border-t border-sidebar-border p-2">
            {!collapsed ? (
              <div className="flex items-center gap-2 rounded-lg px-1.5 py-1.5">
                <Avatar className="h-8 w-8 rounded-md">
                  <AvatarFallback className="rounded-md bg-muted text-[11px] font-medium text-muted-foreground">
                    {userInitials(user?.username)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 text-left">
                  <div className="truncate text-sm font-medium">
                    {user?.username || t("app.admin")}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {user?.role === "operator"
                      ? t("users.roleOperator")
                      : t("app.admin")}
                  </div>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={handleLogout}
                      aria-label={t("app.logout")}
                    >
                      <LogOut className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{t("app.logout")}</TooltipContent>
                </Tooltip>
              </div>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-full text-muted-foreground hover:text-foreground"
                    onClick={handleLogout}
                    aria-label={t("app.logout")}
                  >
                    <Avatar className="h-8 w-8 rounded-md">
                      <AvatarFallback className="rounded-md bg-muted text-[11px] font-medium text-muted-foreground">
                        {userInitials(user?.username)}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">{t("app.logout")}</TooltipContent>
              </Tooltip>
            )}
          </div>
        </motion.aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 flex h-[var(--header-height)] shrink-0 items-center gap-2 border-b border-border/80 bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={toggleSidebar}
              aria-label={t("common.toggleSidebar")}
            >
              <PanelLeft className="h-4 w-4" />
            </Button>
            <Separator orientation="vertical" className="mr-1 h-4" />
            <div className="truncate text-sm font-medium">{pageTitle}</div>
            <div className="ml-auto flex items-center gap-1">
              <ThemeToggle />
              <LanguageSwitcher />
            </div>
          </header>
          <main
            className={cn(
              "flex min-h-0 flex-1 flex-col",
              // Chat manages its own panes; prevent the shell from scrolling the session rail + thread together.
              location.pathname.startsWith("/chat")
                ? "overflow-hidden"
                : "overflow-auto",
            )}
          >
            {children}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
