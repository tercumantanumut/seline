"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, Check, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { resilientPatch } from "@/lib/utils/resilient-fetch";
import { PRESET_AVATARS, type PresetAvatar } from "@/lib/avatar/preset-avatars";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

interface AvatarConfig {
  source: "preset" | "custom";
  presetId?: string;
  modelUrl: string;
  bodyType: "M" | "F";
}

interface Avatar3DModelSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  characterId: string;
  characterName: string;
  currentAvatarConfig?: AvatarConfig | null;
  onAvatarConfigChange: () => void;
}

export function Avatar3DModelSelector({
  open,
  onOpenChange,
  characterId,
  characterName,
  currentAvatarConfig,
  onAvatarConfigChange,
}: Avatar3DModelSelectorProps) {
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Optimistic local state — updates immediately on click, syncs from props on open
  const [localConfig, setLocalConfig] = useState<AvatarConfig | null>(currentAvatarConfig ?? null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const t = useTranslations("avatar3dModels");

  // Sync from props when dialog opens or props change
  useEffect(() => {
    if (open) {
      setLocalConfig(currentAvatarConfig ?? null);
    }
  }, [open, currentAvatarConfig]);

  const currentPresetId = localConfig?.source === "preset"
    ? localConfig.presetId
    : null;

  const isCustom = localConfig?.source === "custom";

  const saveConfig = useCallback(
    async (config: AvatarConfig) => {
      const previous = localConfig;
      setLocalConfig(config); // optimistic update
      setSaving(true);
      setError(null);
      try {
        const { error: patchError } = await resilientPatch(
          `/api/characters/${characterId}`,
          { metadata: { avatarConfig: config } },
        );
        if (patchError) throw new Error(patchError);
        onAvatarConfigChange();
      } catch {
        setLocalConfig(previous); // rollback on failure
        setError(t("error.save"));
        toast.error(t("error.save"));
      } finally {
        setSaving(false);
      }
    },
    [characterId, localConfig, onAvatarConfigChange, t],
  );

  const handlePresetSelect = (preset: PresetAvatar) => {
    if (saving || uploading) return;
    saveConfig({
      source: "preset",
      presetId: preset.id,
      modelUrl: preset.modelUrl,
      bodyType: preset.bodyType,
    });
  };

  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (fileInputRef.current) fileInputRef.current.value = "";

      if (!file.name.toLowerCase().endsWith(".glb")) {
        setError(t("error.invalidType"));
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(t("error.tooLarge"));
        return;
      }

      setError(null);
      setUploading(true);

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("role", "avatar3d");

        const res = await fetch("/api/upload", { method: "POST", body: formData });
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!data?.url) throw new Error();

        await saveConfig({
          source: "custom",
          modelUrl: data.url,
          bodyType: "F",
        });
      } catch {
        setError(t("error.upload"));
      } finally {
        setUploading(false);
      }
    },
    [saveConfig, t],
  );

  const handleRemoveCustom = () => {
    saveConfig({
      source: "preset",
      presetId: "default",
      modelUrl: "/avatars/default.glb",
      bodyType: "F",
    });
  };

  const busy = saving || uploading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-terminal-cream border-terminal-border">
        <DialogHeader>
          <DialogTitle className="font-mono text-terminal-dark">
            {t("dialog.title", { name: characterName })}
          </DialogTitle>
          <DialogDescription className="font-mono text-terminal-muted">
            {t("dialog.subtitle")}
          </DialogDescription>
        </DialogHeader>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept=".glb"
          className="hidden"
        />

        {error && (
          <div className="p-3 bg-red-100 rounded-lg">
            <p className="text-sm font-mono text-red-700">{error}</p>
          </div>
        )}

        {/* Preset list */}
        <div className="space-y-2">
          {PRESET_AVATARS.map((preset) => {
            const isSelected = currentPresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                disabled={busy}
                onClick={() => handlePresetSelect(preset)}
                className={cn(
                  "relative flex w-full items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition-all cursor-pointer",
                  isSelected
                    ? "border-terminal-green bg-terminal-green/10 shadow-[0_0_0_1px_rgba(82,176,117,0.3)]"
                    : "border-transparent hover:bg-terminal-dark/[0.04]",
                  busy && "opacity-50 cursor-not-allowed",
                )}
              >
                {/* Colored avatar circle with initials */}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white font-mono text-sm font-bold shadow-sm"
                  style={{ backgroundColor: preset.accent }}
                >
                  {preset.initials}
                </div>

                {/* Name + body type */}
                <div className="flex-1 text-left min-w-0">
                  <p className={cn(
                    "font-mono text-sm leading-tight",
                    isSelected ? "text-terminal-dark font-semibold" : "text-terminal-dark/80",
                  )}>
                    {t(`presets.${preset.id}`)}
                  </p>
                  <p className="font-mono text-[11px] text-terminal-muted">
                    {preset.bodyType === "F" ? "Female" : "Male"} body
                  </p>
                </div>

                {/* Selection indicator */}
                {isSelected ? (
                  <div className="w-6 h-6 rounded-full bg-terminal-green flex items-center justify-center shrink-0">
                    <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                  </div>
                ) : (
                  <div className="w-6 h-6 rounded-full border-2 border-terminal-border/40 shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        {/* Custom upload section */}
        <div className="space-y-2 pt-1">
          {isCustom && localConfig?.modelUrl && (
            <div className="flex items-center justify-between px-3 py-2.5 rounded-xl border-2 border-terminal-green bg-terminal-green/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-terminal-dark/10 flex items-center justify-center shrink-0">
                  <Upload className="w-4 h-4 text-terminal-muted" />
                </div>
                <div className="text-left">
                  <p className="font-mono text-sm font-semibold text-terminal-dark">
                    {t("custom.current")}
                  </p>
                  <p className="font-mono text-[11px] text-terminal-muted">Custom GLB</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-terminal-green flex items-center justify-center">
                  <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                </div>
                <button
                  type="button"
                  onClick={handleRemoveCustom}
                  disabled={busy}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  title={t("custom.remove")}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            variant="outline"
            className="w-full font-mono border-terminal-border hover:bg-terminal-dark/5"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t("custom.uploading")}
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                {t("custom.upload")}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
