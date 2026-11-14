"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Plus } from "lucide-react";
import { api } from "@/api";
import { isAdminRole, useAuthStore } from "@/auth/auth-store";
import { useI18n } from "@/i18n";
import {
  buildAccessUrl,
  getProjectRuntimeStatus,
} from "@/utils/projectDetailHelpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FileUpload } from "@/components/ui/file-upload";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Robot = { id: number; name: string };
type Agent = {
  id: number;
  name: string;
  hostname?: string;
  agent_id?: string;
  status?: string;
};
type QrRelayOption = { id: number; name: string; slug?: string; enabled?: boolean };
type PageBuilderOption = { id: number; name: string; url?: string };

export type ProjectRow = {
  id: number;
  name: string;
  run_mode?: string;
  frontend_route?: string;
  login_url?: string;
  port?: number;
  use_https?: boolean;
  has_ssl_cert?: boolean;
  container_status?: string;
  container_id?: string;
  build_status?: string;
  docker_image?: string;
  robot_ids?: number[];
  agent_ids?: number[];
  robots?: Robot[];
  qr_relay_id?: number | null;
  deployments?: {
    id?: number;
    runtime_url?: string;
    actual_status?: string;
    runtime_port?: number;
  }[];
};

const PLATFORM = "platform";
const NAME_RE = /^[A-Za-z0-9-]+$/;

function projectRunMode(record: ProjectRow) {
  return record.run_mode === "local" ? "local" : "docker";
}

function isLocalProject(record: ProjectRow) {
  return (
    projectRunMode(record) === "local" ||
    String(record.container_id || "").startsWith("local:")
  );
}

/** True when the project is (or will be) hosted on remote Agents. */
function isAgentHosted(record: ProjectRow) {
  if ((record.deployments || []).length > 0) return true;
  return (record.agent_ids || []).some(
    (id) => String(id) !== PLATFORM && Number(id) > 0,
  );
}

function extractError(err: unknown, fallback: string) {
  const ax = err as {
    response?: {
      status?: number;
      data?: Record<string, unknown> | string;
    };
    message?: string;
  };
  const data = ax.response?.data;
  if (typeof data === "string" && data) return data;
  if (data && typeof data === "object") {
    if (typeof data.msg === "string") return data.msg;
    if (typeof data.error === "string") return data.error;
    if (typeof data.message === "string") return data.message;
    const firstKey = Object.keys(data)[0];
    const first = firstKey ? data[firstKey] : undefined;
    if (Array.isArray(first) && typeof first[0] === "string") return first[0];
  }
  return ax.message || fallback;
}

type FormState = {
  name: string;
  run_mode: "docker" | "local";
  frontend_route: string;
  login_url: string;
  use_https: boolean;
  port: number;
  robots: number[];
  agent_ids: (number | string)[];
  qr_relay_id: string;
  phishing_page_id: string;
};

const emptyForm = (): FormState => ({
  name: "",
  run_mode: "docker",
  frontend_route: "",
  login_url: "",
  use_https: false,
  port: 8080,
  robots: [],
  agent_ids: [PLATFORM],
  qr_relay_id: "",
  phishing_page_id: "",
});

