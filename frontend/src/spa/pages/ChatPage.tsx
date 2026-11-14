"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import {
  ArrowUp,
  Check,
  CircleStop,
  Download,
  LoaderCircle,
  Menu,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import { Group, Panel, Separator } from "react-resizable-panels";
import {
  api,
  streamChatEvents,
  streamChatRequest,
  type ChatSSEEvent,
} from "@/api";
import { useI18n } from "@/i18n";
import { DEMO_MODE } from "@/demo/config";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MarkdownMessage } from "@/components/markdown-message";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import {
  CHAT_ROOT_CLASS,
  groupSessions,
  relativeTime,
  type ChatSessionLike,
} from "@/utils/chatLayout";

type ChatSession = ChatSessionLike;

type ChatLink = { label: string; href: string };

type ChatMessage = {
  id: number | string;
  role: string;
  content: string;
  tool_calls_json?: string;
  tool_call_id?: string;
  tool_name?: string;
  status?: string;
  created_at?: string;
  links?: ChatLink[];
  streaming?: boolean;
  progress?: { percent?: number; stage?: string; message?: string };
  ephemeral?: Record<string, unknown>;
};

type PendingConfirm = {
  tool_call_id: string;
  name: string;
  arguments: unknown;
  message?: string;
  risk?: string;
};

type JobCard = {
  job_id: number;
  status: string;
  stage?: string;
  percent?: number;
  message?: string;
  email_count?: number;
  phone_count?: number;
  finding_count?: number;
  link?: string;
};

function parseJobCard(content: string): JobCard | null {
  try {
    const parsed = JSON.parse(content) as Partial<JobCard>;
    if (!parsed || typeof parsed.job_id !== "number") return null;
    return { ...parsed, job_id: parsed.job_id, status: parsed.status || "done" };
  } catch {
    return null;
  }
}

type ToolPayload = {
  ok?: boolean;
  summary?: string;
  error?: string;
  result?: unknown;
  links?: ChatLink[];
};

function parseToolPayload(content: string): ToolPayload | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as ToolPayload;
    if (
      parsed &&
      typeof parsed === "object" &&
      ("summary" in parsed || "error" in parsed || "result" in parsed)
    ) {
      return parsed;
    }
  } catch {
    /* not a structured tool result */
  }
  return null;
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function JobCardView({ job, live = false }: { job: JobCard; live?: boolean }) {
  const { t } = useI18n();
  const running = job.status === "pending" || job.status === "running";
  const failed = job.status === "failed";
  const statusLabel = running
    ? t("chat.jobRunning")
    : failed
      ? t("chat.jobFailed")
      : job.status === "partial"
        ? t("chat.jobPartial")
        : t("chat.jobSucceeded");
  const percent = Math.max(
    0,
    Math.min(100, job.percent ?? (running ? 5 : 100)),
  );
  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[92%] rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-700">
        <div className="mb-1 flex flex-wrap items-center gap-1.5 font-medium">
          {running ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="h-3.5 w-3.5" />
          )}
          <span>{t("chat.jobTitle", { id: String(job.job_id) })}</span>
          <Badge
            variant={failed ? "danger" : running ? "secondary" : "success"}
            className="h-4 px-1 text-[10px]"
          >
            {statusLabel}
          </Badge>
          {live ? (
            <span className="text-[10px] text-slate-400">{t("chat.jobLive")}</span>
          ) : null}
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              failed ? "bg-red-500" : "bg-slate-900",
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          {job.message || job.stage ? (
            <span>{job.message || job.stage}</span>
          ) : null}
          {typeof job.email_count === "number" ||
          typeof job.phone_count === "number" ? (
            <span>
              {t("chat.jobCounts", {
                emails: job.email_count ?? 0,
                phones: job.phone_count ?? 0,
              })}
            </span>
          ) : null}
          {job.link ? (
            <Link
              to={job.link}
              className="text-slate-900 underline underline-offset-2"
            >
              {t("chat.openJob")}
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function formatArgs(args: unknown): string {
  if (args == null) return "{}";
  if (typeof args === "string") {
    try {
      return JSON.stringify(JSON.parse(args), null, 2);
    } catch {
      return args;
    }
  }
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
}

const MESSAGE_IN = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.18, ease: "easeOut" as const },
};

