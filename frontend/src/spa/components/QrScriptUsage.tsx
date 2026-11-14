"use client";

import { useState } from "react";

import { ChevronRight } from "lucide-react";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const SCRIPT_COMMANDS = `brew install zbar

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

python qr_relay.py --pick-region -c config.yaml
python qr_relay.py -c config.yaml`;

export function QrScriptUsage() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardContent className="p-4">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-2 text-left text-sm font-medium text-slate-800"
            >
              <span className="flex-1">{t("workbench.qrScriptUsageTitle")}</span>
              <ChevronRight className={cn(
                "h-4 w-4 shrink-0 text-slate-400 transition-transform",
                open && "rotate-90",
              )} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-3">
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-600">
              <li>{t("workbench.qrScriptStep1")}</li>
              <li>{t("workbench.qrScriptStep2")}</li>
              <li>{t("workbench.qrScriptStep3")}</li>
              <li>{t("workbench.qrScriptStep4")}</li>
            </ol>
            <pre className="overflow-x-auto rounded-md bg-slate-50 p-3 text-xs text-slate-700">
              {SCRIPT_COMMANDS}
            </pre>
            <p className="text-xs text-slate-500">{t("workbench.qrScriptNote")}</p>
          </CollapsibleContent>
        </CardContent>
      </Card>
    </Collapsible>
  );
}
