import { getLocale, resolveLocale } from "../i18n/locales";

/** Root chrome for ChatPage — fills AppShell main; no page bleed / no outer scroll. */
export const CHAT_ROOT_CLASS =
  "flex h-full min-h-0 max-h-full flex-1 overflow-hidden bg-background";

export type ChatSessionLike = {
  id: number;
  title: string;
  created_at?: string;
  updated_at?: string;
  pending_confirm?: boolean;
};

export type SessionGroup<T extends ChatSessionLike = ChatSessionLike> = {
  key: string;
  label: string;
  items: T[];
};

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Group sessions by calendar day relative to `now` (injectable for tests). */
export function groupSessions<T extends ChatSessionLike>(
  sessions: T[],
  labels: { today: string; yesterday: string; older: string },
  now: Date = new Date(),
): SessionGroup<T>[] {
  const today = startOfDay(now);
  const yesterday = today - 86400000;
  const buckets: Record<string, T[]> = {
    today: [],
    yesterday: [],
    older: [],
  };
  for (const s of sessions) {
    const raw = s.updated_at || s.created_at;
    const t = raw ? startOfDay(new Date(raw)) : today;
    if (t >= today) buckets.today.push(s);
    else if (t >= yesterday) buckets.yesterday.push(s);
    else buckets.older.push(s);
  }
  return [
    { key: "today", label: labels.today, items: buckets.today },
    { key: "yesterday", label: labels.yesterday, items: buckets.yesterday },
    { key: "older", label: labels.older, items: buckets.older },
  ].filter((g) => g.items.length > 0);
}

export function relativeTime(
  iso?: string,
  locale?: string,
  nowMs: number = Date.now(),
  labels?: { justNow?: string },
): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const resolved = resolveLocale([locale || "en"]);
  const dateLocale = getLocale(resolved).dateLocale;
  const rtf = new Intl.RelativeTimeFormat(dateLocale, {
    numeric: "auto",
    style: "narrow",
  });
  const diff = nowMs - t;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return labels?.justNow || rtf.format(0, "minute");
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  const days = Math.floor(hours / 24);
  if (days < 7) return rtf.format(-days, "day");
  return new Date(iso).toLocaleDateString(dateLocale);
}

/** True when a class string uses negative margin bleed (unsafe under unpadded shell main). */
export function hasNegativeMarginBleed(className: string): boolean {
  // Matches -m-4, -mt-2, md:-mx-6, -m-[3px], etc.
  return /(?:^|[\s:])-m(?:[trblxy]|[se]{1,2})?-(\d|\[[^\]]+\])/.test(
    className,
  );
}
