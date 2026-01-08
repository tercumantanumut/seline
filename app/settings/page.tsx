"use client";

import { useState, useEffect } from "react";
import { Shell } from "@/components/layout/shell";
import { Button } from "@/components/ui/button";
import { SaveIcon, Loader2Icon, CheckIcon, KeyIcon, PaletteIcon, CpuIcon, DatabaseIcon, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations, useLocale } from "next-intl";
import { locales, localeCookieName, type Locale } from "@/i18n/config";
import { useTheme } from "@/components/theme/theme-provider";
import { toast } from "sonner";
import { getAntigravityModels } from "@/lib/auth/antigravity-models";
import { ComfyUIInstaller } from "@/components/comfyui";

interface AppSettings {
  llmProvider: "anthropic" | "openrouter" | "antigravity";
  anthropicApiKey?: string;
  openrouterApiKey?: string;
  tavilyApiKey?: string;
  firecrawlApiKey?: string;
  webScraperProvider?: "firecrawl" | "local";
  stylyAiApiKey?: string;
  chatModel?: string;
  embeddingProvider?: "openrouter" | "local";
  embeddingModel?: string;
  researchModel?: string;
  visionModel?: string;
  utilityModel?: string;
  embeddingReindexRequired?: boolean;
  theme: "dark" | "light" | "system";
  localUserId: string;
  localUserEmail: string;
  vectorDBEnabled?: boolean;
  vectorSearchHybridEnabled?: boolean;
  vectorSearchTokenChunkingEnabled?: boolean;
  vectorSearchRerankingEnabled?: boolean;
  vectorSearchQueryExpansionEnabled?: boolean;
  vectorSearchLlmSynthesisEnabled?: boolean;
  vectorSearchV2Percentage?: number;
  vectorSearchRrfK?: number;
  vectorSearchDenseWeight?: number;
  vectorSearchLexicalWeight?: number;
  vectorSearchRerankModel?: string;
  vectorSearchRerankTopK?: number;
  vectorSearchTokenChunkSize?: number;
  vectorSearchTokenChunkStride?: number;
  vectorSearchMaxFileLines?: number;
  vectorSearchMaxLineLength?: number;
  // Antigravity auth state (read-only, managed via OAuth)
  antigravityAuth?: {
    isAuthenticated: boolean;
    email?: string;
    expiresAt?: number;
  };
}

