"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2Icon, CheckIcon, DownloadIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { PARAKEET_MODELS } from "@/lib/voice/parakeet-models";
import { SettingsToggleRow } from "@/components/settings/settings-form-layout";
import type { FormState } from "./settings-types";

interface ParakeetModelSelectorProps {
  formState: FormState;
  updateField: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
}

export function ParakeetModelSelector({ formState, updateField }: ParakeetModelSelectorProps) {
  const t = useTranslations("settings.voice.stt");
  const [installed, setInstalled] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isElectronEnv, setIsElectronEnv] = useState(false);

  const selectedModel = formState.parakeetModel || PARAKEET_MODELS[0]?.id;

  useEffect(() => {
    const checkStatus = async () => {
      if (typeof window === "undefined" || !("electronAPI" in window)) return;
      setIsElectronEnv(true);

      const electronAPI = (window as unknown as {
        electronAPI: {
          model: {
            parakeetGetStatus: (modelId?: string) => Promise<{ installed: boolean }>;
          };
        };
      }).electronAPI;

      try {
        const status = await electronAPI.model.parakeetGetStatus(selectedModel);
        setInstalled(status.installed);
      } catch {
        setInstalled(false);
      }
    };
    checkStatus();
  }, [selectedModel]);

  const handleDownload = async () => {
    if (!isElectronEnv) return;

    setDownloading(true);
    setDownloadProgress(0);
    setCurrentFile(null);
    setDownloadError(null);

    const electronAPI = (window as unknown as {
      electronAPI?: {
        model?: {
          parakeetDownloadModel?: (modelId?: string) => Promise<{ success: boolean; error?: string }>;
          onProgress?: (cb: (data: { modelId: string; status: string; progress?: number; file?: string; error?: string }) => void) => void;
          removeProgressListener?: () => void;
        };
      };
    }).electronAPI;

    if (!electronAPI?.model?.parakeetDownloadModel) {
      setDownloadError("Download API not available");
      setDownloading(false);
      return;
    }

    if (electronAPI.model.onProgress) {
      electronAPI.model.onProgress((data) => {
        if (data.modelId === selectedModel) {
          if (data.progress !== undefined) setDownloadProgress(data.progress);
          if (data.file) setCurrentFile(data.file);
          if (data.status === "completed") {
            setDownloading(false);
            setInstalled(true);
          }
          if (data.status === "error") {
            setDownloading(false);
            setDownloadError(data.error || "Download failed");
          }
        }
      });
    }

    try {
      const result = await electronAPI.model.parakeetDownloadModel(selectedModel);
      if (!result.success) {
        setDownloadError(result.error || "Download failed");
      }
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(false);
      electronAPI.model.removeProgressListener?.();
    }
  };

  return (
    <div className="rounded border border-terminal-border bg-terminal-cream/30 p-4 space-y-3">
      <div>
        <label className="mb-1 block font-mono text-sm text-terminal-muted">
          {t("parakeetModelLabel")}
        </label>
        <div className="flex gap-2">
          <select
            value={selectedModel}
            onChange={(e) => updateField("parakeetModel", e.target.value)}
            className="flex-1 rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
          >
            {PARAKEET_MODELS.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name} {installed && model.id === selectedModel ? "\u2713" : ""}
              </option>
            ))}
          </select>

          {isElectronEnv && (
            <Button
              type="button"
              onClick={handleDownload}
              disabled={downloading || installed}
              className="gap-2 bg-terminal-green text-white hover:bg-terminal-green/90 disabled:opacity-50"
            >
              {downloading ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" />
                  {downloadProgress}%
                </>
              ) : installed ? (
                <>
                  <CheckIcon className="size-4" />
                  {t("parakeetDownloaded")}
                </>
              ) : (
                <>
                  <DownloadIcon className="size-4" />
                  {t("parakeetDownload")}
                </>
              )}
            </Button>
          )}
        </div>

        {downloading && currentFile && (
          <p className="mt-1 font-mono text-xs text-terminal-muted">
            {currentFile}
          </p>
        )}

        {downloadError && (
          <p className="mt-1 font-mono text-xs text-red-600">{downloadError}</p>
        )}
      </div>

      <SettingsToggleRow
        id="parakeetAutoStart"
        label={t("parakeetAutoStartLabel")}
        description={t("parakeetAutoStartDesc")}
        checked={formState.parakeetAutoStart}
        onChange={(checked) => updateField("parakeetAutoStart", checked)}
      />

      {!isElectronEnv && (
        <div className="rounded border border-terminal-border bg-terminal-bg/30 px-3 py-2 font-mono text-xs text-terminal-muted">
          {t("parakeetAutoDownloadHint")}
        </div>
      )}
    </div>
  );
}
