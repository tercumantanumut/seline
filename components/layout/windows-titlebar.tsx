"use client";

import { useEffect, useState } from "react";
import { MinusIcon, SquareIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { getElectronAPI } from "@/lib/electron/types";

interface WindowsTitleBarProps {
  className?: string;
}

export function WindowsTitleBar({ className }: WindowsTitleBarProps) {
  const [showTitleBar, setShowTitleBar] = useState(false);
  const t = useTranslations("layout");

  useEffect(() => {
    const electronAPI = getElectronAPI();
    setShowTitleBar(electronAPI?.platform === "win32");
  }, []);

  if (!showTitleBar) return null;

  return (
    <div
      className={cn(
        "flex h-9 items-center justify-between border-b border-terminal-dark/10 bg-terminal-cream/90 px-3 text-terminal-dark backdrop-blur-sm webkit-app-region-drag",
        className
      )}
    >
      <div className="flex items-center gap-2 text-xs font-mono text-terminal-muted">
        <span className="text-terminal-green">{t("brandShort")}</span>
        <span className="hidden sm:inline">{t("brand")}</span>
      </div>
      <div className="flex items-center gap-1 webkit-app-region-no-drag">
        <button
          type="button"
          onClick={() => window.electronAPI?.window.minimize()}
          className="flex h-7 w-10 items-center justify-center rounded-md text-terminal-muted transition-colors hover:bg-terminal-dark/10 hover:text-terminal-dark"
          aria-label={t("minimizeWindow")}
        >
          <MinusIcon className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => window.electronAPI?.window.maximize()}
          className="flex h-7 w-10 items-center justify-center rounded-md text-terminal-muted transition-colors hover:bg-terminal-dark/10 hover:text-terminal-dark"
          aria-label={t("maximizeWindow")}
        >
          <SquareIcon className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => window.electronAPI?.window.close()}
          className="flex h-7 w-10 items-center justify-center rounded-md text-terminal-muted transition-colors hover:bg-red-500/90 hover:text-white"
          aria-label={t("closeWindow")}
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
