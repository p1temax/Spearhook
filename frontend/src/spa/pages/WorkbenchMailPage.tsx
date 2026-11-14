"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { ChevronUp, Plus, Send, Trash2 } from "lucide-react";
import { api } from "@/api";
import { useI18n } from "@/i18n";
import { defaultMailBody } from "./defaultMailBody";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshButton } from "@/components/ui/refresh-button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

type SmtpService = {
  id: number;
  name: string;
  from_email: string;
  enabled?: boolean;
};

type Project = {
  id: number;
  name: string;
  login_url?: string;
};

type MailView = "library" | "campaigns";

type MailCampaign = {
  id: number;
  subject: string;
  status: string;
  is_html: boolean;
  track_opens: boolean;
  sent_count: number;
  open_count: number;
  click_count: number;
  failed_count: number;
  recipient_count: number;
  template_id?: number | null;
  scheduled_at?: string;
  created_at: string;
};

type MailTemplate = {
  id: number;
  name: string;
  subject: string;
  body: string;
  is_html: boolean;
  updated_at?: string;
};

const THUMB_ASPECT_W = 16;
const THUMB_ASPECT_H = 10;
const THUMB_VIEW_W = 640;
const THUMB_VIEW_H = 400;

const selectClass = "w-full text-sm";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mailPreviewSrcDoc(body: string, isHtml: boolean) {
  if (!body.trim()) return "";
  const csp =
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src data: https: http:; style-src 'unsafe-inline'; font-src data:;\">";
  if (!isHtml) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8">${csp}<style>body{margin:24px;font:14px/1.5 sans-serif;white-space:pre-wrap;word-break:break-word;}</style></head><body>${escapeHtml(body)}</body></html>`;
  }
  const safe = body
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<script\b[^>]*>/gi, "");
  if (/<html[\s>]/i.test(safe)) {
    if (/<head[\s>]/i.test(safe)) {
      return safe.replace(/<head([^>]*)>/i, `<head$1>${csp}`);
    }
    return safe.replace(/<html([^>]*)>/i, `<html$1><head>${csp}</head>`);
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${csp}<style>body{margin:16px;}</style></head><body>${safe}</body></html>`;
}

function MailThumb({
  title,
  body,
  isHtml,
}: {
  title: string;
  body: string;
  isHtml: boolean;
}) {
  const html = useMemo(() => mailPreviewSrcDoc(body, isHtml), [body, isHtml]);
  const frameRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 0, offsetX: 0 });

  const updateFit = useCallback(() => {
    const box = frameRef.current;
    if (!box) return;
    const boxW = box.clientWidth;
    const boxH = box.clientHeight;
    if (boxW <= 0 || boxH <= 0) return;
    const scale = Math.max(boxW / THUMB_VIEW_W, boxH / THUMB_VIEW_H);
    const offsetX = (boxW - THUMB_VIEW_W * scale) / 2;
    setFit({ scale, offsetX });
  }, []);

  useLayoutEffect(() => {
    if (!html) return;
    const box = frameRef.current;
    if (!box) return;
    updateFit();
    const ro = new ResizeObserver(() => updateFit());
    ro.observe(box);
    return () => ro.disconnect();
  }, [html, updateFit]);

  const frameStyle = {
    aspectRatio: `${THUMB_ASPECT_W} / ${THUMB_ASPECT_H}`,
  } as const;

  if (!html) {
    return (
      <div
        className="flex w-full items-center justify-center bg-slate-100 text-slate-400"
        style={frameStyle}
      >
        <Send className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div
      ref={frameRef}
      className="pointer-events-none relative w-full overflow-hidden bg-white"
      style={frameStyle}
    >
      <iframe
        title={title}
        srcDoc={html}
        onLoad={updateFit}
        className="absolute top-0 border-0 bg-white"
        style={{
          width: THUMB_VIEW_W,
          height: THUMB_VIEW_H,
          left: fit.offsetX,
          transform: fit.scale ? `scale(${fit.scale})` : undefined,
          transformOrigin: "top left",
          visibility: fit.scale ? "visible" : "hidden",
        }}
        tabIndex={-1}
      />
    </div>
  );
}

export default function WorkbenchMailPage() {
  const { t, locale, dateLocale } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [smtpList, setSmtpList] = useState<SmtpService[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [templates, setTemplates] = useState<MailTemplate[]>([]);
  const [campaigns, setCampaigns] = useState<MailCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [view, setView] = useState<MailView>("library");
  const [filterTemplateId, setFilterTemplateId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState<number | null>(null);

  const [smtpServiceId, setSmtpServiceId] = useState<number | "">("");
  const [projectId, setProjectId] = useState<number | "">("");
  const [landingUrl, setLandingUrl] = useState("");
  const [recipients, setRecipients] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState(() => defaultMailBody(locale));
  const [isHtml, setIsHtml] = useState(true);
  const [trackOpens, setTrackOpens] = useState(true);
  const [templateId, setTemplateId] = useState<number | "">("");
  const [templateName, setTemplateName] = useState("");
  const [composeStep, setComposeStep] = useState<1 | 2>(1);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [pendingTemplateId, setPendingTemplateId] = useState<number | null>(null);

  useEffect(() => {
    const state = location.state as {
      recipients?: string[];
      templateId?: number;
    } | null;
    if (!state) return;
    const list = state.recipients;
    let opened = false;
    if (Array.isArray(list) && list.length) {
      const text = list.map((e) => String(e).trim()).filter(Boolean).join("\n");
      if (text) {
        setRecipients(text);
        opened = true;
      }
    }
    const incomingTemplateId = Number(state.templateId);
    if (incomingTemplateId) {
      setPendingTemplateId(incomingTemplateId);
      setComposeStep(2);
      setView("library");
      opened = true;
    }
    if (opened) setFormOpen(true);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    if (!pendingTemplateId) return;
    const tpl = templates.find((item) => item.id === pendingTemplateId);
    if (!tpl) return;
    setTemplateId(tpl.id);
    setTemplateName(tpl.name);
    setSubject(tpl.subject);
    setBody(tpl.body);
    setIsHtml(tpl.is_html);
    setPendingTemplateId(null);
  }, [pendingTemplateId, templates]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [smtpRes, projectRes, campaignRes, templateRes] = await Promise.all([
        api.getSmtpServices(),
        api.getProjects(),
        api.getMailCampaigns(),
        api.getMailTemplates(),
      ]);
      const smtpItems = (smtpRes.data || []) as SmtpService[];
      setSmtpList(smtpItems.filter((s) => s.enabled !== false));
      setProjects((projectRes.data || []) as Project[]);
      setCampaigns((campaignRes.data || []) as MailCampaign[]);
      setTemplates(Array.isArray(templateRes.data) ? (templateRes.data as MailTemplate[]) : []);
    } catch {
      setError(t("workbench.fetchFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!isHtml) setTrackOpens(false);
    else setTrackOpens(true);
  }, [isHtml]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId),
    [projects, projectId],
  );

  useEffect(() => {
    if (selectedProject?.login_url && !landingUrl.trim()) {
      setLandingUrl(selectedProject.login_url);
    }
  }, [selectedProject, landingUrl]);

  const applyTemplate = (id: number | "") => {
    setTemplateId(id);
    if (!id) {
      setTemplateName("");
      return;
    }
    const tpl = templates.find((item) => item.id === id);
    if (!tpl) return;
    setTemplateName(tpl.name);
    setSubject(tpl.subject);
    setBody(tpl.body);
    setIsHtml(tpl.is_html);
  };

  const campaignCountByTemplate = useMemo(() => {
    const counts = new Map<number, number>();
    for (const campaign of campaigns) {
      const id = Number(campaign.template_id);
      if (!id) continue;
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    return counts;
  }, [campaigns]);

  const visibleCampaigns = useMemo(() => {
    if (!filterTemplateId) return campaigns;
    return campaigns.filter((campaign) => Number(campaign.template_id) === filterTemplateId);
  }, [campaigns, filterTemplateId]);

  const filterTemplate = useMemo(
    () => templates.find((item) => item.id === filterTemplateId) || null,
    [templates, filterTemplateId],
  );

  const openLibrary = () => {
    setView("library");
    setFilterTemplateId(null);
    setFormOpen(false);
  };

  const openAllCampaigns = () => {
    setView("campaigns");
    setFilterTemplateId(null);
    setFormOpen(false);
  };

  const openTemplateCampaigns = (id: number) => {
    setView("campaigns");
    setFilterTemplateId(id);
    setFormOpen(false);
  };

  const startNewTemplate = () => {
    setView("library");
    setFilterTemplateId(null);
    applyTemplate("");
    setSubject("");
    setBody("");
    setIsHtml(true);
    setComposeStep(1);
    setFormOpen(true);
  };

  const startEditTemplate = (tpl: MailTemplate) => {
    applyTemplate(tpl.id);
    setComposeStep(1);
    setFormOpen(true);
  };

  const startSendTemplate = (tpl: MailTemplate) => {
    applyTemplate(tpl.id);
    setComposeStep(2);
    setFormOpen(true);
  };

  const onDeleteTemplate = async (tpl: MailTemplate) => {
    if (!window.confirm(t("workbench.templateDeleteConfirm"))) return;
    setDeletingTemplateId(tpl.id);
    setError("");
    setToast("");
    try {
      await api.deleteMailTemplate(tpl.id);
      if (templateId === tpl.id) {
        applyTemplate("");
        setFormOpen(false);
      }
      setToast(t("workbench.templateDeleteSuccess"));
      await load();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || t("workbench.templateDeleteFailed");
      setError(msg);
    } finally {
      setDeletingTemplateId(null);
    }
  };

  const onDeleteCampaign = async (campaign: MailCampaign) => {
    if (campaign.status === "sending") {
      setError(t("workbench.campaignDeleteRunning"));
      return;
    }
    if (!window.confirm(t("workbench.campaignDeleteConfirm"))) return;
    setDeletingId(campaign.id);
    setError("");
    setToast("");
    try {
      await api.deleteMailCampaign(campaign.id);
      setToast(t("workbench.campaignDeleteSuccess"));
      await load();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || t("workbench.campaignDeleteFailed");
      setError(msg);
    } finally {
      setDeletingId(null);
    }
  };

  const saveTemplate = async () => {
    if (!templateName.trim() || !subject.trim() || !body.trim()) {
      setError(t("workbench.templateRequired"));
      return null;
    }
    setSavingTemplate(true);
    setError("");
    try {
      const payload = {
        name: templateName.trim(),
        subject: subject.trim(),
        body,
        is_html: isHtml,
      };
      if (templateId) {
        const { data } = await api.updateMailTemplate(templateId, payload);
        const saved = data as MailTemplate;
        setTemplates((rows) =>
          rows.map((row) => (row.id === saved.id ? { ...row, ...saved } : row)),
        );
        setToast(t("workbench.templateUpdateSuccess"));
        return saved;
      }
      const { data } = await api.createMailTemplate(payload);
      const saved = data as MailTemplate;
      setTemplates((rows) => [saved, ...rows.filter((row) => row.id !== saved.id)]);
      setTemplateId(saved.id);
      setToast(t("workbench.templateCreateSuccess"));
      return saved;
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || t("workbench.templateSaveFailed");
      setError(msg);
      return null;
    } finally {
      setSavingTemplate(false);
    }
  };

  const onContinueToSend = async () => {
    if (templateId) {
      if (!subject.trim() || !body.trim()) {
        setError(t("workbench.templateRequired"));
        return;
      }
      setComposeStep(2);
      return;
    }
    const saved = await saveTemplate();
    if (saved) setComposeStep(2);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const recipientList = recipients
      .split(/[\n,;]+/)
      .map((v) => v.trim())
      .filter(Boolean);
    if (!templateId) {
      setError(t("workbench.templateNeedSave"));
      setComposeStep(1);
      return;
    }
    if (
      !smtpServiceId ||
      !subject.trim() ||
      !body.trim() ||
      recipientList.length === 0 ||
      !landingUrl.trim()
    ) {
      setError(t("workbench.requiredFields"));
      return;
    }
    setSending(true);
    setError("");
    try {
      const { data } = await api.createMailCampaign({
        smtp_service_id: smtpServiceId,
        project_id: projectId || undefined,
        template_id: templateId || undefined,
        landing_url: landingUrl.trim(),
        subject: subject.trim(),
        body,
        is_html: isHtml,
        track_opens: isHtml ? trackOpens : false,
        track_clicks: true,
        recipients: recipientList,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
      });
      setToast(
        scheduledAt ? t("workbench.scheduleSuccess") : t("workbench.sendSuccess"),
      );
      setFormOpen(false);
      navigate(`/workbench/mail/${data.id}`);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || t("workbench.sendFailed");
      setError(message);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (value?: string) => {
    if (!value) return "-";
    return new Date(value).toLocaleString(dateLocale);
  };

  const statusLabel = (status: string) => {
    if (status === "scheduled") return t("workbench.campaignStatusScheduled");
    if (status === "sending") return t("workbench.campaignStatusSending");
    if (status === "sent") return t("workbench.campaignStatusSent");
    if (status === "partial") return t("workbench.campaignStatusPartial");
    if (status === "failed") return t("workbench.campaignStatusFailed");
    return status;
  };

  const statusBadge = (status: string) => {
    const label = statusLabel(status);
    if (status === "sent") return <Badge variant="success">{label}</Badge>;
    if (status === "partial" || status === "scheduled")
      return <Badge variant="warning">{label}</Badge>;
    if (status === "failed") return <Badge variant="danger">{label}</Badge>;
    return <Badge variant="secondary">{label}</Badge>;
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      {toast ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {toast}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Send className="h-5 w-5" />
            {view === "library"
              ? t("nav.sendMail")
              : filterTemplate
                ? t("workbench.templateCampaigns")
                : t("workbench.viewCampaigns")}
          </h1>
          <p className="text-sm text-slate-500">
            {view === "library"
              ? t("workbench.mailSubtitle")
              : filterTemplate
                ? filterTemplate.name
                : t("workbench.mailSubtitle")}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            {view === "library" ? (
              <Button
                variant="link"
                className="h-auto px-0 text-sm"
                onClick={openAllCampaigns}
              >
                {t("workbench.viewCampaigns")}
              </Button>
            ) : (
              <Button
                variant="link"
                className="h-auto px-0 text-sm"
                onClick={openLibrary}
              >
                {t("nav.sendMail")}
              </Button>
            )}
            {view === "campaigns" && filterTemplate ? (
              <Button
                variant="link"
                className="h-auto px-0 text-sm"
                onClick={() => startSendTemplate(filterTemplate)}
              >
                {t("workbench.templateUse")}
              </Button>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <RefreshButton onClick={() => void load()} loading={loading} />
          <Button
            variant={formOpen ? "outline" : "default"}
            onClick={() => {
              if (formOpen) {
                setFormOpen(false);
                return;
              }
              startNewTemplate();
            }}
          >
          {formOpen ? (
            <>
              <ChevronUp className="h-4 w-4" />
              {t("workbench.collapseForm")}
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              {t("workbench.templateNew")}
            </>
          )}
        </Button>
        </div>
      </div>

      {formOpen ? (
        <Card>
          <CardContent className="px-4 py-4">
            <form
              className="space-y-3 [&_input]:h-9 [&_input]:text-sm"
              onSubmit={onSubmit}
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span
                    className={
                      composeStep === 1 ? "font-medium text-slate-800" : "text-slate-400"
                    }
                  >
                    {t("workbench.composeStepTemplate")}
                  </span>
                  <span className="text-slate-300">/</span>
                  <span
                    className={
                      composeStep === 2 ? "font-medium text-slate-800" : "text-slate-400"
                    }
                  >
                    {t("workbench.composeStepSend")}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {t("workbench.mailComposeHint")}
                </p>
              </div>

              {composeStep === 1 ? (
                <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-[8.5rem_minmax(0,1fr)] md:items-start">
                  <Label className="md:flex md:h-9 md:items-center md:justify-end md:text-right">
                    {t("workbench.selectTemplate")}
                  </Label>
                  <NativeSelect
                    className={selectClass}
                    value={templateId}
                    onChange={(e) =>
                      applyTemplate(e.target.value ? Number(e.target.value) : "")
                    }
                  >
                    <option value="">{t("workbench.selectTemplateNone")}</option>
                    {templates.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.name}
                      </option>
                    ))}
                  </NativeSelect>

                  <Label className="md:flex md:h-9 md:items-center md:justify-end md:text-right">
                    {t("workbench.templateName")}
                  </Label>
                  <div>
                    <Input
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      {t("workbench.templateNameHint")}
                    </p>
                  </div>

                  <Label className="md:flex md:h-9 md:items-center md:justify-end md:text-right">
                    {t("workbench.subject")}
                  </Label>
                  <Input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />

                  <Label className="md:flex md:h-9 md:items-center md:justify-end md:text-right">
                    {t("workbench.bodyFormat")}
                  </Label>
                  <div className="flex h-9 flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <Switch checked={isHtml} onCheckedChange={setIsHtml} />
                      {isHtml
                        ? t("workbench.formatHtml")
                        : t("workbench.formatPlain")}
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-600">
                      <Switch
                        checked={trackOpens}
                        onCheckedChange={setTrackOpens}
                        disabled={!isHtml}
                      />
                      {t("workbench.trackOpens")}
                    </label>
                  </div>

                  <Label className="md:pt-2 md:text-right">{t("workbench.body")}</Label>
                  <div>
                    <Textarea
                      rows={8}
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      className="font-mono text-sm"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      {t("workbench.placeholdersHelp")}
                      {!isHtml ? ` · ${t("workbench.plainNoOpen")}` : ""}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-[8.5rem_minmax(0,1fr)] md:items-start">
                  <Label className="md:flex md:h-9 md:items-center md:justify-end md:text-right">
                    {t("workbench.selectTemplate")}
                  </Label>
                  <div className="flex h-9 items-center text-sm text-slate-700">
                    {templateName || subject}
                  </div>

                  <Label className="md:flex md:h-9 md:items-center md:justify-end md:text-right">
                    {t("workbench.smtpService")}
                  </Label>
                  <NativeSelect
                    className={selectClass}
                    value={smtpServiceId}
                    onChange={(e) =>
                      setSmtpServiceId(e.target.value ? Number(e.target.value) : "")
                    }
                  >
                    <option value="">{t("workbench.selectSmtp")}</option>
                    {smtpList.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.from_email})
                      </option>
                    ))}
                  </NativeSelect>

                  <Label className="md:flex md:h-9 md:items-center md:justify-end md:text-right">
                    {t("workbench.projectOptional")}
                  </Label>
                  <NativeSelect
                    className={selectClass}
                    value={projectId}
                    onChange={(e) =>
                      setProjectId(e.target.value ? Number(e.target.value) : "")
                    }
                  >
                    <option value="">-</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </NativeSelect>

                  <Label className="md:flex md:h-9 md:items-center md:justify-end md:text-right">
                    {t("workbench.landingUrl")}
                  </Label>
                  <Input
                    value={landingUrl}
                    onChange={(e) => setLandingUrl(e.target.value)}
                    placeholder="https://"
                  />

                  <Label className="md:flex md:h-9 md:items-center md:justify-end md:text-right">
                    {t("workbench.recipients")}
                  </Label>
                  <div>
                    <Textarea
                      rows={3}
                      value={recipients}
                      onChange={(e) => setRecipients(e.target.value)}
                      placeholder={"a@x.com\nb@y.com"}
                      className="text-sm"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      {t("workbench.recipientsHint")}
                    </p>
                  </div>

                  <Label className="md:flex md:h-9 md:items-center md:justify-end md:text-right">
                    {t("workbench.scheduleAt")}
                  </Label>
                  <div>
                    <Input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      {t("workbench.scheduleAtHint")}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    composeStep === 2 ? setComposeStep(1) : setFormOpen(false)
                  }
                >
                  {composeStep === 2
                    ? t("workbench.templateBack")
                    : t("common.cancel")}
                </Button>
                {composeStep === 1 ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={savingTemplate}
                      onClick={() => void saveTemplate()}
                    >
                      {templateId
                        ? t("workbench.updateTemplate")
                        : t("workbench.saveAsTemplate")}
                    </Button>
                    <Button
                      type="button"
                      disabled={savingTemplate}
                      onClick={() => void onContinueToSend()}
                    >
                      {templateId
                        ? t("workbench.templateContinue")
                        : t("workbench.templateSaveContinue")}
                    </Button>
                  </>
                ) : (
                  <Button type="submit" disabled={sending || loading}>
                    {sending
                      ? t("workbench.sending")
                      : scheduledAt
                        ? t("workbench.scheduleSend")
                        : t("workbench.send")}
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {view === "library" ? (
        loading && templates.length === 0 ? (
          <Card>
            <CardContent className="px-4 py-10 text-center text-sm text-slate-500">
              …
            </CardContent>
          </Card>
        ) : templates.length === 0 ? (
          <Card>
            <CardContent className="px-4 py-10 text-center text-sm text-slate-500">
              {t("workbench.templateEmpty")}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {templates.map((row) => (
              <Card
                key={row.id}
                className="overflow-hidden transition-shadow hover:shadow-md"
              >
                <div
                  role="button"
                  tabIndex={0}
                  className="relative w-full cursor-pointer border-b bg-white text-left"
                  onClick={() => startEditTemplate(row)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      startEditTemplate(row);
                    }
                  }}
                  aria-label={t("common.edit")}
                  title={t("common.edit")}
                >
                  <MailThumb
                    title={row.name}
                    body={row.body}
                    isHtml={row.is_html}
                  />
                </div>
                <CardContent className="space-y-1 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">
                      {row.name}
                    </h2>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => startSendTemplate(row)}
                        aria-label={t("workbench.templateUse")}
                        title={t("workbench.templateUse")}
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                        disabled={deletingTemplateId === row.id}
                        onClick={() => void onDeleteTemplate(row)}
                        aria-label={t("common.delete")}
                        title={t("common.delete")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="truncate text-xs text-slate-500">{row.subject}</p>
                  <p className="text-xs text-slate-400">
                    {t("workbench.templateUpdatedAt", {
                      time: formatTime(row.updated_at),
                    })}
                  </p>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto px-0 text-xs"
                    onClick={() => openTemplateCampaigns(row.id)}
                  >
                    {t("workbench.templateTasks", {
                      count: campaignCountByTemplate.get(row.id) || 0,
                    })}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">
                    {t("workbench.campaignSubject")}
                  </th>
                  <th className="px-4 py-3 font-medium">{t("workbench.status")}</th>
                  <th className="px-4 py-3 font-medium">{t("workbench.scheduleAt")}</th>
                  <th className="px-4 py-3 font-medium">{t("workbench.funnelSent")}</th>
                  <th className="px-4 py-3 font-medium">
                    {t("workbench.funnelOpened")}
                  </th>
                  <th className="px-4 py-3 font-medium">
                    {t("workbench.funnelClicked")}
                  </th>
                  <th className="px-4 py-3 font-medium">{t("workbench.createdAt")}</th>
                  <th className="px-4 py-3 font-medium">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      …
                    </td>
                  </tr>
                ) : visibleCampaigns.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      {filterTemplateId
                        ? t("workbench.noCampaignsForTemplate")
                        : t("workbench.noCampaigns")}
                    </td>
                  </tr>
                ) : (
                  visibleCampaigns.map((c) => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">{c.subject}</td>
                      <td className="px-4 py-3">{statusBadge(c.status)}</td>
                      <td className="px-4 py-3 text-slate-500">
                        {formatTime(c.scheduled_at)}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {c.sent_count}/{c.recipient_count}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {c.is_html && c.track_opens
                          ? c.open_count
                          : t("workbench.na")}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{c.click_count}</td>
                      <td className="px-4 py-3 text-slate-500">
                        {formatTime(c.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Button variant="outline" size="sm" asChild>
                            <Link to={`/workbench/mail/${c.id}`}>
                              {t("common.details")}
                            </Link>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600 hover:bg-red-50 hover:text-red-700"
                            disabled={
                              deletingId === c.id || c.status === "sending"
                            }
                            onClick={() => onDeleteCampaign(c)}
                          >
                            {deletingId === c.id
                              ? "…"
                              : t("common.delete")}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
