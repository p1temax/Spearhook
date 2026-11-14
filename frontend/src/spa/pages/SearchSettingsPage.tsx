"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { BrainCircuit, Globe, Plus } from "lucide-react";
import { api } from "@/api";
import { useI18n } from "@/i18n";
import { SettingsTabs } from "@/components/layout/settings-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshButton } from "@/components/ui/refresh-button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
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

type SearchProvider = {
  id: string;
  label: string;
  default_base_url: string;
  requires_key: boolean;
  native?: boolean;
};

type SearchProfile = {
  id: string;
  name: string;
  enabled: boolean;
  provider: string;
  base_url: string;
  api_key: string;
  api_key_set: boolean;
  count: number;
};

type ProfileForm = {
  id: string;
  name: string;
  enabled: boolean;
  provider: string;
  base_url: string;
  api_key: string;
  count: number;
  api_key_set: boolean;
};

const fallbackProviders: SearchProvider[] = [
  { id: "auto", label: "AI Profile (native web_search)", default_base_url: "", requires_key: false, native: true },
  { id: "deepseek", label: "DeepSeek Search", default_base_url: "https://api.deepseek.com", requires_key: true },
  { id: "brave", label: "Brave Search", default_base_url: "https://api.search.brave.com/res/v1", requires_key: true },
  { id: "tavily", label: "Tavily", default_base_url: "https://api.tavily.com", requires_key: true },
  { id: "serper", label: "Serper (Google)", default_base_url: "https://google.serper.dev", requires_key: true },
  { id: "bocha", label: "Bocha 博查", default_base_url: "https://api.bochaai.com/v1", requires_key: true },
];

const emptyForm = (): ProfileForm => ({
  id: "",
  name: "",
  enabled: true,
  provider: "auto",
  base_url: "",
  api_key: "",
  count: 10,
  api_key_set: false,
});

