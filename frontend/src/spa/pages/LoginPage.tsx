"use client";

import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { api } from "@/api";
import { useAuthStore } from "@/auth/auth-store";
import { useI18n } from "@/i18n";
import { DEMO_MODE } from "@/demo/config";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandLogo } from "@/components/brand-logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";

export default function LoginPage() {
  const { t } = useI18n();
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();
  const [username, setUsername] = useState(DEMO_MODE ? "demo" : "");
  const [password, setPassword] = useState(DEMO_MODE ? "demo" : "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { data } = await api.login({ username, password });
      setAuth(data.access, {
        id: Number(data.user?.id),
        username: String(data.user?.username || username),
        role: data.user?.role === "operator" ? "operator" : "admin",
      });
      navigate("/", { replace: true });
    } catch (err: unknown) {
      const ax = err as {
        response?: { data?: { message?: string; error?: string } };
      };
      setError(
        ax.response?.data?.message ||
          ax.response?.data?.error ||
          t("login.failed"),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center bg-muted p-4 dark:bg-background sm:p-6 md:p-8 lg:p-10">
      <div className="absolute right-3 top-3 flex items-center gap-1 sm:right-4 sm:top-4">
        <ThemeToggle />
        <LanguageSwitcher compact align="end" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        className="flex w-full max-w-sm flex-col gap-4 md:max-w-[min(90vw,48rem)]"
      >
        <Card className="overflow-hidden rounded-xl border border-border p-0 shadow-sm">
          <CardContent className="grid p-0 md:grid-cols-2 md:min-h-[28rem]">
            <form
              className="flex flex-col justify-center p-5 sm:p-6 md:px-7 md:py-7"
              onSubmit={onSubmit}
            >
              <div className="mx-auto flex w-full max-w-sm flex-col gap-4 sm:gap-5">
                <div className="flex flex-col items-center gap-4 text-center sm:gap-5">
                  <h1 className="flex items-center gap-2.5 text-xl font-semibold sm:text-2xl">
                    <BrandLogo size={44} colored title={t("app.title")} />
                    <span className="font-brand tracking-[0.14em] text-foreground">
                      {t("app.title")}
                    </span>
                  </h1>
                  <p className="text-balance text-xs text-muted-foreground sm:text-sm">
                    {t("app.motto")}
                  </p>
                </div>

                {/* Larger spacing between username / password / submit */}
                <div className="flex flex-col gap-6 sm:gap-7">
                  <div className="grid gap-2">
                    <Label htmlFor="username">{t("login.username")}</Label>
                    <Input
                      id="username"
                      className="h-9"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder={t("login.username")}
                      autoComplete="username"
                      required
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="password">{t("login.password")}</Label>
                    <Input
                      id="password"
                      type="password"
                      className="h-9"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t("login.password")}
                      autoComplete="current-password"
                      required
                    />
                  </div>

                  {error ? (
                    <p className="text-sm text-destructive">{error}</p>
                  ) : null}

                  <Button type="submit" className="h-9 w-full" disabled={loading}>
                    {loading ? "…" : t("login.submit")}
                  </Button>
                  {DEMO_MODE ? (
                    <p className="text-center text-xs text-muted-foreground">
                      {t("login.demoHint")}
                    </p>
                  ) : null}
                </div>
              </div>
            </form>

            <div className="relative hidden bg-muted md:block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/login-cover.jpg`}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
            </div>
          </CardContent>
        </Card>

        <p className="px-2 text-center text-xs text-muted-foreground sm:text-sm">
          {t("app.subtitle")}
        </p>
      </motion.div>
    </div>
  );
}
