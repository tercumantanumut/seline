"use client";

import { useState, useEffect } from "react";
import { Shell } from "@/components/layout/shell";
import { Button } from "@/components/ui/button";
import { SaveIcon, Loader2Icon, CheckIcon, KeyIcon, PaletteIcon, CpuIcon, DatabaseIcon, ImageIcon, BrainIcon, RefreshCwIcon, XIcon, PlugIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations, useLocale } from "next-intl";
import { locales, localeCookieName, type Locale } from "@/i18n/config";
import { useTheme } from "@/components/theme/theme-provider";
import { toast } from "sonner";
import { getAntigravityModels } from "@/lib/auth/antigravity-models";
import { getCodexModels } from "@/lib/auth/codex-models";
import { getKimiModels } from "@/lib/auth/kimi-models";
import { CustomWorkflowsManager, LocalModelsManager } from "@/components/comfyui";
import { useRouter } from "next/navigation";
import { AdvancedVectorSettings } from "@/components/settings/advanced-vector-settings";
import { MCPSettings } from "@/components/settings/mcp-settings";

interface AppSettings {
  llmProvider: "anthropic" | "openrouter" | "antigravity" | "codex" | "kimi" | "ollama";
  anthropicApiKey?: string;
  openrouterApiKey?: string;
  kimiApiKey?: string;
  ollamaBaseUrl?: string;
  tavilyApiKey?: string;
  firecrawlApiKey?: string;
  webScraperProvider?: "firecrawl" | "local";
  stylyAiApiKey?: string;
  huggingFaceToken?: string;
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
  promptCachingEnabled?: boolean;
  promptCachingTtl?: "5m" | "1h";
  vectorDBEnabled?: boolean;
  vectorSearchHybridEnabled?: boolean;
  vectorSearchTokenChunkingEnabled?: boolean;
  vectorSearchRerankingEnabled?: boolean;
  vectorSearchQueryExpansionEnabled?: boolean;
  vectorSearchLlmSynthesisEnabled?: boolean;

  vectorSearchRrfK?: number;
  vectorSearchDenseWeight?: number;
  vectorSearchLexicalWeight?: number;
  vectorSearchRerankModel?: string;
  vectorSearchRerankTopK?: number;
  vectorSearchTokenChunkSize?: number;
  vectorSearchTokenChunkStride?: number;
  vectorSearchMaxFileLines?: number;
  vectorSearchMaxLineLength?: number;
  comfyuiCustomHost?: string;
  comfyuiCustomPort?: number;
  comfyuiCustomUseHttps?: boolean;
  comfyuiCustomAutoDetect?: boolean;
  comfyuiCustomBaseUrl?: string;
  // Antigravity auth state (read-only, managed via OAuth)
  antigravityAuth?: {
    isAuthenticated: boolean;
    email?: string;
    expiresAt?: number;
  };
  codexAuth?: {
    isAuthenticated: boolean;
    email?: string;
    accountId?: string;
    expiresAt?: number;
  };
}

