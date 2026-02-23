"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2Icon, CheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { WHISPER_MODELS, DEFAULT_WHISPER_MODEL } from "@/lib/config/whisper-models";
import type { FormState } from "./settings-types";

// ---------------------------------------------------------------------------
// Whisper Model Selector (follows LocalEmbeddingModelSelector pattern)
// ---------------------------------------------------------------------------

interface WhisperModelSelectorProps {
  formState: FormState;
  updateField: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
}

export function WhisperModelSelector({ formState, updateField }: WhisperModelSelectorProps) {
  const t = useTranslations("settings.voice.stt");
  const [modelStatus, setModelStatus] = useState<Record<string, boolean>>({});
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isElectronEnv, setIsElectronEnv] = useState(false);

  // Check if running in Electron and model existence on mount
  // NOTE: contextBridge proxy objects don't reliably support the `in` operator,
  // so we use the same simple pattern as LocalEmbeddingModelSelector.
  useEffect(() => {
    const checkElectronAndModels = async () => {
      if (typeof window === "undefined" || !("electronAPI" in window)) return;
      setIsElectronEnv(true);

      const electronAPI = (window as unknown as {
        electronAPI: {
          model: {
            checkFileExists: (opts: { modelId: string; filename: string }) => Promise<boolean>;
          };
        };
      }).electronAPI;

      const status: Record<string, boolean> = {};
      for (const model of WHISPER_MODELS) {
        try {
          status[model.id] = await electronAPI.model.checkFileExists({ modelId: model.id, filename: model.hfFile });
        } catch {
          status[model.id] = false;
        }
      }
      setModelStatus(status);
    };
    checkElectronAndModels();
  }, []);

  const handleDownload = async (modelId: string) => {
    if (!isElectronEnv) return;

    const modelInfo = WHISPER_MODELS.find((m) => m.id === modelId);
    if (!modelInfo) {
      setDownloadError(`Unknown model: ${modelId}`);
      return;
    }

    setDownloading(modelId);
    setDownloadProgress(0);
    setDownloadError(null);

    const electronAPI = (window as unknown as {
      electronAPI?: {
        model?: {
          downloadFile?: (opts: { modelId: string; repo: string; filename: string }) => Promise<{ success: boolean; error?: string }>;
          onProgress?: (cb: (data: { modelId: string; status: string; progress?: number; error?: string }) => void) => void;
          removeProgressListener?: () => void;
        };
      };
    }).electronAPI;

    // Safety check - API might not be fully exposed
    if (!electronAPI?.model?.downloadFile) {
      setDownloadError(t("vector.advanced.reranking.downloadApiUnavailable"));
      setDownloading(null);
      return;
    }

    // Set up progress listener (if available)
    if (electronAPI.model.onProgress) {
      electronAPI.model.onProgress((data) => {
        if (data.modelId === modelId) {
          if (data.progress !== undefined) {
            setDownloadProgress(data.progress);
          }
          if (data.status === "completed") {
            setDownloading(null);
            setModelStatus((prev) => ({ ...prev, [modelId]: true }));
          }
          if (data.status === "error") {
            setDownloading(null);
            setDownloadError(data.error || "Download failed");
          }
        }
      });
    }

    try {
      const result = await electronAPI.model.downloadFile({
        modelId,
        repo: modelInfo.hfRepo,
        filename: modelInfo.hfFile,
      });
      if (!result.success) {
        setDownloadError(result.error || "Download failed");
      }
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(null);
      electronAPI.model.removeProgressListener?.();
    }
  };

  const selectedModel = formState.sttLocalModel || DEFAULT_WHISPER_MODEL;

  return (
    <div className="rounded border border-terminal-border bg-terminal-cream/30 p-4 space-y-3">
      <div>
        <label className="mb-1 block font-mono text-sm text-terminal-muted">
          {t("whisperModelLabel")}
        </label>
        <div className="flex gap-2">
          <select
            value={selectedModel}
            onChange={(e) => updateField("sttLocalModel", e.target.value)}
            className="flex-1 rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
          >
            {WHISPER_MODELS.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name} ({model.size}){model.recommended ? " ★" : ""} {modelStatus[model.id] ? "✓" : ""}
              </option>
            ))}
          </select>

          {isElectronEnv && (
            <Button
              type="button"
              onClick={() => handleDownload(selectedModel)}
              disabled={downloading !== null || modelStatus[selectedModel]}
              className="gap-2 bg-terminal-green text-white hover:bg-terminal-green/90 disabled:opacity-50"
            >
              {downloading ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" />
                  {downloadProgress}%
                </>
              ) : modelStatus[selectedModel] ? (
                <>
                  <CheckIcon className="size-4" />
                  {t("whisperDownloaded")}
                </>
              ) : (
                t("whisperDownload")
              )}
            </Button>
          )}
        </div>

        {downloadError && (
          <p className="mt-1 font-mono text-xs text-red-600">{downloadError}</p>
        )}

        <p className="mt-2 font-mono text-xs text-terminal-muted">
          {WHISPER_MODELS.find((m) => m.id === selectedModel)?.description || t("whisperSelectModel")}
          {WHISPER_MODELS.find((m) => m.id === selectedModel)?.language === "multilingual"
            ? t("whisperMultilingual")
            : t("whisperEnglishOnly")}
        </p>
      </div>

      {/* Install hint */}
      <div className="rounded border border-terminal-border bg-terminal-cream/30 p-3">
        <p className="font-mono text-xs text-terminal-muted">
          {t("whisperSetupHint")}
        </p>
      </div>
    </div>
  );
}