export default function ProjectListPage() {
  const { t } = useI18n();
  const isAdmin = isAdminRole(useAuthStore((s) => s.user)?.role);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [robots, setRobots] = useState<Robot[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [qrRelays, setQrRelays] = useState<QrRelayOption[]>([]);
  const [pageBuilderPages, setPageBuilderPages] = useState<PageBuilderOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: "ok" | "err" | "info"; text: string } | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [certFile, setCertFile] = useState<File | null>(null);
  const [keyFile, setKeyFile] = useState<File | null>(null);
  const [existingSSL, setExistingSSL] = useState(false);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ProjectRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [startingId, setStartingId] = useState<number | null>(null);
  const [stoppingId, setStoppingId] = useState<number | null>(null);

  const anyTask = startingId !== null || stoppingId !== null;

  const showToast = useCallback((type: "ok" | "err" | "info", text: string) => {
    setToast({ type, text });
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.getProjects();
      setProjects(Array.isArray(data) ? data : []);
    } catch {
      showToast("err", t("project.fetchListFailed"));
    } finally {
      setLoading(false);
    }
  }, [showToast, t]);

  const fetchRobots = useCallback(async () => {
    try {
      const { data } = await api.getRobots();
      setRobots(Array.isArray(data) ? data : []);
    } catch {
      showToast("err", t("project.fetchRobotsFailed"));
    }
  }, [showToast, t]);

  const fetchAgents = useCallback(async () => {
    try {
      const { data } = await api.getAgents();
      setAgents(Array.isArray(data) ? data : []);
    } catch {
      showToast("err", t("project.fetchAgentsFailed"));
    }
  }, [showToast, t]);

  const fetchQrRelays = useCallback(async () => {
    try {
      const { data } = await api.getQrRelays();
      setQrRelays(Array.isArray(data) ? (data as QrRelayOption[]) : []);
    } catch {
      showToast("err", t("project.qrRelayFetchFailed"));
    }
  }, [showToast, t]);

  const fetchPageBuilderPages = useCallback(async () => {
    try {
      const { data } = await api.getPhishingPages();
      setPageBuilderPages(Array.isArray(data) ? (data as PageBuilderOption[]) : []);
    } catch {
      showToast("err", t("project.pageBuilderFetchFailed"));
    }
  }, [showToast, t]);

  useEffect(() => {
    fetchProjects();
    fetchRobots();
    fetchAgents();
    fetchQrRelays();
    fetchPageBuilderPages();
  }, [fetchProjects, fetchRobots, fetchAgents, fetchQrRelays, fetchPageBuilderPages]);

  const accessUrl = (record: ProjectRow) =>
    buildAccessUrl(record, typeof window !== "undefined" ? window.location.hostname : "localhost");

  const openCreate = () => {
    setModalMode("create");
    setEditingId(null);
    setForm(emptyForm());
    setCertFile(null);
    setKeyFile(null);
    setExistingSSL(false);
    setFormError("");
    setModalOpen(true);
  };

  const openEdit = (record: ProjectRow) => {
    setModalMode("edit");
    setEditingId(record.id);
    setForm({
      name: record.name || "",
      run_mode: projectRunMode(record) as "docker" | "local",
      frontend_route: record.frontend_route || "",
      login_url: record.login_url || "",
      use_https: !!record.use_https,
      port: record.port || 8080,
      robots: record.robot_ids || [],
      agent_ids: record.agent_ids?.length ? record.agent_ids : [PLATFORM],
      qr_relay_id: record.qr_relay_id ? String(record.qr_relay_id) : "",
      phishing_page_id: "",
    });
    setCertFile(null);
    setKeyFile(null);
    setExistingSSL(!!record.has_ssl_cert);
    setFormError("");
    setModalOpen(true);
  };

  const onAgentIdsChange = (vals: string[]) => {
    const prev = form.agent_ids.map(String);
    const added = vals.filter((v) => !prev.includes(v));
    let next = vals;
    if (added.includes(PLATFORM)) {
      next = [PLATFORM];
    } else {
      next = vals.filter((v) => v !== PLATFORM);
    }
    if (next.length === 0) next = [PLATFORM];
    setForm({
      ...form,
      agent_ids: next.map((v) => (v === PLATFORM ? PLATFORM : Number(v))),
    });
  };

  const validateForm = () => {
    if (!form.name.trim()) return t("project.nameRequired");
    if (!NAME_RE.test(form.name)) return t("project.namePattern");
    if (!form.run_mode) return t("project.runModeRequired");
    if (!form.frontend_route.trim()) return t("project.frontendRouteRequired");
    if (!form.login_url.trim()) return t("project.originUrlRequired");
    if (!form.port) return t("project.servicePortRequired");
    if (modalMode === "create" && !form.phishing_page_id) {
      return t("project.htmlPageRequired");
    }
    if (!form.robots.length) return t("project.pushChannelsRequired");
    if (!form.agent_ids.length) return t("project.deployAgentsRequired");
    if (form.use_https) {
      const hasAny = !!certFile || !!keyFile;
      const hasBoth = !!certFile && !!keyFile;
      if (hasAny && !hasBoth) return t("project.sslNeedPair");
      if (!existingSSL && !hasBoth) return t("project.sslRequired");
    }
    return "";
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const err = validateForm();
    if (err) {
      setFormError(err);
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const fd = new FormData();
      fd.append("name", form.name);
      fd.append("run_mode", form.run_mode);
      fd.append("frontend_route", form.frontend_route);
      fd.append("login_url", form.login_url);
      fd.append("use_https", String(form.use_https));
      fd.append("port", String(form.port));
      fd.append("robots", JSON.stringify(form.robots));
      const agentIds = form.agent_ids.filter((id) => id !== PLATFORM);
      fd.append("agent_ids", JSON.stringify(agentIds));
      fd.append("qr_relay_id", form.qr_relay_id || "");
      if (form.phishing_page_id) {
        fd.append("phishing_page_id", form.phishing_page_id);
      }
      if (form.use_https && certFile) fd.append("ssl_cert_file", certFile);
      if (form.use_https && keyFile) fd.append("ssl_key_file", keyFile);

      if (editingId) {
        await api.updateProject(editingId, fd);
        showToast("ok", t("project.updateSuccess"));
      } else {
        await api.createProject(fd);
        showToast("ok", t("project.createSuccess"));
      }
      setModalOpen(false);
      fetchProjects();
    } catch (error) {
      setFormError(extractError(error, t("common.operationFailed")));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (record: ProjectRow) => {
    const mode = projectRunMode(record);
    const runtimeStatus = getProjectRuntimeStatus(record);
    const isStopping = runtimeStatus === "running";

    if (isStopping) {
      setStoppingId(record.id);
      try {
        const res =
          isLocalProject(record)
            ? await api.stopLocalProject(record.id)
            : await api.stopProject(record.id);
        const status = res.data?.status;
        if (status === "stopping") {
          await fetchProjects();
          const check = window.setInterval(async () => {
            try {
              const { data } = await api.getProject(record.id);
              if (data.container_status === "stopped") {
                window.clearInterval(check);
                showToast("ok", t("project.stopSucceeded"));
                await fetchProjects();
                setStoppingId(null);
              }
            } catch {
              /* keep polling */
            }
          }, 2000);
          window.setTimeout(async () => {
            window.clearInterval(check);
            await fetchProjects();
            setStoppingId(null);
          }, 30000);
          return;
        }
        if (status === "stopped") {
          showToast("ok", t("project.stopActionSucceeded"));
        } else if (status === "already_stopped") {
          showToast("info", t("project.alreadyStopped"));
        } else {
          showToast("info", res.data?.msg || t("common.operationUnknown"));
        }
        await fetchProjects();
        setStoppingId(null);
      } catch (error) {
        const ax = error as { response?: { status?: number }; code?: string };
        if (ax.response?.status === 500 || ax.code === "NETWORK_ERROR") {
          showToast("info", t("project.stopInProgress"));
        } else {
          showToast("err", extractError(error, t("common.operationFailed")));
        }
        setStoppingId(null);
      }
      return;
    }

    setStartingId(record.id);
    try {
      const res =
        mode === "local"
          ? await api.startLocalProject(record.id)
          : await api.startProject(record.id);
      if (res.data?.status === "started") {
        showToast(
          "ok",
          mode === "local"
            ? t("project.startLocalSuccess")
            : t("project.startDockerSuccess"),
        );
      } else {
        showToast("info", res.data?.msg || t("common.operationUnknown"));
      }
    } catch (error) {
      const ax = error as { response?: { status?: number } };
      if (ax.response?.status === 500) {
        showToast("info", t("project.actionMayCompleted"));
      } else {
        showToast("err", extractError(error, t("common.operationFailed")));
      }
    } finally {
      await fetchProjects();
      setStartingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await api.deleteProject(deleteTarget.id);
      showToast(
        "ok",
        res.status === 202
          ? t("project.remoteDeleteQueued")
          : t("project.deleteSuccess"),
      );
      setDeleteTarget(null);
      fetchProjects();
    } catch (error) {
      const ax = error as { response?: { status?: number } };
      if (ax.response?.status === 500) {
        showToast("info", t("project.deleteMaybeDone"));
        window.setTimeout(fetchProjects, 1000);
        setDeleteTarget(null);
      } else {
        showToast("err", extractError(error, t("project.deleteFailed")));
      }
    } finally {
      setDeleting(false);
    }
  };

  const runActionText = (record: ProjectRow) => {
    if (isAgentHosted(record)) return t("project.manageRuntime");
    if (getProjectRuntimeStatus(record) === "running") return t("project.stop");
    return projectRunMode(record) === "local"
      ? t("project.startLocal")
      : t("project.startContainer");
  };

  const runDisabled = (record: ProjectRow) => {
    if (isAgentHosted(record)) return false;
    const runtimeStatus = getProjectRuntimeStatus(record);
    return (
      record.build_status === "building" ||
      (runtimeStatus !== "running" &&
        projectRunMode(record) === "docker" &&
        !record.docker_image)
    );
  };

  const statusBadge = (record: ProjectRow) => {
    const runtimeStatus = getProjectRuntimeStatus(record);
    if (runtimeStatus === "stopping") {
      return <Badge variant="warning">{t("project.stopping")}</Badge>;
    }
    if (runtimeStatus === "starting") {
      return <Badge variant="warning">{t("project.starting")}</Badge>;
    }
    if (runtimeStatus === "running") {
      return (
        <Badge variant="success">
          {isAgentHosted(record)
            ? t("project.agentRunning")
            : isLocalProject(record)
              ? t("project.localRunning")
              : t("project.containerRunning")}
        </Badge>
      );
    }
    return <Badge variant="danger">{t("project.stopped")}</Badge>;
  };

  const runModeBadge = (record: ProjectRow) => {
    if (isAgentHosted(record)) {
      return <Badge variant="secondary">Agent</Badge>;
    }
    return (
      <Badge
        variant={
          projectRunMode(record) === "local" ? "secondary" : "outline"
        }
      >
        {projectRunMode(record) === "local"
          ? t("project.localFlask")
          : t("project.docker")}
      </Badge>
    );
  };

  const modalTitle = useMemo(
    () =>
      t(modalMode === "edit" ? "project.editProject" : "project.newProject"),
    [modalMode, t],
  );

  return (
    <div className="space-y-4 p-4 md:p-6">
      {toast ? (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            toast.type === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : toast.type === "err"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          {toast.text}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t("nav.projects")}</h1>
          <p className="text-sm text-slate-500">{t("project.subtitle")}</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          {t("project.newProject")}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">{t("project.projectName")}</th>
                <th className="px-4 py-3 font-medium">{t("project.accessUrl")}</th>
                <th className="px-4 py-3 font-medium">{t("project.runMode")}</th>
                <th className="px-4 py-3 font-medium">{t("project.status")}</th>
                <th className="px-4 py-3 font-medium">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    …
                  </td>
                </tr>
              ) : projects.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    {t("common.noData")}
                  </td>
                </tr>
              ) : (
                projects.map((record) => (
                  <tr key={record.id} className="border-b last:border-0">
                    <td className="px-4 py-3 font-medium">{record.name}</td>
                    <td className="px-4 py-3">
                      <a
                        className="break-all text-foreground underline decoration-muted-foreground underline-offset-2 hover:decoration-foreground"
                        href={accessUrl(record)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {accessUrl(record)}
                      </a>
                    </td>
                    <td className="px-4 py-3">{runModeBadge(record)}</td>
                    <td className="px-4 py-3">{statusBadge(record)}</td>
                    <td className="px-4 py-3">
                      {startingId === record.id ? (
                        <span className="text-slate-500">{t("project.starting")}</span>
                      ) : stoppingId === record.id ? (
                        <span className="text-slate-500">{t("project.stopping")}</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {isAgentHosted(record) ? (
                            <Button
                              variant="link"
                              size="sm"
                              className="h-auto px-1"
                              asChild
                            >
                              <Link
                                to={`/projects/${record.id}/deployments`}
                              >
                                {runActionText(record)}
                              </Link>
                            </Button>
                          ) : (
                            <Button
                              variant="link"
                              size="sm"
                              className="h-auto px-1"
                              disabled={runDisabled(record) || anyTask}
                              onClick={() => handleToggleStatus(record)}
                            >
                              {runActionText(record)}
                            </Button>
                          )}
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto px-1"
                            asChild
                          >
                            <Link to={`/projects/${record.id}`}>
                              {t("common.details")}
                            </Link>
                          </Button>
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto px-1"
                            onClick={() => openEdit(record)}
                          >
                            {t("common.edit")}
                          </Button>
                          {isAdmin ? (
                            <Button
                              variant="link"
                              size="sm"
                              className="h-auto px-1 text-red-600"
                              onClick={() => setDeleteTarget(record)}
                            >
                              {t("common.delete")}
                            </Button>
                          ) : null}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{modalTitle}</DialogTitle>
          </DialogHeader>
          <form className="space-y-3 [&_input]:h-9 [&_input]:text-sm" onSubmit={onSubmit}>
            <div className="grid w-full grid-cols-[8.5rem_minmax(0,1fr)] items-start gap-x-4 gap-y-3.5">
              <Label
                htmlFor="name"
                className="flex h-9 items-center justify-end whitespace-nowrap text-right text-sm leading-none"
              >
                {t("project.projectName")}
              </Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t("project.namePlaceholder")}
              />

              <Label className="flex h-9 items-center justify-end whitespace-nowrap text-right text-sm leading-none">
                {t("project.runMode")}
              </Label>
              <div className="flex min-h-9 flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={form.run_mode === "docker" ? "default" : "outline"}
                  onClick={() => setForm({ ...form, run_mode: "docker" })}
                >
                  Docker
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={form.run_mode === "local" ? "default" : "outline"}
                  onClick={() => setForm({ ...form, run_mode: "local" })}
                >
                  {t("project.localFlask")}
                </Button>
                <span className="text-xs text-slate-500">
                  {t("project.runModeHelp")}
                </span>
              </div>

              <Label
                htmlFor="frontend_route"
                className="flex h-9 items-center justify-end whitespace-nowrap text-right text-sm leading-none"
              >
                {t("project.frontendRoute")}
              </Label>
              <Input
                id="frontend_route"
                value={form.frontend_route}
                onChange={(e) =>
                  setForm({ ...form, frontend_route: e.target.value })
                }
                placeholder={t("project.frontendRoutePlaceholder")}
              />

              <Label
                htmlFor="login_url"
                className="flex h-9 items-center justify-end whitespace-nowrap text-right text-sm leading-none"
              >
                {t("project.originUrl")}
              </Label>
              <Input
                id="login_url"
                value={form.login_url}
                onChange={(e) =>
                  setForm({ ...form, login_url: e.target.value })
                }
                placeholder={t("project.originUrlPlaceholder")}
              />

              <Label
                htmlFor="qr_relay_id"
                className="flex h-9 items-center justify-end whitespace-nowrap text-right text-sm leading-none"
              >
                {t("project.qrRelay")}
              </Label>
              <div className="space-y-1">
                <NativeSelect
                  id="qr_relay_id"
                  value={form.qr_relay_id}
                  onChange={(e) =>
                    setForm({ ...form, qr_relay_id: e.target.value })
                  }
                >
                  <option value="">{t("project.qrRelayNone")}</option>
                  {qrRelays.map((relay) => (
                    <option key={relay.id} value={String(relay.id)}>
                      {relay.name}
                      {relay.enabled === false ? " (paused)" : ""}
                    </option>
                  ))}
                </NativeSelect>
                <p className="text-xs text-slate-500">{t("project.qrRelayHint")}</p>
              </div>

              <Label
                htmlFor="port"
                className="flex h-9 items-center justify-end whitespace-nowrap text-right text-sm leading-none"
              >
                {form.run_mode === "local"
                  ? t("project.localPort")
                  : t("project.mappedPort")}
              </Label>
              <div className="space-y-1">
                <Input
                  id="port"
                  type="number"
                  min={8080}
                  max={8180}
                  className="w-28"
                  value={form.port}
                  onChange={(e) =>
                    setForm({ ...form, port: Number(e.target.value) || 8080 })
                  }
                  placeholder={
                    form.run_mode === "local"
                      ? t("project.localPortPlaceholder")
                      : t("project.mappedPortPlaceholder")
                  }
                />
                <p className="text-xs text-slate-500">
                  {form.run_mode === "local"
                    ? t("project.localPortTip")
                    : t("project.mappedPortTip")}
                </p>
              </div>

              <Label
                htmlFor="phishing_page_id"
                className="flex h-9 items-center justify-end whitespace-nowrap text-right text-sm leading-none"
              >
                {t("project.pageBuilderPage")}
              </Label>
              <div className="space-y-1">
                <NativeSelect
                  id="phishing_page_id"
                  value={form.phishing_page_id}
                  onChange={(e) => {
                    const phishing_page_id = e.target.value;
                    const page = pageBuilderPages.find(
                      (item) => String(item.id) === phishing_page_id,
                    );
                    setForm({
                      ...form,
                      phishing_page_id,
                      login_url: page?.url?.trim() || form.login_url,
                    });
                  }}
                >
                  <option value="">
                    {modalMode === "edit"
                      ? t("project.pageBuilderKeepCurrent")
                      : t("project.pageBuilderSelect")}
                  </option>
                  {pageBuilderPages.map((page) => (
                    <option key={page.id} value={String(page.id)}>
                      {page.name}
                    </option>
                  ))}
                </NativeSelect>
                <p className="text-xs text-slate-500">
                  {pageBuilderPages.length === 0 ? (
                    <>
                      {t("project.pageBuilderEmpty")}{" "}
                      <Link
                        to="/workbench/page-builder"
                        className="underline underline-offset-2"
                      >
                        {t("nav.pageBuilder")}
                      </Link>
                    </>
                  ) : (
                    t("project.pageBuilderHint")
                  )}
                </p>
              </div>

              <Label className="flex h-9 items-center justify-end whitespace-nowrap text-right text-sm leading-none">
                {t("project.pushChannels")}
              </Label>
              <MultiSelect
                options={robots.map((robot) => ({
                  value: String(robot.id),
                  label: robot.name,
                }))}
                value={form.robots.map(String)}
                onChange={(vals) =>
                  setForm({
                    ...form,
                    robots: vals.map((v) => Number(v)).filter((n) => !Number.isNaN(n)),
                  })
                }
                placeholder={t("project.pushChannelsPlaceholder")}
                emptyText={t("common.noData")}
              />

              <Label className="flex h-9 items-center justify-end whitespace-nowrap text-right text-sm leading-none">
                {t("project.deployAgents")}
              </Label>
              <div className="space-y-1">
                <MultiSelect
                  options={[
                    {
                      value: PLATFORM,
                      label: t("project.deployOnPlatform"),
                    },
                    ...agents.map((agent) => ({
                      value: String(agent.id),
                      label: `${agent.name} · ${agent.hostname || agent.agent_id} · ${
                        agent.status === "online"
                          ? t("agent.online")
                          : t("agent.offline")
                      }`,
                      disabled: agent.status !== "online",
                    })),
                  ]}
                  value={form.agent_ids.map(String)}
                  onChange={onAgentIdsChange}
                  placeholder={t("project.deployAgentsPlaceholder")}
                  emptyText={t("common.noData")}
                />
                <p className="text-xs text-slate-500">
                  {form.agent_ids.includes(PLATFORM)
                    ? t("project.deployOnPlatformTip")
                    : t("project.deployAgentsTip")}
                </p>
              </div>

              <Label
                htmlFor="use_https"
                className="flex h-9 items-center justify-end whitespace-nowrap text-right text-sm leading-none"
              >
                {t("project.enableSSL")}
              </Label>
              <div className="flex h-9 items-center">
                <Switch
                  id="use_https"
                  checked={form.use_https}
                  onCheckedChange={(use_https) => {
                    setForm({ ...form, use_https });
                    if (!use_https) {
                      setCertFile(null);
                      setKeyFile(null);
                    }
                  }}
                />
              </div>
            </div>

            {form.use_https ? (
              <div className="grid w-full grid-cols-[8.5rem_minmax(0,1fr)] items-start gap-x-4 gap-y-3.5 rounded-md border bg-slate-50 p-3">
                <Label className="flex h-9 items-center justify-end whitespace-nowrap text-right text-sm leading-none">
                  {t("project.uploadCert")}
                </Label>
                <FileUpload
                  id="ssl_cert"
                  accept=".pem,.crt,.cer"
                  value={certFile}
                  onChange={setCertFile}
                  buttonLabel={t("project.uploadCert")}
                />
                <Label className="flex h-9 items-center justify-end whitespace-nowrap text-right text-sm leading-none">
                  {t("project.uploadKey")}
                </Label>
                <div className="space-y-1">
                  <FileUpload
                    id="ssl_key"
                    accept=".key,.pem"
                    value={keyFile}
                    onChange={setKeyFile}
                    buttonLabel={t("project.uploadKey")}
                  />
                  <p className="text-xs text-slate-500">{t("project.sslTip")}</p>
                </div>
              </div>
            ) : null}

            {formError ? (
              <p className="text-sm text-red-600">{formError}</p>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalOpen(false)}
                disabled={saving}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving
                  ? "…"
                  : modalMode === "edit"
                    ? t("common.update")
                    : t("common.create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("project.deleteConfirm", { name: deleteTarget?.name || "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
            >
              {deleting ? "…" : t("common.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
