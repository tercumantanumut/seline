"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTheme, type ThemePreference } from "@/components/theme/theme-provider";
import { THEME_PRESETS, type ThemePresetId } from "@/lib/personalization/theme-presets";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sun, Moon, Monitor, ArrowRight, Check, PanelLeft, LayoutGrid } from "lucide-react";
import type { ChatWorkspaceMode } from "@/lib/chat/workspace-mode";

const THEME_MODES: { id: ThemePreference; icon: typeof Sun }[] = [
  { id: "light", icon: Sun },
  { id: "dark", icon: Moon },
  { id: "system", icon: Monitor },
];

const WORKSPACE_STYLES: { id: ChatWorkspaceMode; icon: typeof PanelLeft }[] = [
  { id: "sidebar", icon: PanelLeft },
  { id: "browser-tabs", icon: LayoutGrid },
];

interface ThemeChooserModalProps {
  open: boolean;
  onClose: () => void;
}

export function ThemeChooserModal({ open, onClose }: ThemeChooserModalProps) {
  const router = useRouter();
  const t = useTranslations("themeChooser");
  const { theme, setTheme, themePreset, setThemePreset, chatWorkspaceMode, setChatWorkspaceMode } = useTheme();
  const [selectedMode, setSelectedMode] = useState<ThemePreference>(theme);
  const [selectedPreset, setSelectedPreset] = useState<ThemePresetId>(themePreset);
  const [selectedWorkspace, setSelectedWorkspace] = useState<ChatWorkspaceMode>(chatWorkspaceMode);

  const handleModeSelect = (mode: ThemePreference) => {
    setSelectedMode(mode);
    setTheme(mode);
  };

  const handlePresetSelect = (preset: ThemePresetId) => {
    setSelectedPreset(preset);
    setThemePreset(preset);
  };

  const handleWorkspaceSelect = (mode: ChatWorkspaceMode) => {
    setSelectedWorkspace(mode);
    setChatWorkspaceMode(mode);
  };

  const handleDismiss = () => {
    onClose();
  };

  const handleGoToSettings = () => {
    onClose();
    router.push("/settings");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleDismiss(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {/* Theme mode: light / dark / system */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">{t("modeLabel")}</p>
          <div className="grid grid-cols-3 gap-2">
            {THEME_MODES.map(({ id, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => handleModeSelect(id)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs transition-colors",
                  selectedMode === id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:border-primary/40 text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-5 w-5" />
                <span>{t(`mode.${id}`)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Color presets */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">{t("paletteLabel")}</p>
          <div className="grid grid-cols-4 gap-2">
            {THEME_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handlePresetSelect(preset.id)}
                className={cn(
                  "group relative flex flex-col items-center gap-1.5 rounded-lg border p-2 text-xs transition-colors",
                  selectedPreset === preset.id
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/40"
                )}
                title={preset.description}
              >
                {/* Swatch trio */}
                <div className="flex gap-0.5">
                  {preset.swatches.map((color, i) => (
                    <div
                      key={i}
                      className="h-5 w-5 rounded-full border border-black/10"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <span className={cn(
                  "truncate max-w-full",
                  selectedPreset === preset.id ? "text-primary font-medium" : "text-muted-foreground"
                )}>
                  {preset.label}
                </span>
                {selectedPreset === preset.id && (
                  <Check className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-primary text-primary-foreground p-0.5" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Workspace style */}
        <div className="space-y-3 border-t pt-4">
          <p className="text-sm font-medium text-foreground">{t("workspaceLabel")}</p>
          <div className="grid grid-cols-2 gap-3">
            {WORKSPACE_STYLES.map(({ id, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => handleWorkspaceSelect(id)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-xs transition-all",
                  selectedWorkspace === id
                    ? "border-primary bg-primary/10 text-primary shadow-sm"
                    : "border-border hover:border-primary/40 text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-6 w-6" />
                <span className="font-medium text-sm">{t(`workspace.${id}`)}</span>
                <span className="text-[10px] text-muted-foreground text-center leading-tight">{t(`workspaceHint.${id}`)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={handleGoToSettings}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("moreOptions")}
            <ArrowRight className="h-3 w-3" />
          </button>
          <Button size="sm" onClick={handleDismiss}>
            {t("done")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