/** Drag handle between the session rail and the thread. */
function ChatResizeHandle() {
  return (
    <Separator className="group relative z-10 w-px shrink-0 bg-transparent">
      <span
        aria-hidden
        className="absolute inset-y-0 -left-1.5 -right-1.5 cursor-col-resize"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover:bg-ring"
      />
    </Separator>
  );
}

export default function ChatPage() {
  const { t, locale } = useI18n();
  const chatLayout = useUiStore((s) => s.chatLayout);
  const setChatLayout = useUiStore((s) => s.setChatLayout);
  const isMobile = useIsMobile();
  const [railOpen, setRailOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [thinkingPhase, setThinkingPhase] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [jobs, setJobs] = useState<Record<number, JobCard>>({});
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const threadScrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === sessionId) || null,
    [sessions, sessionId],
  );

  const sessionGroups = useMemo(
    () =>
      groupSessions(sessions, {
        today: t("chat.groupToday"),
        yesterday: t("chat.groupYesterday"),
        older: t("chat.groupOlder"),
      }),
    [sessions, t],
  );

  const suggestions = useMemo(
    () => [
      t("chat.suggestion1"),
      t("chat.suggestion2"),
      t("chat.suggestion3"),
    ],
    [t],
  );

  const playbooks = useMemo(
    () => [
      {
        id: "clone_deploy",
        label: t("chat.playbook.cloneDeploy"),
        prompt: t("chat.playbook.cloneDeployPrompt"),
      },
      {
        id: "gather_contacts",
        label: t("chat.playbook.gatherContacts"),
        prompt: t("chat.playbook.gatherContactsPrompt"),
      },
      {
        id: "hook_notify",
        label: t("chat.playbook.hookNotify"),
        prompt: t("chat.playbook.hookNotifyPrompt"),
      },
    ],
    [t],
  );

  /** Scroll only the chat thread pane — never scrollIntoView (that scrolls the whole shell). */
  const scrollThreadToBottom = useCallback((smooth = false) => {
    const el = threadScrollRef.current;
    if (!el) return;
    if (smooth) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  const onThreadScroll = useCallback(() => {
    const el = threadScrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distance < 80;
  }, []);

  const refreshSessions = useCallback(async () => {
    const { data } = await api.listChatSessions();
    setSessions(Array.isArray(data) ? data : []);
  }, []);

  const loadMessages = useCallback(async (id: number) => {
    const { data } = await api.getChatMessages(id);
    setMessages(Array.isArray(data?.messages) ? data.messages : []);
    if (!data?.session?.pending_confirm) {
      setPending(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        await refreshSessions();
      } catch (e: unknown) {
        if (!cancelled) {
          setError(
            (e as { response?: { data?: { error?: string } } })?.response?.data
              ?.error || t("chat.errorGeneric"),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [refreshSessions, t]);

  useEffect(() => {
    if (DEMO_MODE && !sessionId && sessions.length > 0) {
      setSessionId(Number(sessions[0].id));
    }
  }, [sessions, sessionId]);

  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      setJobs({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await loadMessages(sessionId);
      } catch (e: unknown) {
        if (!cancelled) {
          setError(
            (e as { response?: { data?: { error?: string } } })?.response?.data
              ?.error || t("chat.errorGeneric"),
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, loadMessages, t]);

  // Long-lived background job stream (info gathering continues after a turn).
  useEffect(() => {
    if (!sessionId) return;
    const ac = new AbortController();
    let active = true;
    streamChatEvents(
      `/api/chat/sessions/${sessionId}/events/`,
      (ev: ChatSSEEvent) => {
        if (!active) return;
        if (ev.event !== "job_progress" && ev.event !== "job_done") return;
        const data = ev.data;
        if (typeof data.job_id !== "number") return;
        const job: JobCard = {
          job_id: data.job_id,
          status: data.status || (ev.event === "job_done" ? "done" : "running"),
          stage: data.stage,
          percent: data.percent,
          message: data.message,
          email_count: data.email_count,
          phone_count: data.phone_count,
          finding_count: data.finding_count,
          link: data.link,
        };
        if (ev.event === "job_done") {
          void loadMessages(sessionId);
          setJobs((prev) => {
            const next = { ...prev };
            delete next[job.job_id];
            return next;
          });
          return;
        }
        setJobs((prev) => ({
          ...prev,
          [job.job_id]: { ...prev[job.job_id], ...job },
        }));
      },
      ac.signal,
    ).catch(() => {
      /* background stream; the chat stays usable if it drops */
    });
    return () => {
      active = false;
      ac.abort();
    };
  }, [sessionId, loadMessages]);

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    // Instant while streaming tokens to avoid smooth-scroll queue / page thrash.
    const streaming = messages.some((m) => m.streaming);
    scrollThreadToBottom(!streaming && !busy);
  }, [messages, pending, busy, thinkingPhase, scrollThreadToBottom]);

  // New session / switch: pin to bottom again.
  useEffect(() => {
    stickToBottomRef.current = true;
    scrollThreadToBottom(false);
  }, [sessionId, scrollThreadToBottom]);

  const resizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  };

  const ensureSession = async (): Promise<number> => {
    if (sessionId) return sessionId;
    const { data } = await api.createChatSession();
    const id = Number(data.id);
    await refreshSessions();
    setSessionId(id);
    return id;
  };

  const thinkingLabel = (phase: string | null) => {
    if (phase === "clone") return t("chat.thinkingClone");
    if (phase === "tools") return t("chat.thinkingTools");
    if (phase === "plan") return t("chat.thinkingPlan");
    return t("chat.thinking");
  };

  const handleSSE = (ev: ChatSSEEvent) => {
    if (ev.event === "thinking") {
      const phase = String(ev.data.phase || "plan");
      setThinkingPhase(phase);
      return;
    }
    if (ev.event === "token") {
      const chunk = ev.data.content || "";
      if (!chunk) return;
      setThinkingPhase(null);
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === "assistant" && last.streaming) {
          next[next.length - 1] = { ...last, content: last.content + chunk };
          return next;
        }
        next.push({
          id: `stream-${Date.now()}`,
          role: "assistant",
          content: chunk,
          streaming: true,
        });
        return next;
      });
      return;
    }
    if (ev.event === "tool_start") {
      setThinkingPhase(null);
      setMessages((prev) => [
        ...prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
        {
          id: `tool-start-${ev.data.tool_call_id || Date.now()}`,
          role: "tool",
          content: "",
          tool_name: ev.data.name,
          tool_call_id: ev.data.tool_call_id,
          status: "running",
        },
      ]);
      return;
    }
    if (ev.event === "tool_result") {
      setThinkingPhase(null);
      setMessages((prev) => {
        const next = [...prev];
        const idx = next.findIndex(
          (m) =>
            m.role === "tool" &&
            m.tool_call_id === ev.data.tool_call_id &&
            m.status === "running",
        );
        const row: ChatMessage = {
          id: `tool-${ev.data.tool_call_id || Date.now()}`,
          role: "tool",
          content: ev.data.summary || ev.data.error || "",
          tool_name: ev.data.name,
          tool_call_id: ev.data.tool_call_id,
          status: ev.data.ok ? "done" : "error",
          links: ev.data.links,
          ephemeral: ev.data.ephemeral,
        };
        if (idx >= 0) next[idx] = row;
        else next.push(row);
        return next;
      });
      return;
    }
    if (ev.event === "progress") {
      setMessages((prev) => {
        const next = [...prev];
        let idx = -1;
        if (ev.data.tool_call_id) {
          idx = next.findIndex(
            (m) => m.role === "tool" && m.tool_call_id === ev.data.tool_call_id,
          );
        }
        if (idx < 0) {
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i].role === "tool" && next[i].status === "running") {
              idx = i;
              break;
            }
          }
        }
        if (idx < 0) return prev;
        next[idx] = {
          ...next[idx],
          progress: {
            percent: ev.data.percent,
            stage: ev.data.stage,
            message: ev.data.message,
          },
        };
        return next;
      });
      return;
    }
    if (ev.event === "confirm_required") {
      setThinkingPhase(null);
      setPending({
        tool_call_id: String(ev.data.tool_call_id || ""),
        name: String(ev.data.name || ""),
        arguments: ev.data.arguments,
        message: ev.data.message,
        risk: ev.data.risk,
      });
      setMessages((prev) =>
        prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
      );
      return;
    }
    if (ev.event === "error") {
      setThinkingPhase(null);
      setError(ev.data.error || t("chat.errorGeneric"));
      setMessages((prev) =>
        prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
      );
      return;
    }
    if (ev.event === "done") {
      setThinkingPhase(null);
      setMessages((prev) =>
        prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
      );
      void refreshSessions();
    }
  };

  const sendMessage = async (preset?: string) => {
    const text = (preset ?? input).trim();
    if (!text || busy || pending) return;
    setError("");
    setBusy(true);
    setThinkingPhase("plan");
    setInput("");
    stickToBottomRef.current = true;
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    try {
      const id = await ensureSession();
      setMessages((prev) => [
        ...prev,
        { id: `local-${Date.now()}`, role: "user", content: text },
      ]);
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      await streamChatRequest(
        `/api/chat/sessions/${id}/messages/`,
        { content: text },
        handleSSE,
        ac.signal,
      );
      await loadMessages(id);
    } catch (e: unknown) {
      if ((e as Error)?.name === "AbortError") return;
      setError((e as Error)?.message || t("chat.errorGeneric"));
    } finally {
      setBusy(false);
      setThinkingPhase(null);
    }
  };

  const stopGenerating = () => {
    abortRef.current?.abort();
    setBusy(false);
    setThinkingPhase(null);
    setMessages((prev) =>
      prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
    );
  };

  const confirmPending = async (approve: boolean) => {
    if (!sessionId || !pending || busy) return;
    setBusy(true);
    setThinkingPhase("tools");
    setError("");
    try {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const toolCallId = pending.tool_call_id;
      setPending(null);
      await streamChatRequest(
        `/api/chat/sessions/${sessionId}/confirm/`,
        { tool_call_id: toolCallId, approve },
        handleSSE,
        ac.signal,
      );
      await loadMessages(sessionId);
      await refreshSessions();
    } catch (e: unknown) {
      if ((e as Error)?.name === "AbortError") return;
      setError((e as Error)?.message || t("chat.errorGeneric"));
    } finally {
      setBusy(false);
      setThinkingPhase(null);
    }
  };

  const retryTool = async (toolCallId: string) => {
    if (!sessionId || busy || pending) return;
    setBusy(true);
    setThinkingPhase("tools");
    setError("");
    stickToBottomRef.current = true;
    try {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      await streamChatRequest(
        `/api/chat/sessions/${sessionId}/tools/${toolCallId}/retry/`,
        {},
        handleSSE,
        ac.signal,
      );
      await loadMessages(sessionId);
    } catch (e: unknown) {
      if ((e as Error)?.name === "AbortError") return;
      setError((e as Error)?.message || t("chat.errorGeneric"));
    } finally {
      setBusy(false);
      setThinkingPhase(null);
    }
  };

  const retryHint = (name?: string) => {
    if (name === "clone_page") return t("chat.retryHintClone");
    if (name === "start_info_gather") return t("chat.retryHintGather");
    if (name === "create_mail_draft" || name === "send_mail_campaign") {
      return t("chat.retryHintMail");
    }
    return t("chat.retryHintGeneric");
  };

  const newSession = async () => {
    setError("");
    const { data } = await api.createChatSession();
    await refreshSessions();
    setSessionId(Number(data.id));
    setMessages([]);
    setPending(null);
    textareaRef.current?.focus();
  };

  const deleteSession = async (id: number) => {
    if (!window.confirm(t("chat.deleteSession") + "?")) return;
    await api.deleteChatSession(id);
    await refreshSessions();
    if (sessionId === id) {
      setSessionId(null);
      setMessages([]);
      setPending(null);
    }
  };

  const showEmpty = messages.length === 0 && !busy && !pending;

  const sessionRail = (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden bg-muted/40">
      <div className="shrink-0 p-3">
        <Button
          className="h-9 w-full justify-start gap-2"
          onClick={() => void newSession()}
        >
          <Plus className="h-4 w-4" />
          {t("chat.newSession")}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3">
        {loading && (
          <div className="flex items-center justify-center gap-2 px-2 py-10 text-xs text-muted-foreground">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          </div>
        )}
        {!loading && sessions.length === 0 && (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">
            {t("chat.emptySessions")}
          </div>
        )}
        {sessionGroups.map((group) => (
          <div key={group.key} className="mb-3">
            <div className="px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((s) => {
                const active = sessionId === s.id;
                return (
                  <div
                    key={s.id}
                    className={cn(
                      "group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm transition-colors",
                      active
                        ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                        : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
                    )}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => {
                        setSessionId(s.id);
                        setRailOpen(false);
                      }}
                    >
                      <div className="truncate font-medium">
                        {s.title || t("chat.newSession")}
                      </div>
                      <div
                        className={cn(
                          "mt-0.5 flex items-center gap-1.5 text-[11px]",
                          active ? "text-muted-foreground" : "text-muted-foreground/70",
                        )}
                      >
                        <span>
                          {relativeTime(s.updated_at || s.created_at, locale, undefined, {
                            justNow: t("chat.justNow"),
                          })}
                        </span>
                        {s.pending_confirm ? (
                          <Badge variant="warning" className="h-4 px-1 text-[9px]">
                            {t("chat.waitingConfirm")}
                          </Badge>
                        ) : null}
                      </div>
                    </button>
                    <button
                      type="button"
                      className="shrink-0 rounded p-1 text-muted-foreground/70 opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
                      title={t("chat.deleteSession")}
                      onClick={() => void deleteSession(s.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );

  return (
    <div className={CHAT_ROOT_CLASS}>
      <Group
        orientation="horizontal"
        id="chat-split"
        defaultLayout={isMobile ? undefined : (chatLayout ?? undefined)}
        onLayoutChanged={isMobile ? undefined : setChatLayout}
        className="min-h-0 min-w-0 flex-1"
      >
        {isMobile ? (
          <Sheet open={railOpen} onOpenChange={setRailOpen}>
            <SheetContent side="left" className="w-[17rem] gap-0 p-0 sm:max-w-[17rem]">
              <SheetHeader className="border-b border-border px-4 py-3">
                <SheetTitle className="text-sm">{t("chat.sessions")}</SheetTitle>
              </SheetHeader>
              <div className="flex min-h-0 flex-1 flex-col">{sessionRail}</div>
            </SheetContent>
          </Sheet>
        ) : (
          <>
            <Panel
              id="rail"
              defaultSize="21%"
              minSize="14%"
              maxSize="36%"
              collapsible
              collapsedSize="0%"
              className="min-w-0"
            >
              {sessionRail}
            </Panel>

            <ChatResizeHandle />
          </>
        )}

        <Panel id="thread" minSize="40%" className="min-w-0">
      {/* Main thread */}
      <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background">
        <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border/70 px-4">
          <div className="flex min-w-0 items-center gap-2">
            {isMobile ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground"
                onClick={() => setRailOpen(true)}
                aria-label={t("chat.sessions")}
              >
                <Menu className="h-4 w-4" />
              </Button>
            ) : null}
            <h1 className="truncate text-sm font-semibold text-foreground">
              {activeSession?.title || t("chat.noActiveSession")}
            </h1>
          </div>
          {(activeSession?.pending_confirm || pending) && (
            <Badge variant="warning" className="shrink-0">
              {t("chat.pendingBanner")}
            </Badge>
          )}
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div
            ref={threadScrollRef}
            onScroll={onThreadScroll}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
          >
            <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
              {showEmpty ? (
                <div className="flex flex-col items-center justify-center px-0 py-10 text-center">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-primary text-primary-foreground">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <h2 className="font-brand text-lg font-semibold tracking-[0.08em] text-slate-900">
                    {t("chat.title")}
                  </h2>
                  <p className="mt-2 max-w-md text-sm text-slate-500">
                    {t("chat.emptyMessages")}
                  </p>
                  <div className="mt-8 w-full">
                    <div className="mb-2 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      {t("chat.suggestionsTitle")}
                    </div>
                    <div className="grid gap-2">
                      {suggestions.map((s) => (
                        <button
                          key={s}
                          type="button"
                          disabled={busy || !!pending}
                          onClick={() => void sendMessage(s)}
                          className="rounded-md border border-slate-200 bg-background px-3.5 py-2.5 text-left text-sm text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                    <div className="mt-4">
                      <div className="mb-2 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400">
                        {t("chat.playbooksTitle")}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {playbooks.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            disabled={busy || !!pending}
                            onClick={() => {
                              setInput(p.prompt);
                              requestAnimationFrame(() => resizeTextarea());
                              textareaRef.current?.focus();
                            }}
                            className="rounded-full border border-slate-200 bg-background px-3 py-1.5 text-xs text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-5 pb-4">
                  {messages.map((m) => {
                    if (m.role === "system" && m.tool_name === "info_gather_job") {
                      const job = parseJobCard(m.content);
                      return job ? <JobCardView key={m.id} job={job} /> : null;
                    }
                    if (m.role === "user") {
                      return (
                        <motion.div
                          key={m.id}
                          {...MESSAGE_IN}
                          className="flex justify-end"
                        >
                          <div className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-primary px-3.5 py-2.5 text-sm leading-relaxed text-primary-foreground">
                            {m.content}
                          </div>
                        </motion.div>
                      );
                    }
                    if (m.role === "tool") {
                      const failed = m.status === "error";
                      const running = m.status === "running";
                      const payload = parseToolPayload(m.content);
                      const text = payload
                        ? payload.error || payload.summary || ""
                        : m.content;
                      return (
                        <motion.div
                          key={m.id}
                          {...MESSAGE_IN}
                          className="flex justify-start"
                        >
                          <div
                            className={cn(
                              "w-full min-w-0 max-w-[92%] rounded-md border px-3 py-2.5 text-xs",
                              failed
                                ? "border-destructive/30 bg-destructive/5 text-destructive"
                                : running
                                  ? "border-border bg-muted text-foreground"
                                  : "border-border bg-muted/40 text-foreground",
                            )}
                          >
                            <div className="mb-1 flex items-center gap-1.5 font-medium">
                              {running ? (
                                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                              ) : failed ? (
                                <X className="h-3.5 w-3.5" />
                              ) : (
                                <Check className="h-3.5 w-3.5" />
                              )}
                              <span>
                                {running
                                  ? t("chat.toolRunning")
                                  : failed
                                    ? t("chat.toolFailed")
                                    : t("chat.toolDone")}
                                {m.tool_name ? (
                                  <span className="ml-1 font-mono text-[11px] opacity-80">
                                    {m.tool_name}
                                  </span>
                                ) : null}
                              </span>
                            </div>
                            {text ? (
                              <div
                                className={cn(
                                  "whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed",
                                  failed && "text-red-700",
                                )}
                              >
                                {text}
                              </div>
                            ) : null}
                            {payload?.result !== undefined ? (
                              <details className="mt-2">
                                <summary className="cursor-pointer select-none text-[11px] text-slate-500">
                                  {t("chat.toolDetails")}
                                </summary>
                                <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-all rounded-md border border-slate-200 bg-background/70 p-2 font-mono text-[11px] leading-relaxed">
                                  {JSON.stringify(payload.result, null, 2)}
                                </pre>
                              </details>
                            ) : null}
                            {running && m.progress?.percent != null ? (
                              <div className="mt-2">
                                <div className="h-1 w-full overflow-hidden rounded-full bg-slate-200">
                                  <div
                                    className="h-full rounded-full bg-slate-900 transition-all"
                                    style={{
                                      width: `${Math.max(0, Math.min(100, m.progress.percent))}%`,
                                    }}
                                  />
                                </div>
                                {m.progress.message || m.progress.stage ? (
                                  <div className="mt-1 text-[11px] text-slate-500">
                                    {m.progress.message || m.progress.stage}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                            {m.links && m.links.length > 0 ? (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {m.links.map((link) =>
                                  link.href.startsWith("http") ? (
                                    <a
                                      key={link.href + link.label}
                                      href={link.href}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-slate-900 underline underline-offset-2"
                                    >
                                      {link.label || t("chat.openLink")}
                                    </a>
                                  ) : (
                                    <Link
                                      key={link.href + link.label}
                                      to={link.href}
                                      className="text-slate-900 underline underline-offset-2"
                                    >
                                      {link.label || t("chat.openProject")}
                                    </Link>
                                  ),
                                )}
                              </div>
                            ) : null}
                            {m.ephemeral && Object.keys(m.ephemeral).length > 0 ? (
                              <div className="mt-2 space-y-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 font-mono text-[11px] text-slate-700">
                                {Object.entries(m.ephemeral).map(([k, v]) => {
                                  if (k === "filename") return null;
                                  if (k === "csv" && typeof v === "string") {
                                    return (
                                      <button
                                        key={k}
                                        type="button"
                                        onClick={() =>
                                          downloadCsv(
                                            v,
                                            String(m.ephemeral?.filename || "export.csv"),
                                          )
                                        }
                                        className="inline-flex items-center gap-1 text-slate-900 underline underline-offset-2"
                                      >
                                        <Download className="h-3 w-3" />
                                        {t("chat.downloadCsv")}
                                      </button>
                                    );
                                  }
                                  return (
                                    <div key={k} className="break-all">
                                      <span className="text-slate-500">{k}: </span>
                                      {typeof v === "string" ? v : JSON.stringify(v)}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : null}
                            {failed && m.tool_call_id ? (
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-[11px]"
                                  disabled={busy || !!pending}
                                  onClick={() => void retryTool(m.tool_call_id!)}
                                >
                                  <RefreshCw className="mr-1 h-3 w-3" />
                                  {t("chat.retry")}
                                </Button>
                                <span className="text-[11px] text-slate-500">
                                  {retryHint(m.tool_name)}
                                </span>
                              </div>
                            ) : null}
                          </div>
                        </motion.div>
                      );
                    }
                    if (m.role === "assistant") {
                      return (
                        <motion.div
                          key={m.id}
                          {...MESSAGE_IN}
                          className="flex gap-3"
                        >
                          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-700">
                            <Sparkles className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0 flex-1 pt-0.5">
                            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                              {t("chat.assistantLabel")}
                              {m.streaming ? (
                                <span className="ml-2 inline-flex items-center gap-1 normal-case tracking-normal text-slate-400">
                                  <LoaderCircle className="h-3 w-3 animate-spin" />
                                  {t("chat.sending")}
                                </span>
                              ) : null}
                            </div>
                            {m.content ? (
                              <MarkdownMessage content={m.content} />
                            ) : m.streaming ? (
                              <div className="text-sm leading-relaxed text-slate-800">
                                …
                              </div>
                            ) : null}
                          </div>
                        </motion.div>
                      );
                    }
                    return null;
                  })}

                  {Object.values(jobs).map((job) => (
                    <JobCardView key={`live-job-${job.job_id}`} job={job} live />
                  ))}

                  {busy && thinkingPhase ? (
                    <div className="flex gap-3">
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-700">
                        <Sparkles className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                          {t("chat.assistantLabel")}
                        </div>
                        <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                          <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin text-slate-500" />
                          <span className="leading-relaxed">
                            {thinkingLabel(thinkingPhase)}
                          </span>
                          <span className="ml-0.5 inline-flex items-center gap-1" aria-hidden>
                            <span className="h-1 w-1 rounded-full bg-slate-400 opacity-60 animate-pulse" />
                            <span className="h-1 w-1 rounded-full bg-slate-400 opacity-80 animate-pulse" />
                            <span className="h-1 w-1 rounded-full bg-slate-400 animate-pulse" />
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {pending ? (
                    <div className="rounded-md border border-slate-200 bg-card p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge variant="warning">
                              {t("chat.waitingConfirm")}
                            </Badge>
                            {pending.risk ? (
                              <Badge
                                variant={
                                  pending.risk === "destructive"
                                    ? "danger"
                                    : "secondary"
                                }
                              >
                                {pending.risk}
                              </Badge>
                            ) : null}
                            <span className="text-sm font-semibold text-slate-900">
                              {t("chat.confirmTitle")}
                            </span>
                          </div>
                          <p className="mt-1.5 text-xs text-slate-500">
                            {pending.message || t("chat.confirmHint")}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 rounded-md border border-slate-100 bg-slate-50 p-3 font-mono text-xs text-slate-700">
                        <div className="text-slate-500">
                          tool:{" "}
                          <span className="text-slate-900">{pending.name}</span>
                        </div>
                        <pre className="mt-2 max-h-40 overflow-auto text-[11px] leading-relaxed">
                          {formatArgs(pending.arguments)}
                        </pre>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => void confirmPending(true)}
                        >
                          <Check className="mr-1 h-3.5 w-3.5" />
                          {t("chat.confirm")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => void confirmPending(false)}
                        >
                          <X className="mr-1 h-3.5 w-3.5" />
                          {t("chat.reject")}
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  <div aria-hidden className="h-px w-full" />
                </div>
              )}
            </div>
          </div>

          {/* Composer outside the scroll pane — same column width via scrollbar-gutter */}
          <div className="relative shrink-0 [scrollbar-gutter:stable]">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-full h-6 bg-gradient-to-t from-background to-transparent"
            />
            <div className="mx-auto w-full max-w-3xl px-4 pb-3 pt-1 sm:px-6">
              {error ? (
                <div className="mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {error}
                </div>
              ) : null}
              <div className="flex items-end gap-2 rounded-lg border border-slate-200/90 bg-background px-2 py-1.5 shadow-[0_8px_30px_rgb(15,23,42,0.08)] ring-1 ring-slate-900/5 focus-within:border-slate-300 focus-within:shadow-[0_10px_36px_rgb(15,23,42,0.12)]">
                <textarea
                  ref={textareaRef}
                  className="max-h-32 min-h-[32px] flex-1 resize-none bg-transparent px-1.5 py-1.5 text-sm leading-5 outline-none placeholder:text-slate-400 disabled:opacity-60"
                  placeholder={isMobile ? t("chat.placeholderShort") : t("chat.placeholder")}
                  value={input}
                  disabled={!!pending}
                  rows={1}
                  onChange={(e) => {
                    setInput(e.target.value);
                    resizeTextarea();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendMessage();
                    }
                  }}
                />
                {busy ? (
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8 shrink-0 rounded-md"
                    onClick={stopGenerating}
                    title={t("chat.stop")}
                  >
                    <CircleStop className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    size="icon"
                    className="h-8 w-8 shrink-0 rounded-md"
                    disabled={!!pending || !input.trim()}
                    onClick={() => void sendMessage()}
                    title={t("chat.send")}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="mt-2 hidden text-center text-[11px] text-muted-foreground sm:block">
                {t("chat.composerHint")}
              </div>
            </div>
          </div>
        </div>
      </section>
        </Panel>
      </Group>
    </div>
  );
}