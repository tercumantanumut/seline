"use client";

import type { FC } from "react";
import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useToolExpansion } from "./tool-expansion-context";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export const ExpandAllToolsButton: FC = () => {
  const ctx = useToolExpansion();
  const t = useTranslations("assistantUi.tools");

  if (!ctx) return null;

  // After first toggle, mode reflects the LAST action taken.
  // If counter is 0 (never toggled), next action will be "expand".
  const nextAction = ctx.signal.counter === 0 ? "expand" : ctx.signal.mode;
  const isExpanded = nextAction === "collapse";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={ctx.toggleAll}
          className="absolute -top-10 left-0 rounded-full bg-terminal-cream text-terminal-dark hover:bg-terminal-dark hover:text-terminal-cream shadow-md"
        >
          {isExpanded ? (
            <ChevronsDownUp className="size-4" />
          ) : (
            <ChevronsUpDown className="size-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {isExpanded ? t("collapseAll") : t("expandAll")}
      </TooltipContent>
    </Tooltip>
  );
};