type SettingsSection = "api-keys" | "models" | "vector-search" | "comfyui" | "preferences" | "memory" | "mcp";

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
    llmProvider: "anthropic" as "anthropic" | "openrouter" | "antigravity" | "codex" | "kimi" | "ollama",
    anthropicApiKey: "",
    openrouterApiKey: "",
    kimiApiKey: "",
    ollamaBaseUrl: "http://localhost:11434/v1",
    tavilyApiKey: "",
    firecrawlApiKey: "",
    webScraperProvider: "firecrawl" as "firecrawl" | "local",
    stylyAiApiKey: "",
    huggingFaceToken: "",
    chatModel: "",
    embeddingProvider: "openrouter" as "openrouter" | "local",
    embeddingModel: "",
    researchModel: "",
    visionModel: "",
    utilityModel: "",
    openrouterArgs: "{}",
    theme: "dark" as "dark" | "light" | "system",
    toolLoadingMode: "deferred" as "deferred" | "always",
    promptCachingEnabled: true,
    promptCachingTtl: "5m" as "5m" | "1h",
    embeddingReindexRequired: false,
    vectorDBEnabled: false,
    vectorSearchHybridEnabled: false,
    vectorSearchTokenChunkingEnabled: false,
    vectorSearchRerankingEnabled: false,
    vectorSearchQueryExpansionEnabled: false,
    vectorSearchLlmSynthesisEnabled: true,

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
    // Local image generation settings
    comfyuiEnabled: false,
    comfyuiBackendPath: "",
    flux2Klein4bEnabled: false,
    flux2Klein4bBackendPath: "",
    flux2Klein9bEnabled: false,
    flux2Klein9bBackendPath: "",
    comfyuiCustomHost: "127.0.0.1",
    comfyuiCustomPort: 8188,
    comfyuiCustomUseHttps: false,
    comfyuiCustomAutoDetect: true,
    comfyuiCustomBaseUrl: "",
  });

  // Antigravity auth state (separate from form state, managed via OAuth)
  const [antigravityAuth, setAntigravityAuth] = useState<{
    isAuthenticated: boolean;
    email?: string;
    expiresAt?: number;
  } | null>(null);
  const [antigravityLoading, setAntigravityLoading] = useState(false);

  // Codex auth state (separate from form state, managed via OAuth)
  const [codexAuth, setCodexAuth] = useState<{
    isAuthenticated: boolean;
    email?: string;
    accountId?: string;
    expiresAt?: number;
  } | null>(null);
  const [codexLoading, setCodexLoading] = useState(false);

  useEffect(() => {
    loadSettings();
    loadAntigravityAuth();
    loadCodexAuth();
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
        kimiApiKey: data.kimiApiKey || "",
        ollamaBaseUrl: data.ollamaBaseUrl || "http://localhost:11434/v1",
        tavilyApiKey: data.tavilyApiKey || "",
        firecrawlApiKey: data.firecrawlApiKey || "",
        webScraperProvider: data.webScraperProvider || "firecrawl",
        stylyAiApiKey: data.stylyAiApiKey || "",
        huggingFaceToken: data.huggingFaceToken || "",
        chatModel: data.chatModel || "",
        embeddingProvider: data.embeddingProvider || "openrouter",
        embeddingModel: data.embeddingModel || "",
        researchModel: data.researchModel || "",
        visionModel: data.visionModel || "",
        utilityModel: data.utilityModel || "",
        openrouterArgs: data.openrouterArgs || "{}",
        theme: data.theme || "dark",
        toolLoadingMode: data.toolLoadingMode || "deferred",
        promptCachingEnabled: data.promptCachingEnabled ?? true,
        promptCachingTtl: data.promptCachingTtl ?? "5m",
        embeddingReindexRequired: data.embeddingReindexRequired ?? false,
        vectorDBEnabled: data.vectorDBEnabled || false,
        vectorSearchHybridEnabled: data.vectorSearchHybridEnabled ?? false,
        vectorSearchTokenChunkingEnabled: data.vectorSearchTokenChunkingEnabled ?? false,
        vectorSearchRerankingEnabled: data.vectorSearchRerankingEnabled ?? false,
        vectorSearchQueryExpansionEnabled: data.vectorSearchQueryExpansionEnabled ?? false,
        vectorSearchLlmSynthesisEnabled: data.vectorSearchLlmSynthesisEnabled ?? true,

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
        // Local image generation settings
        comfyuiEnabled: data.comfyuiEnabled ?? false,
        comfyuiBackendPath: data.comfyuiBackendPath ?? "",
        flux2Klein4bEnabled: data.flux2Klein4bEnabled ?? false,
        flux2Klein4bBackendPath: data.flux2Klein4bBackendPath ?? "",
        flux2Klein9bEnabled: data.flux2Klein9bEnabled ?? false,
        flux2Klein9bBackendPath: data.flux2Klein9bBackendPath ?? "",
        comfyuiCustomHost: data.comfyuiCustomHost ?? "127.0.0.1",
        comfyuiCustomPort: data.comfyuiCustomPort ?? 8188,
        comfyuiCustomUseHttps: data.comfyuiCustomUseHttps ?? false,
        comfyuiCustomAutoDetect: data.comfyuiCustomAutoDetect ?? true,
        comfyuiCustomBaseUrl: data.comfyuiCustomBaseUrl ?? "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.load"));
    } finally {
      setLoading(false);
    }
  };

  const loadAntigravityAuth = async (): Promise<boolean> => {
    try {
      // First, try to refresh if needed (proactive refresh)
      await fetch('/api/auth/antigravity/refresh', { method: 'POST' });

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

  const loadCodexAuth = async (): Promise<boolean> => {
    try {
      await fetch("/api/auth/codex/refresh", { method: "POST" });

      const response = await fetch(`/api/auth/codex?t=${Date.now()}`);
      if (response.ok) {
        const data = await response.json();
        console.log("[Settings] Loaded Codex auth:", data);
        setCodexAuth({
          isAuthenticated: data.authenticated,
          email: data.email,
          accountId: data.accountId,
          expiresAt: data.expiresAt,
        });
        return data.authenticated;
      }
    } catch (err) {
      console.error("Failed to load Codex auth status:", err);
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

  const handleCodexLogin = async () => {
    setCodexLoading(true);
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
      setCodexLoading(false);
    };

    try {
      if (!isElectron) {
        const width = 520;
        const height = 720;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;

        popup = window.open(
          "about:blank",
          "codex-auth",
          `width=${width},height=${height},left=${left},top=${top}`
        );

        if (popup) {
          popup.document.write("<p style='font-family:sans-serif'>Connecting to OpenAI...</p>");
        }
      }

      const authResponse = await fetch("/api/auth/codex/authorize");
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

      messageHandler = (event: MessageEvent) => {
        const allowedOrigins = new Set([
          window.location.origin,
          "http://127.0.0.1:1455",
          "http://localhost:1455",
        ]);
        if (!allowedOrigins.has(event.origin)) return;

        if (event.data?.type === "codex-auth") {
          console.log("[Settings] Received Codex auth message:", event.data);
          popup?.close();
          loadCodexAuth().finally(cleanup);
        }
      };

      window.addEventListener("message", messageHandler);

      pollInterval = setInterval(async () => {
        if (pollInFlight) return;
        pollInFlight = true;
        try {
          const authenticated = await loadCodexAuth();
          if (authenticated) {
            console.log("[Settings] Codex auth confirmed, closing popup...");
            popup?.close();
            cleanup();
            return;
          }

          if (popup?.closed) {
            console.log("[Settings] Codex popup closed, refreshing auth state...");
            await new Promise(resolve => setTimeout(resolve, 500));
            await loadCodexAuth();
            cleanup();
          }
        } finally {
          pollInFlight = false;
        }
      }, 1000);

      timeoutId = setTimeout(() => {
        console.warn("[Settings] Codex OAuth timeout");
        popup?.close();
        cleanup();
      }, 5 * 60 * 1000);
    } catch (err) {
      console.error("Codex login failed:", err);
      cleanup();
    }
  };

  const handleCodexLogout = async () => {
    setCodexLoading(true);
    try {
      const response = await fetch("/api/auth/codex", { method: "DELETE" });
      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(errorText || `Logout failed with status ${response.status}`);
      }
      setCodexAuth(null);
      if (formState.llmProvider === "codex") {
        setFormState(prev => ({ ...prev, llmProvider: "anthropic" }));
      }
    } catch (err) {
      console.error("Codex logout failed:", err);
      toast.error(tc("error"));
    } finally {
      setCodexLoading(false);
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
    { id: "mcp" as const, label: "MCP Servers", icon: PlugIcon },
    { id: "preferences" as const, label: t("nav.preferences"), icon: PaletteIcon },
    { id: "memory" as const, label: t("nav.memory"), icon: BrainIcon },
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
              codexAuth={codexAuth}
              codexLoading={codexLoading}
              onCodexLogin={handleCodexLogin}
              onCodexLogout={handleCodexLogout}
            />
          </div>
        </div>
      </div>
    </Shell>
  );
}

interface FormState {
  llmProvider: "anthropic" | "openrouter" | "antigravity" | "codex" | "kimi" | "ollama";
  anthropicApiKey: string;
  openrouterApiKey: string;
  kimiApiKey: string;
  ollamaBaseUrl: string;
  tavilyApiKey: string;
  firecrawlApiKey: string;
  webScraperProvider: "firecrawl" | "local";
  stylyAiApiKey: string;
  huggingFaceToken: string;
  chatModel: string;
  embeddingProvider: "openrouter" | "local";
  embeddingModel: string;
  researchModel: string;
  visionModel: string;
  utilityModel: string;
  openrouterArgs: string;
  theme: "dark" | "light" | "system";
  toolLoadingMode: "deferred" | "always";
  promptCachingEnabled: boolean;
  promptCachingTtl: "5m" | "1h";
  embeddingReindexRequired: boolean;
  vectorDBEnabled: boolean;
  vectorSearchHybridEnabled: boolean;
  vectorSearchTokenChunkingEnabled: boolean;
  vectorSearchRerankingEnabled: boolean;
  vectorSearchQueryExpansionEnabled: boolean;
  vectorSearchLlmSynthesisEnabled: boolean;

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
  // Local image generation settings
  comfyuiEnabled: boolean;
  comfyuiBackendPath: string;
  flux2Klein4bEnabled: boolean;
  flux2Klein4bBackendPath: string;
  flux2Klein9bEnabled: boolean;
  flux2Klein9bBackendPath: string;
  comfyuiCustomHost: string;
  comfyuiCustomPort: number;
  comfyuiCustomUseHttps: boolean;
  comfyuiCustomAutoDetect: boolean;
  comfyuiCustomBaseUrl: string;
}

// Supported local embedding models with their metadata
const LOCAL_EMBEDDING_MODELS = [
  { id: "Xenova/bge-large-en-v1.5", name: "BGE Large (1024 dims, ~1.3GB)", size: "1.3GB" },
  { id: "Xenova/bge-base-en-v1.5", name: "BGE Base (768 dims, ~440MB)", size: "440MB" },
  { id: "Xenova/bge-small-en-v1.5", name: "BGE Small (384 dims, ~130MB)", size: "130MB" },
  { id: "Xenova/all-MiniLM-L6-v2", name: "MiniLM L6 (384 dims, ~90MB)", size: "90MB" },
];

const ANTIGRAVITY_MODELS = getAntigravityModels();
const CODEX_MODELS = getCodexModels();
const KIMI_MODELS = getKimiModels();

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
  codexAuth: { isAuthenticated: boolean; email?: string; accountId?: string; expiresAt?: number } | null;
  codexLoading: boolean;
  onCodexLogin: () => void;
  onCodexLogout: () => void;
}

function SettingsPanel({
  section,
  formState,
  setFormState,
  antigravityAuth,
  antigravityLoading,
  onAntigravityLogin,
  onAntigravityLogout,
  codexAuth,
  codexLoading,
  onCodexLogin,
  onCodexLogout,
}: SettingsPanelProps) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
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
                onChange={(e) => {
                  updateField("llmProvider", e.target.value as "anthropic" | "openrouter" | "antigravity" | "codex" | "kimi" | "ollama");
                  updateField("chatModel", "");
                  updateField("researchModel", "");
                  updateField("visionModel", "");
                  updateField("utilityModel", "");
                }}
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
                onChange={(e) => {
                  updateField("llmProvider", e.target.value as "anthropic" | "openrouter" | "antigravity" | "codex" | "kimi" | "ollama");
                  updateField("chatModel", "");
                  updateField("researchModel", "");
                  updateField("visionModel", "");
                  updateField("utilityModel", "");
                }}
                className="size-4 accent-terminal-green"
              />
              <span className="font-mono text-terminal-dark">{t("api.openrouter")}</span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="radio"
                name="llmProvider"
                value="ollama"
                checked={formState.llmProvider === "ollama"}
                onChange={(e) => {
                  updateField("llmProvider", e.target.value as "anthropic" | "openrouter" | "antigravity" | "codex" | "kimi" | "ollama");
                  updateField("chatModel", "");
                  updateField("researchModel", "");
                  updateField("visionModel", "");
                  updateField("utilityModel", "");
                }}
                className="size-4 accent-terminal-green"
              />
              <span className="font-mono text-terminal-dark">Ollama (local)</span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="radio"
                name="llmProvider"
                value="kimi"
                checked={formState.llmProvider === "kimi"}
                onChange={(e) => {
                  updateField("llmProvider", e.target.value as "anthropic" | "openrouter" | "antigravity" | "codex" | "kimi" | "ollama");
                  updateField("chatModel", "");
                  updateField("researchModel", "");
                  updateField("visionModel", "");
                  updateField("utilityModel", "");
                }}
                className="size-4 accent-terminal-green"
              />
              <span className="font-mono text-terminal-dark">{t("api.kimi")}</span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="radio"
                name="llmProvider"
                value="codex"
                checked={formState.llmProvider === "codex"}
                onChange={(e) => {
                  updateField("llmProvider", e.target.value as "anthropic" | "openrouter" | "antigravity" | "codex" | "kimi" | "ollama");
                  updateField("chatModel", "");
                  updateField("researchModel", "");
                  updateField("visionModel", "");
                  updateField("utilityModel", "");
                }}
                disabled={!codexAuth?.isAuthenticated}
                className="size-4 accent-terminal-green disabled:opacity-50"
              />
              <span className={cn(
                "font-mono",
                codexAuth?.isAuthenticated ? "text-terminal-dark" : "text-terminal-muted"
              )}>
                Codex
                {codexAuth?.isAuthenticated && (
                  <span className="ml-2 text-xs text-terminal-green">Connected</span>
                )}
              </span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="radio"
                name="llmProvider"
                value="antigravity"
                checked={formState.llmProvider === "antigravity"}
                onChange={(e) => {
                  updateField("llmProvider", e.target.value as "anthropic" | "openrouter" | "antigravity" | "codex" | "kimi" | "ollama");
                  updateField("chatModel", "");
                  updateField("researchModel", "");
                  updateField("visionModel", "");
                  updateField("utilityModel", "");
                }}
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

        {/* Codex OAuth Section */}
        <div className="rounded-lg border border-terminal-border bg-terminal-bg/50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-mono text-sm font-semibold text-terminal-dark">
                OpenAI Codex
              </h3>
              <p className="mt-1 font-mono text-xs text-terminal-muted">
                Connect ChatGPT Plus or Pro to use GPT-5.x Codex models.
              </p>
              {codexAuth?.isAuthenticated && (codexAuth.email || codexAuth.accountId) && (
                <p className="mt-1 font-mono text-xs text-terminal-green">
                  Signed in as {codexAuth.email || codexAuth.accountId}
                </p>
              )}
            </div>
            <div>
              {codexAuth?.isAuthenticated ? (
                <button
                  onClick={onCodexLogout}
                  disabled={codexLoading}
                  className="rounded border border-red-300 bg-red-50 px-3 py-1.5 font-mono text-xs text-red-600 hover:bg-red-100 disabled:opacity-50"
                >
                  {codexLoading ? "..." : "Disconnect"}
                </button>
              ) : (
                <button
                  onClick={onCodexLogin}
                  disabled={codexLoading}
                  className="rounded border border-terminal-green bg-terminal-green/10 px-3 py-1.5 font-mono text-xs text-terminal-green hover:bg-terminal-green/20 disabled:opacity-50"
                >
                  {codexLoading ? "Connecting..." : "Connect with OpenAI"}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="font-mono text-lg font-semibold text-terminal-dark">{t("api.keysTitle")}</h2>

          {formState.llmProvider === "ollama" && (
            <div>
              <label className="mb-1 block font-mono text-sm text-terminal-muted">Ollama Base URL</label>
              <input
                type="text"
                value={formState.ollamaBaseUrl}
                onChange={(e) => updateField("ollamaBaseUrl", e.target.value)}
                placeholder="http://localhost:11434/v1"
                className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
              />
              <p className="mt-1 font-mono text-xs text-terminal-muted">
                Point this to your local Ollama OpenAI-compatible endpoint.
              </p>
            </div>
          )}

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
            <label className="mb-1 block font-mono text-sm text-terminal-muted">{t("api.fields.kimi.label")}</label>
            <input
              type="password"
              value={formState.kimiApiKey}
              onChange={(e) => updateField("kimiApiKey", e.target.value)}
              placeholder={t("api.fields.kimi.placeholder")}
              className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
            />
            <p className="mt-1 font-mono text-xs text-terminal-muted">{t("api.fields.kimi.helper")}</p>
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
            ) : formState.llmProvider === "codex" ? (
              <select
                value={formState.chatModel || "gpt-5.1-codex"}
                onChange={(e) => updateField("chatModel", e.target.value)}
                className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
              >
                {CODEX_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            ) : formState.llmProvider === "kimi" ? (
              <select
                value={formState.chatModel || "kimi-k2.5"}
                onChange={(e) => updateField("chatModel", e.target.value)}
                className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
              >
                {KIMI_MODELS.map((model) => (
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
                  formState.llmProvider === "anthropic"
                    ? "claude-sonnet-4-5-20250929"
                    : formState.llmProvider === "ollama"
                      ? "llama3.1:8b"
                      : "x-ai/grok-4.1-fast"
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
            ) : formState.llmProvider === "codex" ? (
              <select
                value={formState.researchModel || "gpt-5.1-codex"}
                onChange={(e) => updateField("researchModel", e.target.value)}
                className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
              >
                {CODEX_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            ) : formState.llmProvider === "kimi" ? (
              <select
                value={formState.researchModel || "kimi-k2-thinking"}
                onChange={(e) => updateField("researchModel", e.target.value)}
                className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
              >
                {KIMI_MODELS.map((model) => (
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
                  formState.llmProvider === "anthropic"
                    ? "claude-sonnet-4-5-20250929"
                    : formState.llmProvider === "ollama"
                      ? "llama3.1:8b"
                      : "x-ai/grok-4.1-fast"
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
            ) : formState.llmProvider === "codex" ? (
              <select
                value={formState.visionModel || "gpt-5.1-codex"}
                onChange={(e) => updateField("visionModel", e.target.value)}
                className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
              >
                {CODEX_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            ) : formState.llmProvider === "kimi" ? (
              <select
                value={formState.visionModel || "kimi-k2.5"}
                onChange={(e) => updateField("visionModel", e.target.value)}
                className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
              >
                {KIMI_MODELS.map((model) => (
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
                  formState.llmProvider === "anthropic"
                    ? "claude-sonnet-4-5-20250929"
                    : formState.llmProvider === "ollama"
                      ? "llama3.1:8b"
                      : "google/gemini-2.0-flash-001"
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
            ) : formState.llmProvider === "codex" ? (
              <select
                value={formState.utilityModel || "gpt-5.1-codex-mini"}
                onChange={(e) => updateField("utilityModel", e.target.value)}
                className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
              >
                {CODEX_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            ) : formState.llmProvider === "kimi" ? (
              <select
                value={formState.utilityModel || "kimi-k2-turbo-preview"}
                onChange={(e) => updateField("utilityModel", e.target.value)}
                className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
              >
                {KIMI_MODELS.map((model) => (
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
                placeholder={formState.llmProvider === "ollama" ? "llama3.1:8b" : "google/gemini-2.0-flash-lite-001"}
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

          {/* OpenRouter Advanced Options */}
          {formState.llmProvider === "openrouter" && (
            <div>
              <label className="mb-1 block font-mono text-sm text-terminal-muted">
                {t("models.fields.openrouterArgs.label")}
              </label>
              <textarea
                value={formState.openrouterArgs}
                onChange={(e) => updateField("openrouterArgs", e.target.value)}
                placeholder='{ "quant": "q4_0", "thinkingBudget": 512, "includeThoughts": false }'
                className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-xs text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green resize-none"
                rows={4}
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => updateField("openrouterArgs", '{"quant":"q4_0"}')}
                  className="px-2 py-1 text-xs font-mono text-terminal-green hover:bg-terminal-green/10 rounded transition-colors"
                >
                  {t("models.fields.openrouterArgs.presets.q4")}
                </button>
                <button
                  type="button"
                  onClick={() => updateField("openrouterArgs", '{"quant":"q8_0"}')}
                  className="px-2 py-1 text-xs font-mono text-terminal-green hover:bg-terminal-green/10 rounded transition-colors"
                >
                  {t("models.fields.openrouterArgs.presets.q8")}
                </button>
                <button
                  type="button"
                  onClick={() => updateField("openrouterArgs", '{"quant":"auto"}')}
                  className="px-2 py-1 text-xs font-mono text-terminal-green hover:bg-terminal-green/10 rounded transition-colors"
                >
                  {t("models.fields.openrouterArgs.presets.auto")}
                </button>
                <button
                  type="button"
                  onClick={() => updateField("openrouterArgs", '{"thinkingBudget":0}')}
                  className="px-2 py-1 text-xs font-mono text-terminal-green hover:bg-terminal-green/10 rounded transition-colors"
                >
                  {t("models.fields.openrouterArgs.presets.noThinking")}
                </button>
              </div>
              <p className="mt-2 font-mono text-xs text-terminal-muted">
                {t("models.fields.openrouterArgs.helper")}
              </p>
            </div>
          )}
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

            {/* LLM Synthesis Toggle - Main visible option */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="llmSynthesisEnabled"
                checked={formState.vectorSearchLlmSynthesisEnabled}
                onChange={(e) => updateField("vectorSearchLlmSynthesisEnabled", e.target.checked)}
                className="size-4 accent-terminal-green"
              />
              <label htmlFor="llmSynthesisEnabled" className="font-mono text-sm text-terminal-dark">
                {t("vector.enableLlmSynthesis")}
              </label>
            </div>

            {/* Advanced Settings Accordion */}
            <AdvancedVectorSettings
              hybridEnabled={formState.vectorSearchHybridEnabled}
              onHybridEnabledChange={(v) => updateField("vectorSearchHybridEnabled", v)}
              denseWeight={formState.vectorSearchDenseWeight}
              onDenseWeightChange={(v) => updateField("vectorSearchDenseWeight", v)}
              lexicalWeight={formState.vectorSearchLexicalWeight}
              onLexicalWeightChange={(v) => updateField("vectorSearchLexicalWeight", v)}
              rrfK={formState.vectorSearchRrfK}
              onRrfKChange={(v) => updateField("vectorSearchRrfK", v)}
              tokenChunkingEnabled={formState.vectorSearchTokenChunkingEnabled}
              onTokenChunkingEnabledChange={(v) => updateField("vectorSearchTokenChunkingEnabled", v)}
              chunkSize={formState.vectorSearchTokenChunkSize}
              onChunkSizeChange={(v) => updateField("vectorSearchTokenChunkSize", v)}
              chunkStride={formState.vectorSearchTokenChunkStride}
              onChunkStrideChange={(v) => updateField("vectorSearchTokenChunkStride", v)}
              rerankingEnabled={formState.vectorSearchRerankingEnabled}
              onRerankingEnabledChange={(v) => updateField("vectorSearchRerankingEnabled", v)}
              rerankTopK={formState.vectorSearchRerankTopK}
              onRerankTopKChange={(v) => updateField("vectorSearchRerankTopK", v)}
              rerankModel={formState.vectorSearchRerankModel}
              onRerankModelChange={(v) => updateField("vectorSearchRerankModel", v)}
              queryExpansionEnabled={formState.vectorSearchQueryExpansionEnabled}
              onQueryExpansionEnabledChange={(v) => updateField("vectorSearchQueryExpansionEnabled", v)}
              maxFileLines={formState.vectorSearchMaxFileLines}
              onMaxFileLinesChange={(v) => updateField("vectorSearchMaxFileLines", v)}
              maxLineLength={formState.vectorSearchMaxLineLength}
              onMaxLineLengthChange={(v) => updateField("vectorSearchMaxLineLength", v)}
            />

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
          <h2 className="mb-2 text-lg font-semibold text-terminal-text">Local Image Generation</h2>
          <p className="text-sm text-terminal-muted">
            Generate images locally using Docker-based backends. Requires Docker Desktop and an NVIDIA GPU.
          </p>
        </div>

        <div className="rounded-xl border border-terminal-border bg-terminal-bg/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-terminal-border bg-terminal-green/15 text-terminal-green">
                <KeyIcon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-terminal-text">Hugging Face Token</p>
                <p className="text-xs text-terminal-muted">
                  Required for downloading gated models like FLUX.2 Klein.
                </p>
              </div>
            </div>
            <a
              href="https://huggingface.co/settings/tokens"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-terminal-green underline hover:text-terminal-green/80"
            >
              Get your token here
            </a>
          </div>
          <input
            type="password"
            value={formState.huggingFaceToken}
            onChange={(e) => updateField("huggingFaceToken", e.target.value)}
            placeholder="hf_..."
            className="mt-3 w-full rounded border border-terminal-border bg-terminal-bg/50 px-3 py-2 text-sm text-terminal-text placeholder:text-terminal-muted/60 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
          />
        </div>

        <div className="space-y-3">
          <p className="text-xs uppercase tracking-wide text-terminal-muted">Backends</p>
          <LocalModelsManager
            zImageEnabled={formState.comfyuiEnabled}
            zImageBackendPath={formState.comfyuiBackendPath}
            onZImageEnabledChange={(enabled: boolean) => updateField("comfyuiEnabled", enabled)}
            onZImageBackendPathChange={(path: string) => updateField("comfyuiBackendPath", path)}
            flux4bEnabled={formState.flux2Klein4bEnabled}
            flux4bBackendPath={formState.flux2Klein4bBackendPath}
            onFlux4bEnabledChange={(enabled: boolean) => updateField("flux2Klein4bEnabled", enabled)}
            onFlux4bBackendPathChange={(path: string) => updateField("flux2Klein4bBackendPath", path)}
            flux9bEnabled={formState.flux2Klein9bEnabled}
            flux9bBackendPath={formState.flux2Klein9bBackendPath}
            onFlux9bEnabledChange={(enabled: boolean) => updateField("flux2Klein9bEnabled", enabled)}
            onFlux9bBackendPathChange={(path: string) => updateField("flux2Klein9bBackendPath", path)}
          />
        </div>

        <div className="border-t border-terminal-border/60 pt-6 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-terminal-text">Custom ComfyUI Workflows</h3>
            <p className="text-xs text-terminal-muted">
              Upload or paste workflow JSON, then review inputs and outputs before saving.
            </p>
          </div>
          <CustomWorkflowsManager
            connectionBaseUrl={formState.comfyuiCustomBaseUrl}
            connectionHost={formState.comfyuiCustomHost}
            connectionPort={formState.comfyuiCustomPort}
            connectionUseHttps={formState.comfyuiCustomUseHttps}
            connectionAutoDetect={formState.comfyuiCustomAutoDetect}
            onConnectionBaseUrlChange={(value: string) => updateField("comfyuiCustomBaseUrl", value)}
            onConnectionHostChange={(value: string) => updateField("comfyuiCustomHost", value)}
            onConnectionPortChange={(value: number) => updateField("comfyuiCustomPort", value)}
            onConnectionUseHttpsChange={(value: boolean) => updateField("comfyuiCustomUseHttps", value)}
            onConnectionAutoDetectChange={(value: boolean) => updateField("comfyuiCustomAutoDetect", value)}
          />
        </div>
      </div>
    );
  }

  if (section === "memory") {
    return <MemorySection />;
  }

  if (section === "mcp") {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="mb-2 font-mono text-lg font-semibold text-terminal-dark">
            MCP Servers
          </h2>
          <p className="mb-4 font-mono text-sm text-terminal-muted">
            Connect to external MCP (Model Context Protocol) servers to extend your agent&apos;s capabilities.
          </p>
        </div>
        <MCPSettings />
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

      {/* Prompt Caching */}
      <div className="space-y-4">
        <h3 className="font-mono text-base font-semibold text-terminal-dark">
          Prompt Caching
        </h3>
        <p className="font-mono text-xs text-terminal-muted">
          Cache system prompts and conversation history to reduce costs by 70-85%. Works with Anthropic (direct) and OpenRouter (Anthropic, OpenAI, Gemini, and more).
        </p>

        {/* Enable/Disable Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <label className="font-mono text-sm text-terminal-dark">
              Enable Prompt Caching
            </label>
            <p className="mt-1 font-mono text-xs text-terminal-muted">
              Save up to 90% on input tokens for multi-turn conversations
            </p>
          </div>
          <input
            type="checkbox"
            checked={formState.promptCachingEnabled ?? true}
            onChange={(e) => updateField("promptCachingEnabled", e.target.checked)}
            className="size-5 accent-terminal-green"
          />
        </div>

        {/* TTL Selection */}
        {formState.promptCachingEnabled !== false && (
          <div>
            <label className="mb-2 block font-mono text-sm text-terminal-dark">
              Cache Duration
            </label>
            <div className="space-y-3">
              <label className="flex items-start gap-3">
                <input
                  type="radio"
                  name="promptCachingTtl"
                  value="5m"
                  checked={formState.promptCachingTtl === "5m" || !formState.promptCachingTtl}
                  onChange={() => updateField("promptCachingTtl", "5m")}
                  className="mt-1 size-4 accent-terminal-green"
                />
                <div>
                  <span className="font-mono text-terminal-dark">5 minutes (Recommended)</span>
                  <p className="font-mono text-xs text-terminal-muted">
                    Standard cache duration. 1.25x write cost, auto-refreshes on use. Best for frequent conversations.
                  </p>
                </div>
              </label>
              <label className="flex items-start gap-3">
                <input
                  type="radio"
                  name="promptCachingTtl"
                  value="1h"
                  checked={formState.promptCachingTtl === "1h"}
                  onChange={() => updateField("promptCachingTtl", "1h")}
                  className="mt-1 size-4 accent-terminal-green"
                />
                <div>
                  <span className="font-mono text-terminal-dark">1 hour (Premium)</span>
                  <p className="font-mono text-xs text-terminal-muted">
                    Extended cache duration. 2x write cost. Best for infrequent or long-running sessions.
                  </p>
                </div>
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MemorySection() {
  const t = useTranslations("settings");
  const router = useRouter();
  const [memoryDefaults, setMemoryDefaults] = useState<{
    visual_preferences: string[];
    communication_style: string[];
    workflow_patterns: string[];
  }>({
    visual_preferences: [],
    communication_style: [],
    workflow_patterns: [],
  });
  const [newMemory, setNewMemory] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<"visual_preferences" | "communication_style" | "workflow_patterns">("visual_preferences");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resettingOnboarding, setResettingOnboarding] = useState(false);

  // Load global memory defaults on mount
  useEffect(() => {
    loadMemoryDefaults();
  }, []);

  const loadMemoryDefaults = async () => {
    try {
      const response = await fetch("/api/settings");
      if (response.ok) {
        const settings = await response.json();
        if (settings.globalMemoryDefaults) {
          setMemoryDefaults({
            visual_preferences: settings.globalMemoryDefaults.visual_preferences || [],
            communication_style: settings.globalMemoryDefaults.communication_style || [],
            workflow_patterns: settings.globalMemoryDefaults.workflow_patterns || [],
          });
        }
      }
    } catch (error) {
      console.error("Failed to load memory defaults:", error);
    } finally {
      setLoading(false);
    }
  };

  const saveMemoryDefaults = async (newDefaults: typeof memoryDefaults) => {
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ globalMemoryDefaults: newDefaults }),
      });
    } catch (error) {
      console.error("Failed to save memory defaults:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleAddMemory = () => {
    if (!newMemory.trim()) return;

    const updated = {
      ...memoryDefaults,
      [selectedCategory]: [...memoryDefaults[selectedCategory], newMemory.trim()],
    };
    setMemoryDefaults(updated);
    saveMemoryDefaults(updated);
    setNewMemory("");
  };

  const handleRemoveMemory = (category: keyof typeof memoryDefaults, index: number) => {
    const updated = {
      ...memoryDefaults,
      [category]: memoryDefaults[category].filter((_, i) => i !== index),
    };
    setMemoryDefaults(updated);
    saveMemoryDefaults(updated);
  };

  const handleResetOnboarding = async () => {
    setResettingOnboarding(true);
    try {
      await fetch("/api/onboarding", { method: "DELETE" });
      router.push("/onboarding");
    } catch (error) {
      console.error("Failed to reset onboarding:", error);
      setResettingOnboarding(false);
    }
  };

  const categoryLabels = {
    visual_preferences: "Visual Preferences",
    communication_style: "Communication Style",
    workflow_patterns: "Workflow Patterns",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2Icon className="size-6 animate-spin text-terminal-green" />
      </div>
    );
  }

  const totalMemories = Object.values(memoryDefaults).flat().length;

  return (
    <div className="space-y-8">
      {/* Global Memory Defaults */}
      <div className="space-y-4">
        <div>
          <h2 className="font-mono text-lg font-semibold text-terminal-dark flex items-center gap-2">
            <BrainIcon className="size-5 text-terminal-green" />
            {t("memoryDefaults.title")}
          </h2>
          <p className="font-mono text-sm text-terminal-muted mt-1">
            {t("memoryDefaults.description")}
          </p>
        </div>

        {/* Add new memory */}
        <div className="rounded-lg border border-terminal-border bg-white p-4">
          <h3 className="font-mono text-sm font-medium text-terminal-dark mb-3">
            {t("memoryDefaults.addNew")}
          </h3>
          <div className="flex gap-2">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as typeof selectedCategory)}
              className="rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm"
            >
              {Object.entries(categoryLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={newMemory}
              onChange={(e) => setNewMemory(e.target.value)}
              placeholder={t("memoryDefaults.placeholder")}
              className="flex-1 rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleAddMemory()}
            />
            <Button
              onClick={handleAddMemory}
              disabled={!newMemory.trim() || saving}
              className="gap-2 bg-terminal-green text-white hover:bg-terminal-green/90"
            >
              {t("memoryDefaults.add")}
            </Button>
          </div>
        </div>

        {/* Display existing memories */}
        {totalMemories === 0 ? (
          <div className="rounded-lg border border-dashed border-terminal-border bg-terminal-cream/30 p-6 text-center">
            <p className="font-mono text-sm text-terminal-muted">
              {t("memoryDefaults.empty")}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(memoryDefaults).map(([category, memories]) => {
              if (memories.length === 0) return null;

              return (
                <div key={category} className="rounded-lg border border-terminal-border bg-terminal-cream/30 p-4">
                  <h3 className="font-mono text-sm font-medium text-terminal-dark mb-3">
                    {categoryLabels[category as keyof typeof categoryLabels]}
                  </h3>
                  <ul className="space-y-2">
                    {memories.map((memory, index) => (
                      <li
                        key={index}
                        className="flex items-center gap-2 bg-white rounded px-3 py-2 border border-terminal-border"
                      >
                        <span className="flex-1 font-mono text-sm text-terminal-dark">{memory}</span>
                        <button
                          onClick={() => handleRemoveMemory(category as keyof typeof memoryDefaults, index)}
                          className="text-terminal-muted hover:text-red-500 transition-colors p-1"
                        >
                          <XIcon className="size-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Re-run Onboarding */}
      <div className="border-t border-terminal-border pt-6">
        <div className="rounded-lg border border-terminal-border bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-mono text-sm font-semibold text-terminal-dark">
                {t("onboarding.title")}
              </h3>
              <p className="font-mono text-xs text-terminal-muted mt-1">
                {t("onboarding.description")}
              </p>
            </div>
            <Button
              onClick={handleResetOnboarding}
              disabled={resettingOnboarding}
              variant="outline"
              className="gap-2 font-mono"
            >
              {resettingOnboarding ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <RefreshCwIcon className="size-4" />
              )}
              {t("onboarding.cta")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
