"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2Icon, CheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { LOCAL_EMBEDDING_MODELS as SHARED_LOCAL_EMBEDDING_MODELS, formatDimensionLabel } from "@/lib/config/embedding-models";
import type { FormState } from "./settings-types";

// Derive local embedding model list from shared registry (single source of truth)
export const LOCAL_EMBEDDING_MODELS = SHARED_LOCAL_EMBEDDING_MODELS.map((m) => ({
  id: m.id,
  name: `${m.name} (${m.dimensions} dims${m.size ? `, ~${m.size}` : ""})`,
  size: m.size || "",
}));

interface LocalEmbeddingModelSelectorProps {
  formState: FormState;
  updateField: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  t: ReturnType<typeof useTranslations<"settings">>;
}

export function LocalEmbeddingModelSelector({ formState, updateField, t }: LocalEmbeddingModelSelectorProps) {
  const [modelStatus, setModelStatus] = useState<Record<string, boolean>>({});
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isElectronEnv, setIsElectronEnv] = useState(false);

  // Check if running in Electron and model existence on mount
  useEffect(() => {
    const checkElectronAndModels = async () => {
      if (typeof window !== "undefined" && "electronAPI" in window) {
        setIsElectronEnv(true);
        const electronAPI = (window as unknown as { electronAPI: { model: { checkExists: (id: string) => Promise<boolean> } } }).electronAPI;

        // Check each model's existence
        const status: Record<string, boolean> = {};
        for (const model of LOCAL_EMBEDDING_MODELS) {
          try {
            status[model.id] = await electronAPI.model.checkExists(model.id);
          } catch {
            status[model.id] = false;
          }
        }
        setModelStatus(status);
      }
    };
    checkElectronAndModels();
  }, []);

  // Handle download
  const handleDownload = async (modelId: string) => {
    if (!isElectronEnv) return;

    setDownloading(modelId);
    setDownloadProgress(0);
    setDownloadError(null);

    const electronAPI = (window as unknown as {
      electronAPI?: {
        model?: {
          download?: (id: string) => Promise<{ success: boolean; error?: string }>;
          onProgress?: (cb: (data: { modelId: string; status: string; progress?: number; error?: string }) => void) => void;
          removeProgressListener?: () => void;
        }
      }
    }).electronAPI;

    // Safety check - API might not be fully exposed
    if (!electronAPI?.model?.download) {
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
      const result = await electronAPI.model.download(modelId);
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

  // For local provider, show dropdown with download support
  if (formState.embeddingProvider === "local") {
    return (
      <div>
        <label className="mb-1 block font-mono text-sm text-terminal-muted">
          {t("models.fields.embedding.label")}
        </label>
        <div className="flex gap-2">
          <select
            value={formState.embeddingModel || LOCAL_EMBEDDING_MODELS[0].id}
            onChange={(e) => updateField("embeddingModel", e.target.value)}
            className="flex-1 rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
          >
            {LOCAL_EMBEDDING_MODELS.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name} {modelStatus[model.id] ? "✓" : ""}
              </option>
            ))}
          </select>

          {isElectronEnv && (
            <Button
              type="button"
              onClick={() => handleDownload(formState.embeddingModel || LOCAL_EMBEDDING_MODELS[0].id)}
              disabled={downloading !== null || modelStatus[formState.embeddingModel || LOCAL_EMBEDDING_MODELS[0].id]}
              className="gap-2 bg-terminal-green text-white hover:bg-terminal-green/90 disabled:opacity-50"
            >
              {downloading ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" />
                  {downloadProgress}%
                </>
              ) : modelStatus[formState.embeddingModel || LOCAL_EMBEDDING_MODELS[0].id] ? (
                <>
                  <CheckIcon className="size-4" />
                  {t("models.fields.embedding.downloaded")}
                </>
              ) : (
                t("models.fields.embedding.download")
              )}
            </Button>
          )}
        </div>

        {downloadError && (
          <p className="mt-1 font-mono text-xs text-red-600">{downloadError}</p>
        )}

        <p className="mt-1 font-mono text-xs text-terminal-muted">
          {t("models.fields.embedding.helperLocal")}
        </p>
      </div>
    );
  }

  // For OpenRouter, show text input
  return (
    <div>
      <label className="mb-1 block font-mono text-sm text-terminal-muted">
        {t("models.fields.embedding.label")}
      </label>
      <input
        type="text"
        value={formState.embeddingModel ?? ""}
        onChange={(e) => updateField("embeddingModel", e.target.value)}
        placeholder={t("models.fields.embedding.placeholderOpenRouter")}
        className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
      />
      <p className="mt-1 font-mono text-xs text-terminal-muted">
        {t("models.fields.embedding.helper")}
      </p>
      {formState.embeddingModel && (
        <p className="mt-1 font-mono text-xs text-terminal-green">
          Vector dimensions: {formatDimensionLabel(formState.embeddingModel)}
        </p>
      )}
    </div>
  );
}