type SettingsSection = "api-keys" | "models" | "vector-search" | "comfyui" | "preferences";

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SettingsSection>("api-keys");
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const { setTheme } = useTheme();

  // Form state for editable fields
  const [formState, setFormState] = useState({
    llmProvider: "anthropic" as "anthropic" | "openrouter" | "antigravity",
    anthropicApiKey: "",
    openrouterApiKey: "",
    tavilyApiKey: "",
    firecrawlApiKey: "",
    webScraperProvider: "firecrawl" as "firecrawl" | "local",
    stylyAiApiKey: "",
    chatModel: "",
    embeddingProvider: "openrouter" as "openrouter" | "local",
    embeddingModel: "",
    researchModel: "",
    visionModel: "",
    utilityModel: "",
    theme: "dark" as "dark" | "light" | "system",
    toolLoadingMode: "deferred" as "deferred" | "always",
    embeddingReindexRequired: false,
    vectorDBEnabled: false,
    vectorSearchHybridEnabled: false,
    vectorSearchTokenChunkingEnabled: false,
    vectorSearchRerankingEnabled: false,
    vectorSearchQueryExpansionEnabled: false,
    vectorSearchLlmSynthesisEnabled: true,
    vectorSearchV2Percentage: 0,
    vectorSearchRrfK: 30,
    vectorSearchDenseWeight: 1.5,
    vectorSearchLexicalWeight: 0.2,
    vectorSearchRerankModel: "models/ms-marco-MiniLM-L-6-v2.onnx",
    vectorSearchRerankTopK: 20,
    vectorSearchTokenChunkSize: 16,
    vectorSearchTokenChunkStride: 8,
    vectorSearchMaxFileLines: 3000,
    vectorSearchMaxLineLength: 1000,
    // Local Grep settings
    localGrepEnabled: true,
    localGrepMaxResults: 100,
    localGrepContextLines: 2,
    localGrepRespectGitignore: true,
    // ComfyUI settings
    comfyuiEnabled: false,
    comfyuiBackendPath: "",
  });

  // Antigravity auth state (separate from form state, managed via OAuth)
  const [antigravityAuth, setAntigravityAuth] = useState<{
    isAuthenticated: boolean;
    email?: string;
    expiresAt?: number;
  } | null>(null);
  const [antigravityLoading, setAntigravityLoading] = useState(false);

  useEffect(() => {
    loadSettings();
    loadAntigravityAuth();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await fetch("/api/settings");
      if (!response.ok) throw new Error(t("errors.load"));
      const data = await response.json();
      setSettings(data);
      setFormState({
        llmProvider: data.llmProvider || "anthropic",
        anthropicApiKey: data.anthropicApiKey || "",
        openrouterApiKey: data.openrouterApiKey || "",
        tavilyApiKey: data.tavilyApiKey || "",
        firecrawlApiKey: data.firecrawlApiKey || "",
        webScraperProvider: data.webScraperProvider || "firecrawl",
        stylyAiApiKey: data.stylyAiApiKey || "",
        chatModel: data.chatModel || "",
        embeddingProvider: data.embeddingProvider || "openrouter",
        embeddingModel: data.embeddingModel || "",
        researchModel: data.researchModel || "",
        visionModel: data.visionModel || "",
        utilityModel: data.utilityModel || "",
        theme: data.theme || "dark",
        toolLoadingMode: data.toolLoadingMode || "deferred",
        embeddingReindexRequired: data.embeddingReindexRequired ?? false,
        vectorDBEnabled: data.vectorDBEnabled || false,
        vectorSearchHybridEnabled: data.vectorSearchHybridEnabled ?? false,
        vectorSearchTokenChunkingEnabled: data.vectorSearchTokenChunkingEnabled ?? false,
        vectorSearchRerankingEnabled: data.vectorSearchRerankingEnabled ?? false,
        vectorSearchQueryExpansionEnabled: data.vectorSearchQueryExpansionEnabled ?? false,
        vectorSearchLlmSynthesisEnabled: data.vectorSearchLlmSynthesisEnabled ?? true,
        vectorSearchV2Percentage: data.vectorSearchV2Percentage ?? 0,
        vectorSearchRrfK: data.vectorSearchRrfK ?? 30,
        vectorSearchDenseWeight: data.vectorSearchDenseWeight ?? 1.5,
        vectorSearchLexicalWeight: data.vectorSearchLexicalWeight ?? 0.2,
        vectorSearchRerankModel: data.vectorSearchRerankModel ?? "models/ms-marco-MiniLM-L-6-v2.onnx",
        vectorSearchRerankTopK: data.vectorSearchRerankTopK ?? 20,
        vectorSearchTokenChunkSize: data.vectorSearchTokenChunkSize ?? 16,
        vectorSearchTokenChunkStride: data.vectorSearchTokenChunkStride ?? 8,
        vectorSearchMaxFileLines: data.vectorSearchMaxFileLines ?? 3000,
        vectorSearchMaxLineLength: data.vectorSearchMaxLineLength ?? 1000,
        // Local Grep settings
        localGrepEnabled: data.localGrepEnabled ?? true,
        localGrepMaxResults: data.localGrepMaxResults ?? 100,
        localGrepContextLines: data.localGrepContextLines ?? 2,
        localGrepRespectGitignore: data.localGrepRespectGitignore ?? true,
        // ComfyUI settings
        comfyuiEnabled: data.comfyuiEnabled ?? false,
        comfyuiBackendPath: data.comfyuiBackendPath ?? "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.load"));
    } finally {
      setLoading(false);
    }
  };

  const loadAntigravityAuth = async (): Promise<boolean> => {
    try {
      // Add cache-busting to ensure fresh data
      const response = await fetch(`/api/auth/antigravity?t=${Date.now()}`);
      if (response.ok) {
        const data = await response.json();
        console.log("[Settings] Loaded Antigravity auth:", data);
        setAntigravityAuth({
          isAuthenticated: data.authenticated,
          email: data.email,
          expiresAt: data.expiresAt,
        });
        return data.authenticated;
      }
    } catch (err) {
      console.error("Failed to load Antigravity auth status:", err);
    }
    return false;
  };

  const handleAntigravityLogin = async () => {
    setAntigravityLoading(true);
    let popup: Window | null = null;
    let pollInterval: NodeJS.Timeout | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let messageHandler: ((event: MessageEvent) => void) | null = null;
    let pollInFlight = false;
    const electronAPI = typeof window !== "undefined" && "electronAPI" in window
      ? (window as unknown as { electronAPI?: { isElectron?: boolean; shell?: { openExternal: (url: string) => Promise<void> } } }).electronAPI
      : undefined;
    const isElectron = !!electronAPI?.isElectron;

    const cleanup = () => {
      if (pollInterval) clearInterval(pollInterval);
      if (timeoutId) clearTimeout(timeoutId);
      if (messageHandler) window.removeEventListener("message", messageHandler);
      setAntigravityLoading(false);
    };

    try {
      // Open a placeholder popup synchronously to avoid browser popup blockers
      if (!isElectron) {
        const width = 500;
        const height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;

        popup = window.open(
          "about:blank",
          "antigravity-auth",
          `width=${width},height=${height},left=${left},top=${top}`
        );

        if (popup) {
          popup.document.write("<p style='font-family:sans-serif'>Connecting to Google...</p>");
        }
      }

      // Get the OAuth authorization URL from our API
      const authResponse = await fetch("/api/auth/antigravity/authorize");
      const authData = await authResponse.json();

      if (!authData.success || !authData.url) {
        popup?.close();
        throw new Error(authData.error || "Failed to get authorization URL");
      }

      if (isElectron && electronAPI?.shell?.openExternal) {
        await electronAPI.shell.openExternal(authData.url);
      } else if (popup) {
        popup.location.href = authData.url;
      } else {
        toast.error("Popup blocked. Please allow popups for this site and try again.");
        cleanup();
        return;
      }

      // Listen for auth completion message from popup
      messageHandler = (event: MessageEvent) => {
        // Only accept messages from same origin
        if (event.origin !== window.location.origin) return;

        if (event.data?.type === "antigravity-auth") {
          console.log("[Settings] Received auth message from popup:", event.data);
          popup?.close();
          loadAntigravityAuth().finally(cleanup);
        }
      };
      window.addEventListener("message", messageHandler);

      // Poll for popup closure as fallback
      pollInterval = setInterval(async () => {
        if (pollInFlight) return;
        pollInFlight = true;
        try {
          const authenticated = await loadAntigravityAuth();
          if (authenticated) {
            console.log("[Settings] Antigravity auth confirmed, closing popup...");
            popup?.close();
            cleanup();
            return;
          }

          if (popup?.closed) {
            console.log("[Settings] Popup closed, refreshing auth state...");
            // Wait a moment for the server to process the callback
            await new Promise(resolve => setTimeout(resolve, 500));
            await loadAntigravityAuth();
            cleanup();
          }
        } finally {
          pollInFlight = false;
        }
      }, 1000);

      // Timeout after 5 minutes
      timeoutId = setTimeout(() => {
        console.warn("[Settings] OAuth timeout");
        popup?.close();
        cleanup();
      }, 5 * 60 * 1000);

    } catch (err) {
      console.error("Antigravity login failed:", err);
      cleanup();
    }
  };

  const handleAntigravityLogout = async () => {
    setAntigravityLoading(true);
    try {
      const response = await fetch("/api/auth/antigravity", { method: "DELETE" });
      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(errorText || `Logout failed with status ${response.status}`);
      }
      setAntigravityAuth(null);
      // If currently using antigravity, switch to anthropic
      if (formState.llmProvider === "antigravity") {
        setFormState(prev => ({ ...prev, llmProvider: "anthropic" }));
      }
    } catch (err) {
      console.error("Antigravity logout failed:", err);
      toast.error(tc("error"));
    } finally {
      setAntigravityLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formState),
      });
      if (!response.ok) throw new Error(t("errors.save"));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setTheme(formState.theme);
      await loadSettings(); // Reload to get masked keys
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.save"));
    } finally {
      setSaving(false);
    }
  };

  const sections = [
    { id: "api-keys" as const, label: t("nav.apiKeys"), icon: KeyIcon },
    { id: "models" as const, label: t("nav.models"), icon: CpuIcon },
    { id: "vector-search" as const, label: t("nav.vectorSearch"), icon: DatabaseIcon },
    { id: "comfyui" as const, label: "Local Image AI", icon: ImageIcon },
    { id: "preferences" as const, label: t("nav.preferences"), icon: PaletteIcon },
  ];

  if (loading) {
    return (
      <Shell>
        <div className="flex h-full items-center justify-center">
          <Loader2Icon className="size-8 animate-spin text-terminal-green" />
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center gap-4 border-b border-terminal-border bg-terminal-cream p-4">
          <div>
            <h1 className="font-mono text-xl font-bold text-terminal-dark">{t("title")}</h1>
            <p className="font-mono text-sm text-terminal-muted">{t("subtitle")}</p>
          </div>
          <div className="ml-auto">
            <Button onClick={saveSettings} disabled={saving} className="gap-2 bg-terminal-green text-white hover:bg-terminal-green/90">
              {saving ? <Loader2Icon className="size-4 animate-spin" /> : saved ? <CheckIcon className="size-4" /> : <SaveIcon className="size-4" />}
              {saving ? t("save.saving") : saved ? t("save.saved") : t("save.cta")}
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar Navigation */}
          <nav className="w-56 border-r border-terminal-border bg-terminal-cream/50 p-4">
            <ul className="space-y-1">
              {sections.map((section) => (
                <li key={section.id}>
                  <button
                    onClick={() => setActiveSection(section.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded px-3 py-2 font-mono text-sm transition-colors",
                      activeSection === section.id
                        ? "bg-terminal-green/10 text-terminal-green"
                        : "text-terminal-dark hover:bg-terminal-dark/5"
                    )}
                  >
                    <section.icon className="size-4" />
                    {section.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* Settings Panel - continues in next component */}
          <div className="flex-1 overflow-y-auto p-6">
            {error && (
              <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 font-mono text-sm text-red-600">
                {error}
              </div>
            )}
            <SettingsPanel
              section={activeSection}
              formState={formState}
              setFormState={setFormState}
              antigravityAuth={antigravityAuth}
              antigravityLoading={antigravityLoading}
              onAntigravityLogin={handleAntigravityLogin}
              onAntigravityLogout={handleAntigravityLogout}
            />
          </div>
        </div>
      </div>
    </Shell>
  );
}

interface FormState {
  llmProvider: "anthropic" | "openrouter" | "antigravity";
  anthropicApiKey: string;
  openrouterApiKey: string;
  tavilyApiKey: string;
  firecrawlApiKey: string;
  webScraperProvider: "firecrawl" | "local";
  stylyAiApiKey: string;
  chatModel: string;
  embeddingProvider: "openrouter" | "local";
  embeddingModel: string;
  researchModel: string;
  visionModel: string;
  utilityModel: string;
  theme: "dark" | "light" | "system";
  toolLoadingMode: "deferred" | "always";
  embeddingReindexRequired: boolean;
  vectorDBEnabled: boolean;
  vectorSearchHybridEnabled: boolean;
  vectorSearchTokenChunkingEnabled: boolean;
  vectorSearchRerankingEnabled: boolean;
  vectorSearchQueryExpansionEnabled: boolean;
  vectorSearchLlmSynthesisEnabled: boolean;
  vectorSearchV2Percentage: number;
  vectorSearchRrfK: number;
  vectorSearchDenseWeight: number;
  vectorSearchLexicalWeight: number;
  vectorSearchRerankModel: string;
  vectorSearchRerankTopK: number;
  vectorSearchTokenChunkSize: number;
  vectorSearchTokenChunkStride: number;
  vectorSearchMaxFileLines: number;
  vectorSearchMaxLineLength: number;
  // Local Grep settings
  localGrepEnabled: boolean;
  localGrepMaxResults: number;
  localGrepContextLines: number;
  localGrepRespectGitignore: boolean;
  // ComfyUI settings
  comfyuiEnabled: boolean;
  comfyuiBackendPath: string;
}

// Supported local embedding models with their metadata
const LOCAL_EMBEDDING_MODELS = [
  { id: "Xenova/bge-large-en-v1.5", name: "BGE Large (1024 dims, ~1.3GB)", size: "1.3GB" },
  { id: "Xenova/bge-base-en-v1.5", name: "BGE Base (768 dims, ~440MB)", size: "440MB" },
  { id: "Xenova/bge-small-en-v1.5", name: "BGE Small (384 dims, ~130MB)", size: "130MB" },
  { id: "Xenova/all-MiniLM-L6-v2", name: "MiniLM L6 (384 dims, ~90MB)", size: "90MB" },
];

const ANTIGRAVITY_MODELS = getAntigravityModels();

interface LocalEmbeddingModelSelectorProps {
  formState: FormState;
  updateField: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  t: ReturnType<typeof useTranslations<"settings">>;
}

function LocalEmbeddingModelSelector({ formState, updateField, t }: LocalEmbeddingModelSelectorProps) {
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
      setDownloadError("Model download API not available. Please restart the app.");
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
            className="flex-1 rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
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
        className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
      />
      <p className="mt-1 font-mono text-xs text-terminal-muted">
        {t("models.fields.embedding.helper")}
      </p>
    </div>
  );
}

interface SettingsPanelProps {
  section: SettingsSection;
  formState: FormState;
  setFormState: React.Dispatch<React.SetStateAction<FormState>>;
  antigravityAuth: { isAuthenticated: boolean; email?: string; expiresAt?: number } | null;
  antigravityLoading: boolean;
  onAntigravityLogin: () => void;
  onAntigravityLogout: () => void;
}

function SettingsPanel({
  section,
  formState,
  setFormState,
  antigravityAuth,
  antigravityLoading,
  onAntigravityLogin,
  onAntigravityLogout,
}: SettingsPanelProps) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [reindexingAll, setReindexingAll] = useState(false);
  const [reindexError, setReindexError] = useState<string | null>(null);

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
  };

  const handleReindexAll = async () => {
    setReindexingAll(true);
    setReindexError(null);
    try {
      const response = await fetch("/api/vector-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reindex-all" }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to reindex all folders");
      }
      updateField("embeddingReindexRequired", false);
    } catch (err) {
      setReindexError(err instanceof Error ? err.message : "Failed to reindex all folders");
    } finally {
      setReindexingAll(false);
    }
  };

  if (section === "api-keys") {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="mb-4 font-mono text-lg font-semibold text-terminal-dark">{t("api.title")}</h2>
          <div className="space-y-3">
            <label className="flex items-center gap-3">
              <input
                type="radio"
                name="llmProvider"
                value="anthropic"
                checked={formState.llmProvider === "anthropic"}
                onChange={(e) => updateField("llmProvider", e.target.value as "anthropic" | "openrouter" | "antigravity")}
                className="size-4 accent-terminal-green"
              />
              <span className="font-mono text-terminal-dark">{t("api.anthropic")}</span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="radio"
                name="llmProvider"
                value="openrouter"
                checked={formState.llmProvider === "openrouter"}
                onChange={(e) => updateField("llmProvider", e.target.value as "anthropic" | "openrouter" | "antigravity")}
                className="size-4 accent-terminal-green"
              />
              <span className="font-mono text-terminal-dark">{t("api.openrouter")}</span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="radio"
                name="llmProvider"
                value="antigravity"
                checked={formState.llmProvider === "antigravity"}
                onChange={(e) => updateField("llmProvider", e.target.value as "anthropic" | "openrouter" | "antigravity")}
                disabled={!antigravityAuth?.isAuthenticated}
                className="size-4 accent-terminal-green disabled:opacity-50"
              />
              <span className={cn(
                "font-mono",
                antigravityAuth?.isAuthenticated ? "text-terminal-dark" : "text-terminal-muted"
              )}>
                Antigravity
                {antigravityAuth?.isAuthenticated && (
                  <span className="ml-2 text-xs text-terminal-green">✓ Connected</span>
                )}
              </span>
            </label>
          </div>
        </div>

        {/* Antigravity OAuth Section */}
        <div className="rounded-lg border border-terminal-border bg-terminal-bg/50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-mono text-sm font-semibold text-terminal-dark">
                Antigravity - AI Models
              </h3>
              <p className="mt-1 font-mono text-xs text-terminal-muted">
                Access Claude Sonnet 4.5, Gemini 3 Pro, and more via your Antigravity subscription.
              </p>
              {antigravityAuth?.isAuthenticated && antigravityAuth.email && (
                <p className="mt-1 font-mono text-xs text-terminal-green">
                  Signed in as {antigravityAuth.email}
                </p>
              )}
            </div>
            <div>
              {antigravityAuth?.isAuthenticated ? (
                <button
                  onClick={onAntigravityLogout}
                  disabled={antigravityLoading}
                  className="rounded border border-red-300 bg-red-50 px-3 py-1.5 font-mono text-xs text-red-600 hover:bg-red-100 disabled:opacity-50"
                >
                  {antigravityLoading ? "..." : "Disconnect"}
                </button>
              ) : (
                <button
                  onClick={onAntigravityLogin}
                  disabled={antigravityLoading}
                  className="rounded border border-terminal-green bg-terminal-green/10 px-3 py-1.5 font-mono text-xs text-terminal-green hover:bg-terminal-green/20 disabled:opacity-50"
                >
                  {antigravityLoading ? "Connecting..." : "Connect with Google"}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="font-mono text-lg font-semibold text-terminal-dark">{t("api.keysTitle")}</h2>

          <div>
            <label className="mb-1 block font-mono text-sm text-terminal-muted">{t("api.fields.anthropic.label")}</label>
            <input
              type="password"
              value={formState.anthropicApiKey}
              onChange={(e) => updateField("anthropicApiKey", e.target.value)}
              placeholder={t("api.fields.anthropic.placeholder")}
              className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
            />
            <p className="mt-1 font-mono text-xs text-terminal-muted">{t("api.fields.anthropic.helper")}</p>
          </div>

          <div>
            <label className="mb-1 block font-mono text-sm text-terminal-muted">{t("api.fields.openrouter.label")}</label>
            <input
              type="password"
              value={formState.openrouterApiKey}
              onChange={(e) => updateField("openrouterApiKey", e.target.value)}
              placeholder={t("api.fields.openrouter.placeholder")}
              className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
            />
            <p className="mt-1 font-mono text-xs text-terminal-muted">{t("api.fields.openrouter.helper")}</p>
          </div>

          <div>
            <label className="mb-1 block font-mono text-sm text-terminal-muted">{t("api.fields.tavily.label")}</label>
            <input
              type="password"
              value={formState.tavilyApiKey}
              onChange={(e) => updateField("tavilyApiKey", e.target.value)}
              placeholder={t("api.fields.tavily.placeholder")}
              className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
            />
            <p className="mt-1 font-mono text-xs text-terminal-muted">{t("api.fields.tavily.helper")}</p>
          </div>

          <div>
            <label className="mb-1 block font-mono text-sm text-terminal-muted">
              {t("api.fields.webScraperProvider.label")}
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-3">
                <input
                  type="radio"
                  name="webScraperProvider"
                  value="firecrawl"
                  checked={formState.webScraperProvider === "firecrawl"}
                  onChange={(e) => updateField("webScraperProvider", e.target.value as "firecrawl" | "local")}
                  className="size-4 accent-terminal-green"
                />
                <span className="font-mono text-terminal-dark">
                  {t("api.fields.webScraperProvider.options.firecrawl")}
                </span>
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="radio"
                  name="webScraperProvider"
                  value="local"
                  checked={formState.webScraperProvider === "local"}
                  onChange={(e) => updateField("webScraperProvider", e.target.value as "firecrawl" | "local")}
                  className="size-4 accent-terminal-green"
                />
                <span className="font-mono text-terminal-dark">
                  {t("api.fields.webScraperProvider.options.local")}
                </span>
              </label>
            </div>
            <p className="mt-1 font-mono text-xs text-terminal-muted">
              {t("api.fields.webScraperProvider.helper")}
            </p>
          </div>

          <div>
            <label className="mb-1 block font-mono text-sm text-terminal-muted">{t("api.fields.firecrawl.label")}</label>
            <input
              type="password"
              value={formState.firecrawlApiKey}
              onChange={(e) => updateField("firecrawlApiKey", e.target.value)}
              placeholder={t("api.fields.firecrawl.placeholder")}
              className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
            />
            <p className="mt-1 font-mono text-xs text-terminal-muted">{t("api.fields.firecrawl.helper")}</p>
          </div>

          <div>
            <label className="mb-1 block font-mono text-sm text-terminal-muted">{t("api.fields.seline.label")}</label>
            <input
              type="password"
              value={formState.stylyAiApiKey}
              onChange={(e) => updateField("stylyAiApiKey", e.target.value)}
              placeholder={t("api.fields.seline.placeholder")}
              className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
            />
            <p className="mt-1 font-mono text-xs text-terminal-muted">{t("api.fields.seline.helper")}</p>
          </div>
        </div>
      </div>
    );
  }

  if (section === "models") {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="font-mono text-lg font-semibold text-terminal-dark">{t("models.title")}</h2>
          <p className="font-mono text-sm text-terminal-muted">
            {t("models.subtitle")}
          </p>
        </div>

        <div className="rounded border border-terminal-border bg-terminal-cream/30 p-4">
          <p className="font-mono text-xs text-terminal-muted">
            <strong>{t("models.defaults.label")}</strong> {t("models.defaults.value")}
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block font-mono text-sm text-terminal-muted">{t("models.fields.chat.label")}</label>
            {formState.llmProvider === "antigravity" ? (
              <select
                value={formState.chatModel || "claude-sonnet-4-5"}
                onChange={(e) => updateField("chatModel", e.target.value)}
                className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
              >
                {ANTIGRAVITY_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={formState.chatModel ?? ""}
                onChange={(e) => updateField("chatModel", e.target.value)}
                placeholder={
                  formState.llmProvider === "anthropic" ? "claude-sonnet-4-5-20250929" :
                    "x-ai/grok-4.1-fast"
                }
                className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
              />
            )}
            <p className="mt-1 font-mono text-xs text-terminal-muted">
              {t("models.fields.chat.helper")}
            </p>
          </div>

          <div>
            <label className="mb-1 block font-mono text-sm text-terminal-muted">{t("models.fields.research.label")}</label>
            {formState.llmProvider === "antigravity" ? (
              <select
                value={formState.researchModel || "gemini-3-pro-high"}
                onChange={(e) => updateField("researchModel", e.target.value)}
                className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
              >
                {ANTIGRAVITY_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={formState.researchModel ?? ""}
                onChange={(e) => updateField("researchModel", e.target.value)}
                placeholder={
                  formState.llmProvider === "anthropic" ? "claude-sonnet-4-5-20250929" :
                    "x-ai/grok-4.1-fast"
                }
                className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
              />
            )}
            <p className="mt-1 font-mono text-xs text-terminal-muted">
              {t("models.fields.research.helper")}
            </p>
          </div>

          <div>
            <label className="mb-1 block font-mono text-sm text-terminal-muted">{t("models.fields.vision.label")}</label>
            {formState.llmProvider === "antigravity" ? (
              <select
                value={formState.visionModel || "gemini-3-pro-low"}
                onChange={(e) => updateField("visionModel", e.target.value)}
                className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
              >
                {ANTIGRAVITY_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={formState.visionModel ?? ""}
                onChange={(e) => updateField("visionModel", e.target.value)}
                placeholder={
                  formState.llmProvider === "anthropic" ? "claude-sonnet-4-5-20250929" :
                    "google/gemini-2.0-flash-001"
                }
                className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
              />
            )}
            <p className="mt-1 font-mono text-xs text-terminal-muted">
              {t("models.fields.vision.helper")}
            </p>
          </div>

          <div>
            <label className="mb-1 block font-mono text-sm text-terminal-muted">{t("models.fields.utility.label")}</label>
            {formState.llmProvider === "antigravity" ? (
              <select
                value={formState.utilityModel || "gemini-3-flash"}
                onChange={(e) => updateField("utilityModel", e.target.value)}
                className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
              >
                {ANTIGRAVITY_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={formState.utilityModel ?? ""}
                onChange={(e) => updateField("utilityModel", e.target.value)}
                placeholder="google/gemini-2.0-flash-lite-001"
                className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
              />
            )}
            <p className="mt-1 font-mono text-xs text-terminal-muted">
              {t("models.fields.utility.helper")}
            </p>
          </div>

          <div>
            <label className="mb-1 block font-mono text-sm text-terminal-muted">{t("models.fields.embeddingProvider.label")}</label>
            <div className="space-y-2">
              <label className="flex items-center gap-3">
                <input
                  type="radio"
                  name="embeddingProvider"
                  value="openrouter"
                  checked={formState.embeddingProvider === "openrouter"}
                  onChange={(e) => updateField("embeddingProvider", e.target.value as "openrouter" | "local")}
                  className="size-4 accent-terminal-green"
                />
                <span className="font-mono text-terminal-dark">
                  {t("models.fields.embeddingProvider.options.openrouter")}
                </span>
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="radio"
                  name="embeddingProvider"
                  value="local"
                  checked={formState.embeddingProvider === "local"}
                  onChange={(e) => updateField("embeddingProvider", e.target.value as "openrouter" | "local")}
                  className="size-4 accent-terminal-green"
                />
                <span className="font-mono text-terminal-dark">
                  {t("models.fields.embeddingProvider.options.local")}
                </span>
              </label>
            </div>
            <p className="mt-1 font-mono text-xs text-terminal-muted">
              {t("models.fields.embeddingProvider.helper")}
            </p>
          </div>

          <LocalEmbeddingModelSelector
            formState={formState}
            updateField={updateField}
            t={t}
          />
        </div>

        <div className="rounded border border-amber-200 bg-amber-50 p-4">
          <p className="font-mono text-xs text-amber-800">
            <strong>{t("models.tip.title")}</strong> {t("models.tip.body")}
          </p>
        </div>
      </div>
    );
  }

  if (section === "vector-search") {
    return (
      <div className="space-y-6">
        <h2 className="font-mono text-lg font-semibold text-terminal-dark">{t("vector.title")}</h2>
        <p className="font-mono text-sm text-terminal-muted">
          {t("vector.subtitle")}
        </p>

        {formState.embeddingReindexRequired && (
          <div className="rounded border border-amber-200 bg-amber-50 p-4">
            <p className="font-mono text-xs text-amber-800">
              <strong>{t("vector.reindexRequired.title")}</strong> {t("vector.reindexRequired.body")}
            </p>
            {reindexError && (
              <p className="mt-2 font-mono text-xs text-red-600">{reindexError}</p>
            )}
            <div className="mt-3">
              <Button
                onClick={handleReindexAll}
                disabled={reindexingAll}
                className="gap-2 bg-amber-600 text-white hover:bg-amber-600/90"
              >
                {reindexingAll ? t("vector.reindexRequired.running") : t("vector.reindexRequired.cta")}
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="vectorDBEnabled"
            checked={formState.vectorDBEnabled}
            onChange={(e) => updateField("vectorDBEnabled", e.target.checked)}
            className="size-4 accent-terminal-green"
          />
          <label htmlFor="vectorDBEnabled" className="font-mono text-sm text-terminal-dark">
            {t("vector.enable")}
          </label>
        </div>

        {formState.vectorDBEnabled && (
          <div className="space-y-6">
            <div className="rounded border border-terminal-border bg-terminal-cream/50 p-4">
              <p className="font-mono text-sm text-terminal-muted">
                {t("vector.enabled")}
              </p>
              <p className="mt-2 font-mono text-xs text-terminal-muted">
                {t("vector.path")} <code className="rounded bg-terminal-dark/10 px-1">~/.local-data/vectordb/</code>
              </p>
            </div>

            <div className="rounded border border-terminal-border bg-white p-4">
              <h3 className="font-mono text-sm font-semibold text-terminal-dark">{t("vector.v2.title")}</h3>
              <p className="mt-1 font-mono text-xs text-terminal-muted">{t("vector.v2.subtitle")}</p>

              <div className="mt-4 space-y-3">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={formState.vectorSearchHybridEnabled}
                    onChange={(e) => updateField("vectorSearchHybridEnabled", e.target.checked)}
                    className="size-4 accent-terminal-green"
                  />
                  <span className="font-mono text-sm text-terminal-dark">{t("vector.v2.enableHybrid")}</span>
                </label>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={formState.vectorSearchTokenChunkingEnabled}
                    onChange={(e) => updateField("vectorSearchTokenChunkingEnabled", e.target.checked)}
                    className="size-4 accent-terminal-green"
                  />
                  <span className="font-mono text-sm text-terminal-dark">{t("vector.v2.enableTokenChunking")}</span>
                </label>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={formState.vectorSearchRerankingEnabled}
                    onChange={(e) => updateField("vectorSearchRerankingEnabled", e.target.checked)}
                    className="size-4 accent-terminal-green"
                  />
                  <span className="font-mono text-sm text-terminal-dark">{t("vector.v2.enableReranking")}</span>
                </label>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={formState.vectorSearchQueryExpansionEnabled}
                    onChange={(e) => updateField("vectorSearchQueryExpansionEnabled", e.target.checked)}
                    className="size-4 accent-terminal-green"
                  />
                  <span className="font-mono text-sm text-terminal-dark">{t("vector.v2.enableQueryExpansion")}</span>
                </label>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={formState.vectorSearchLlmSynthesisEnabled}
                    onChange={(e) => updateField("vectorSearchLlmSynthesisEnabled", e.target.checked)}
                    className="size-4 accent-terminal-green"
                  />
                  <span className="font-mono text-sm text-terminal-dark">{t("vector.v2.enableLlmSynthesis")}</span>
                </label>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block font-mono text-xs text-terminal-muted">{t("vector.v2.rollout")}</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={formState.vectorSearchV2Percentage}
                    onChange={(e) => updateField("vectorSearchV2Percentage", Number(e.target.value) || 0)}
                    className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-mono text-xs text-terminal-muted">{t("vector.v2.rrfK")}</label>
                  <input
                    type="number"
                    min={1}
                    value={formState.vectorSearchRrfK}
                    onChange={(e) => updateField("vectorSearchRrfK", Number(e.target.value) || 0)}
                    className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-mono text-xs text-terminal-muted">{t("vector.v2.denseWeight")}</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formState.vectorSearchDenseWeight}
                    onChange={(e) => updateField("vectorSearchDenseWeight", Number(e.target.value) || 0)}
                    className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-mono text-xs text-terminal-muted">{t("vector.v2.lexicalWeight")}</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formState.vectorSearchLexicalWeight}
                    onChange={(e) => updateField("vectorSearchLexicalWeight", Number(e.target.value) || 0)}
                    className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-mono text-xs text-terminal-muted">{t("vector.v2.tokenChunkSize")}</label>
                  <input
                    type="number"
                    min={1}
                    value={formState.vectorSearchTokenChunkSize}
                    onChange={(e) => updateField("vectorSearchTokenChunkSize", Number(e.target.value) || 0)}
                    className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-mono text-xs text-terminal-muted">{t("vector.v2.tokenChunkStride")}</label>
                  <input
                    type="number"
                    min={1}
                    value={formState.vectorSearchTokenChunkStride}
                    onChange={(e) => updateField("vectorSearchTokenChunkStride", Number(e.target.value) || 0)}
                    className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-mono text-xs text-terminal-muted">{t("vector.v2.rerankTopK")}</label>
                  <input
                    type="number"
                    min={1}
                    value={formState.vectorSearchRerankTopK}
                    onChange={(e) => updateField("vectorSearchRerankTopK", Number(e.target.value) || 0)}
                    className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block font-mono text-xs text-terminal-muted">{t("vector.v2.rerankModel")}</label>
                  <input
                    type="text"
                    value={formState.vectorSearchRerankModel}
                    onChange={(e) => updateField("vectorSearchRerankModel", e.target.value)}
                    className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block font-mono text-xs text-terminal-muted">{t("vector.v2.maxFileLines")}</label>
                  <input
                    type="number"
                    min={100}
                    value={formState.vectorSearchMaxFileLines}
                    onChange={(e) => updateField("vectorSearchMaxFileLines", Number(e.target.value) || 3000)}
                    className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
                  />
                  <p className="mt-1 font-mono text-xs text-terminal-muted">{t("vector.v2.maxFileLinesHelper")}</p>
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block font-mono text-xs text-terminal-muted">{t("vector.v2.maxLineLength")}</label>
                  <input
                    type="number"
                    min={100}
                    value={formState.vectorSearchMaxLineLength}
                    onChange={(e) => updateField("vectorSearchMaxLineLength", Number(e.target.value) || 1000)}
                    className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
                  />
                  <p className="mt-1 font-mono text-xs text-terminal-muted">{t("vector.v2.maxLineLengthHelper")}</p>
                </div>
              </div>
            </div>

            {/* Local Grep Settings */}
            <div className="mt-6 rounded border border-terminal-border bg-white p-4">
              <h3 className="font-mono text-sm font-semibold text-terminal-dark">Local Grep (ripgrep)</h3>
              <p className="mt-1 font-mono text-xs text-terminal-muted">Fast exact and regex pattern search using ripgrep.</p>

              <div className="mt-4 space-y-3">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={formState.localGrepEnabled}
                    onChange={(e) => updateField("localGrepEnabled", e.target.checked)}
                    className="size-4 accent-terminal-green"
                  />
                  <span className="font-mono text-sm text-terminal-dark">Enable Local Grep Tool</span>
                </label>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={formState.localGrepRespectGitignore}
                    onChange={(e) => updateField("localGrepRespectGitignore", e.target.checked)}
                    className="size-4 accent-terminal-green"
                  />
                  <span className="font-mono text-sm text-terminal-dark">Respect .gitignore</span>
                </label>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block font-mono text-xs text-terminal-muted">Max Results</label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={formState.localGrepMaxResults}
                    onChange={(e) => updateField("localGrepMaxResults", Number(e.target.value) || 100)}
                    className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-mono text-xs text-terminal-muted">Context Lines</label>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={formState.localGrepContextLines}
                    onChange={(e) => updateField("localGrepContextLines", Number(e.target.value) || 2)}
                    className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (section === "preferences") {
    return (
      <PreferencesSection formState={formState} updateField={updateField} />
    );
  }

  if (section === "comfyui") {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="mb-2 font-mono text-lg font-semibold text-terminal-dark">Local Image Generation</h2>
          <p className="font-mono text-sm text-terminal-muted">
            Generate images locally using ComfyUI with the Z-Image Turbo FP8 model.
            Requires Docker Desktop and an NVIDIA GPU.
          </p>
        </div>

        <ComfyUIInstaller
          backendPath={formState.comfyuiBackendPath}
          onBackendPathChange={(path) => updateField("comfyuiBackendPath", path)}
          enabled={formState.comfyuiEnabled}
          onEnabledChange={(enabled) => updateField("comfyuiEnabled", enabled)}
        />
      </div>
    );
  }

  return null;
}

interface PreferencesSectionProps {
  formState: FormState;
  updateField: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
}

function PreferencesSection({ formState, updateField }: PreferencesSectionProps) {
  const t = useTranslations("settings");
  const currentLocale = useLocale() as Locale;

  const handleLocaleChange = (newLocale: Locale) => {
    document.cookie = `${localeCookieName}=${newLocale}; path=/; max-age=31536000`;
    window.location.reload();
  };

  return (
    <div className="space-y-6">
      <h2 className="font-mono text-lg font-semibold text-terminal-dark">{t("preferences.title")}</h2>

      <div>
        <label className="mb-2 block font-mono text-sm text-terminal-muted">{t("preferences.theme.label")}</label>
        <div className="space-y-3">
          {(["dark", "light", "system"] as const).map((theme) => (
            <label key={theme} className="flex items-center gap-3">
              <input
                type="radio"
                name="theme"
                value={theme}
                checked={formState.theme === theme}
                onChange={(e) => updateField("theme", e.target.value as "dark" | "light" | "system")}
                className="size-4 accent-terminal-green"
              />
              <span className="font-mono capitalize text-terminal-dark">{t(`preferences.theme.${theme}`)}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-2 block font-mono text-sm text-terminal-muted">{t("preferences.language.label")}</label>
        <div className="space-y-3">
          {locales.map((locale) => (
            <label key={locale} className="flex items-center gap-3">
              <input
                type="radio"
                name="language"
                value={locale}
                checked={currentLocale === locale}
                onChange={() => handleLocaleChange(locale)}
                className="size-4 accent-terminal-green"
              />
              <span className="font-mono text-terminal-dark">{t(`preferences.language.${locale}`)}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Tool Loading Mode */}
      <div>
        <label className="mb-2 block font-mono text-sm text-terminal-muted">
          {t("preferences.toolLoading.label")}
        </label>
        <div className="space-y-3">
          <label className="flex items-start gap-3">
            <input
              type="radio"
              name="toolLoadingMode"
              value="deferred"
              checked={formState.toolLoadingMode === "deferred" || !formState.toolLoadingMode}
              onChange={() => updateField("toolLoadingMode", "deferred")}
              className="mt-1 size-4 accent-terminal-green"
            />
            <div>
              <span className="font-mono text-terminal-dark">{t("preferences.toolLoading.deferred")}</span>
              <p className="font-mono text-xs text-terminal-muted">{t("preferences.toolLoading.deferredHelper")}</p>
            </div>
          </label>
          <label className="flex items-start gap-3">
            <input
              type="radio"
              name="toolLoadingMode"
              value="always"
              checked={formState.toolLoadingMode === "always"}
              onChange={() => updateField("toolLoadingMode", "always")}
              className="mt-1 size-4 accent-terminal-green"
            />
            <div>
              <span className="font-mono text-terminal-dark">{t("preferences.toolLoading.always")}</span>
              <p className="font-mono text-xs text-terminal-muted">{t("preferences.toolLoading.alwaysHelper")}</p>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
}