export default function SearchSettingsPage() {
  const { t } = useI18n();
  const [profiles, setProfiles] = useState<SearchProfile[]>([]);
  const [providers, setProviders] = useState<SearchProvider[]>(fallbackProviders);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [formError, setFormError] = useState("");
  const [apiKeyDirty, setApiKeyDirty] = useState(false);
  const [testingForm, setTestingForm] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SearchProfile | null>(null);
  const [deleting, setDeleting] = useState(false);

  const activeProvider = useMemo(
    () => providers.find((p) => p.id === form.provider) || providers[0],
    [providers, form.provider],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.getSearchSettings();
      setProfiles(Array.isArray(data?.profiles) ? data.profiles : []);
      setProviders(
        Array.isArray(data?.providers) && data.providers.length
          ? data.providers
          : fallbackProviders,
      );
    } catch (err) {
      const ax = err as { response?: { data?: { error?: string } } };
      setError(ax.response?.data?.error || t("searchSettings.fetchFailed"));
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const persist = async (next: SearchProfile[], successMsg: string) => {
    setSaving(true);
    setError("");
    setToast("");
    setTestResult(null);
    try {
      const { data } = await api.updateSearchSettings({
        profiles: next.map((p) => ({
          id: p.id,
          name: p.name,
          enabled: p.enabled,
          provider: p.provider,
          base_url: p.base_url,
          api_key: p.api_key,
          count: p.count,
        })),
      });
      setProfiles(Array.isArray(data?.profiles) ? data.profiles : []);
      if (Array.isArray(data?.providers) && data.providers.length) {
        setProviders(data.providers);
      }
      setToast(successMsg);
      return true;
    } catch (err) {
      const ax = err as { response?: { data?: { error?: string } } };
      setError(ax.response?.data?.error || t("searchSettings.saveFailed"));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const openCreate = () => {
    setEditing(false);
    setForm(emptyForm());
    setApiKeyDirty(false);
    setFormError("");
    setModalOpen(true);
  };

  const openEdit = (profile: SearchProfile) => {
    setEditing(true);
    setForm({
      id: profile.id,
      name: profile.name,
      enabled: profile.enabled,
      provider: profile.provider,
      base_url: profile.base_url,
      api_key: "",
      count: profile.count,
      api_key_set: profile.api_key_set,
    });
    setApiKeyDirty(false);
    setFormError("");
    setModalOpen(true);
  };

  const onProviderChange = (id: string) => {
    const next = providers.find((p) => p.id === id);
    const previous = providers.find((p) => p.id === form.provider);
    setForm((prev) => {
      const baseWasDefault =
        !prev.base_url || prev.base_url === (previous?.default_base_url ?? "");
      const base = baseWasDefault ? next?.default_base_url ?? "" : prev.base_url;
      return { ...prev, provider: id, base_url: next?.native ? "" : base };
    });
    setFormError("");
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setFormError(t("searchSettings.requiredFields"));
      return;
    }
    const provider = form.provider || "auto";
    const native = provider === "auto";
    const baseUrl = native
      ? ""
      : form.base_url.trim() || activeProvider?.default_base_url || "";
    const count = Math.min(50, Math.max(1, form.count || 10));

    const payload: SearchProfile = {
      id: form.id,
      name,
      enabled: form.enabled,
      provider,
      base_url: baseUrl,
      api_key: apiKeyDirty ? form.api_key.trim() : "",
      api_key_set: form.api_key_set,
      count,
    };

    const next = editing
      ? profiles.map((p) => (p.id === form.id ? payload : p))
      : [...profiles, payload];

    const ok = await persist(next, t("searchSettings.saveSuccess"));
    if (ok) setModalOpen(false);
  };

  const toggleProfile = async (profile: SearchProfile) => {
    const next = profiles.map((p) =>
      p.id === profile.id
        ? { ...p, enabled: !profile.enabled, api_key: "" }
        : { ...p, api_key: "" },
    );
    await persist(
      next,
      profile.enabled
        ? t("searchSettings.disableSuccess")
        : t("searchSettings.enableSuccess"),
    );
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const next = profiles
      .filter((p) => p.id !== deleteTarget.id)
      .map((p) => ({ ...p, api_key: "" }));
    const ok = await persist(next, t("searchSettings.deleteSuccess"));
    if (ok) setDeleteTarget(null);
    setDeleting(false);
  };

  const applyTestResult = (data: {
    ok?: boolean;
    error?: string;
    latency_ms?: number;
    mode?: string;
    result_count?: number;
  }) => {
    const ok = !!data?.ok;
    const extra = data?.mode
      ? data.mode
      : data?.result_count != null
        ? t("searchSettings.testResults", { count: data.result_count })
        : "";
    const text = ok
      ? t("searchSettings.testOk", {
          ms: String(data?.latency_ms ?? 0),
          extra,
        })
      : data?.error || t("searchSettings.testFailed");
    setTestResult({ ok, text });
    return { ok, text };
  };

  const testSavedProfile = async (profile: SearchProfile) => {
    if (profile.provider !== "auto" && !profile.api_key_set) {
      setTestResult({ ok: false, text: t("searchSettings.testNeedKey") });
      return;
    }
    setTestingId(profile.id);
    setTestResult(null);
    try {
      const { data } = await api.testSearchSettings({
        id: profile.id,
        provider: profile.provider,
        base_url: profile.base_url,
        count: profile.count,
      });
      applyTestResult(data || {});
    } catch (err) {
      const ax = err as { response?: { data?: { error?: string } } };
      setTestResult({
        ok: false,
        text: ax.response?.data?.error || t("searchSettings.testFailed"),
      });
    } finally {
      setTestingId(null);
    }
  };

  const testFormConfig = async () => {
    const provider = form.provider || "auto";
    const key = apiKeyDirty ? form.api_key.trim() : "";
    if (provider !== "auto" && !key && !form.api_key_set) {
      setFormError(t("searchSettings.testNeedKey"));
      return;
    }
    setFormError("");
    setTestingForm(true);
    setTestResult(null);
    try {
      const { data } = await api.testSearchSettings({
        id: form.id || undefined,
        provider,
        base_url: form.base_url,
        api_key: key || undefined,
        count: form.count,
      });
      const result = applyTestResult(data || {});
      if (!result.ok) setFormError(result.text);
    } catch (err) {
      const ax = err as { response?: { data?: { error?: string } } };
      const text = ax.response?.data?.error || t("searchSettings.testFailed");
      setTestResult({ ok: false, text });
      setFormError(text);
    } finally {
      setTestingForm(false);
    }
  };

  const providerLabel = (id: string) =>
    providers.find((p) => p.id === id)?.label || id;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <SettingsTabs
        tabs={[
          { href: "/ai-settings", label: t("nav.aiSettings"), icon: BrainCircuit },
          { href: "/search-settings", label: t("nav.searchSettings"), icon: Globe },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Globe className="h-5 w-5" />
            {t("nav.searchSettings")}
          </h1>
          <p className="text-sm text-slate-500">{t("searchSettings.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <RefreshButton onClick={load} loading={loading || saving} />
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            {t("searchSettings.addProfile")}
          </Button>
        </div>
      </div>

      {error ? (
        <p className="whitespace-pre-line rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {toast ? (
        <p className="whitespace-pre-line rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {toast}
        </p>
      ) : null}
      {testResult ? (
        <p
          className={
            testResult.ok
              ? "whitespace-pre-line rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
              : "whitespace-pre-line rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          }
        >
          {testResult.text}
        </p>
      ) : null}

      <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        {t("searchSettings.multiHint")} {t("searchSettings.autoFallbackHint")}
      </p>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">{t("searchSettings.name")}</th>
                <th className="px-4 py-3 font-medium">{t("searchSettings.provider")}</th>
                <th className="px-4 py-3 font-medium">{t("searchSettings.baseUrl")}</th>
                <th className="px-4 py-3 font-medium">{t("searchSettings.count")}</th>
                <th className="px-4 py-3 font-medium">{t("searchSettings.status")}</th>
                <th className="px-4 py-3 font-medium">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {loading && profiles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              ) : profiles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    {t("searchSettings.empty")}
                  </td>
                </tr>
              ) : (
                profiles.map((profile) => (
                  <tr key={profile.id} className="border-b last:border-0">
                    <td className="px-4 py-3 font-medium">{profile.name}</td>
                    <td className="px-4 py-3">{providerLabel(profile.provider)}</td>
                    <td className="max-w-[260px] truncate px-4 py-3 font-mono text-xs">
                      {profile.provider === "auto" ? "—" : profile.base_url}
                    </td>
                    <td className="px-4 py-3">{profile.count}</td>
                    <td className="px-4 py-3">
                      <Badge variant={profile.enabled ? "success" : "secondary"}>
                        {profile.enabled
                          ? t("searchSettings.enabled")
                          : t("searchSettings.disabled")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={saving}
                          onClick={() => void toggleProfile(profile)}
                        >
                          {profile.enabled
                            ? t("searchSettings.disable")
                            : t("searchSettings.enable")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={testingId === profile.id || saving}
                          onClick={() => void testSavedProfile(profile)}
                        >
                          {testingId === profile.id
                            ? t("searchSettings.testing")
                            : t("searchSettings.testConfig")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEdit(profile)}
                        >
                          {t("common.edit")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={profiles.length <= 1 || saving}
                          title={
                            profiles.length <= 1
                              ? t("searchSettings.atLeastOne")
                              : undefined
                          }
                          onClick={() => setDeleteTarget(profile)}
                        >
                          {t("common.delete")}
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

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing
                ? t("searchSettings.editProfile")
                : t("searchSettings.addProfile")}
            </DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-1.5">
              <Label htmlFor="search-name">{t("searchSettings.name")}</Label>
              <Input
                id="search-name"
                value={form.name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="Brave Search"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="search-provider">{t("searchSettings.provider")}</Label>
              <NativeSelect
                id="search-provider"
                value={form.provider}
                onChange={(e) => onProviderChange(e.target.value)}
                disabled={saving}
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </NativeSelect>
              <p className="text-xs text-slate-500">
                {activeProvider?.native
                  ? t("searchSettings.nativeHint")
                  : t("searchSettings.providerHint")}
              </p>
            </div>

            {!activeProvider?.native ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="search-base">{t("searchSettings.baseUrl")}</Label>
                  <Input
                    id="search-base"
                    value={form.base_url}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, base_url: e.target.value }))
                    }
                    placeholder={activeProvider?.default_base_url || ""}
                    disabled={saving}
                  />
                  <p className="text-xs text-slate-500">
                    {t("searchSettings.baseUrlHint")}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="search-key">{t("searchSettings.apiKey")}</Label>
                  <Input
                    id="search-key"
                    type="password"
                    value={form.api_key}
                    onChange={(e) => {
                      setApiKeyDirty(true);
                      setForm((prev) => ({ ...prev, api_key: e.target.value }));
                    }}
                    placeholder={
                      form.api_key_set
                        ? t("searchSettings.apiKeyKeep")
                        : t("searchSettings.apiKeyPlaceholder")
                    }
                    disabled={saving}
                    autoComplete="new-password"
                  />
                  <p className="text-xs text-slate-500">
                    {t("searchSettings.apiKeyHint")}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="search-count">{t("searchSettings.count")}</Label>
                  <Input
                    id="search-count"
                    type="number"
                    min={1}
                    max={50}
                    value={form.count}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        count: Number(e.target.value) || 1,
                      }))
                    }
                    disabled={saving}
                  />
                  <p className="text-xs text-slate-500">
                    {t("searchSettings.countHint")}
                  </p>
                </div>
              </>
            ) : null}

            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <div className="text-sm font-medium">
                  {t("searchSettings.enableThis")}
                </div>
                <div className="text-xs text-slate-500">
                  {t("searchSettings.multiHint")}
                </div>
              </div>
              <Switch
                checked={form.enabled}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, enabled: checked }))
                }
              />
            </div>

            {formError ? (
              <p className="text-sm text-red-600">{formError}</p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalOpen(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={testingForm || saving}
                onClick={() => void testFormConfig()}
              >
                {testingForm
                  ? t("searchSettings.testing")
                  : t("searchSettings.testConfig")}
              </Button>
              <Button type="submit" disabled={saving || testingForm}>
                {saving ? "…" : t("common.confirm")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("searchSettings.deleteConfirm", {
                name: deleteTarget?.name || "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={deleting}>
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
