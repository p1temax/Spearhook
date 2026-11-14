"use client";

import { useState } from "react";

import { Check, Languages } from "lucide-react";
import { useI18n } from "@/i18n";
import { LOCALES, getLocale } from "@/i18n/locales";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type LanguageSwitcherProps = {
  compact?: boolean;
  align?: "start" | "center" | "end";
  className?: string;
};

/** Language picker shared by the login screen and the console header. */
export function LanguageSwitcher({
  compact = false,
  align = "end",
  className,
}: LanguageSwitcherProps) {
  const { t, locale, setLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const current = getLocale(locale);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={compact ? "icon" : "sm"}
          className={cn("gap-2 text-slate-600", className)}
          aria-label={`${t("locale.language")}: ${current.englishName}`}
          title={t("locale.language")}
        >
          <Languages className="h-4 w-4" />
          {!compact ? (
            <span className="hidden text-sm sm:inline">{current.nativeName}</span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-60 p-1">
        <div className="px-2 py-1.5 text-xs font-medium text-slate-500">
          {t("locale.language")}
        </div>
        {LOCALES.map((item) => {
          const active = item.code === locale;
          return (
            <button
              key={item.code}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setLocale(item.code);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-sm px-2 py-2 text-left transition-colors hover:bg-slate-100",
                active && "bg-slate-50",
              )}
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm text-slate-900">
                  {item.nativeName}
                </span>
                {item.nativeName !== item.englishName ? (
                  <span className="truncate text-xs text-slate-500">
                    {item.englishName}
                  </span>
                ) : null}
              </span>
              {active ? (
                <Check className="h-4 w-4 shrink-0 text-slate-900" />
              ) : null}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
