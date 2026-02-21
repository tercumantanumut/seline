"use client";

import { useState, useEffect } from "react";
import { Shell } from "@/components/layout/shell";
import { Button } from "@/components/ui/button";
import { SaveIcon, Loader2Icon, CheckIcon, KeyIcon, PaletteIcon, CpuIcon, DatabaseIcon, ImageIcon, BrainIcon, RefreshCwIcon, XIcon, PlugIcon, Volume2Icon, PackageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations, useLocale } from "next-intl";
import { locales, localeCookieName, type Locale } from "@/i18n/config";
import { useTheme } from "@/components/theme/theme-provider";
import { toast } from "sonner";
import { getAntigravityModels } from "@/lib/auth/antigravity-models";
import { getCodexModels } from "@/lib/auth/codex-models";
import { getClaudeCodeModels } from "@/lib/auth/claudecode-models";
import { getKimiModels } from "@/lib/auth/kimi-models";
import { CustomWorkflowsManager, LocalModelsManager } from "@/components/comfyui";
import { useRouter } from "next/navigation";
import { AdvancedVectorSettings } from "@/components/settings/advanced-vector-settings";
import { MCPSettings } from "@/components/settings/mcp-settings";
import { PluginSettings } from "@/components/settings/plugin-settings";
import {
  SettingsField,
  SettingsOptionGroup,
  SettingsPanelCard,
  SettingsRadioCard,
  SettingsToggleRow,
  settingsInputClassName,
  settingsSectionShellClassName,
} from "@/components/settings/settings-form-layout";
import {
  LOCAL_EMBEDDING_MODELS as SHARED_LOCAL_EMBEDDING_MODELS,
  formatDimensionLabel,
} from "@/lib/config/embedding-models";
import { WHISPER_MODELS, DEFAULT_WHISPER_MODEL } from "@/lib/config/whisper-models";

interface AppSettings {
  llmProvider: "anthropic" | "openrouter" | "antigravity" | "codex" | "kimi" | "ollama" | "claudecode";
  anthropicApiKey?: string;
  openrouterApiKey?: string;
  kimiApiKey?: string;
  openaiApiKey?: string;
  ollamaBaseUrl?: string;
  tavilyApiKey?: string;
  firecrawlApiKey?: string;
  webScraperProvider?: "firecrawl" | "local";
  webSearchProvider?: "tavily" | "duckduckgo" | "auto";
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
  postEditHooksPreset?: "off" | "fast" | "strict";
  postEditHooksEnabled?: boolean;
  postEditTypecheckEnabled?: boolean;
  postEditLintEnabled?: boolean;
  postEditTypecheckScope?: "auto" | "app" | "lib" | "electron" | "tooling" | "all";
  postEditRunInPatchTool?: boolean;
  rtkEnabled?: boolean;
  rtkInstalled?: boolean;
  rtkVerbosity?: 0 | 1 | 2 | 3;
  rtkUltraCompact?: boolean;
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

type SettingsSection = "api-keys" | "models" | "vector-search" | "comfyui" | "preferences" | "memory" | "mcp" | "plugins" | "voice";

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
    llmProvider: "anthropic" as "anthropic" | "openrouter" | "antigravity" | "codex" | "kimi" | "ollama" | "claudecode",
    anthropicApiKey: "",
    openrouterApiKey: "",
    kimiApiKey: "",
    openaiApiKey: "",
    ollamaBaseUrl: "http://localhost:11434/v1",
    tavilyApiKey: "",
    firecrawlApiKey: "",
    webScraperProvider: "firecrawl" as "firecrawl" | "local",
    webSearchProvider: "auto" as "tavily" | "duckduckgo" | "auto",
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
    toolLoadingMode: "always" as "deferred" | "always",
    postEditHooksPreset: "off" as "off" | "fast" | "strict",
    postEditHooksEnabled: false,
    postEditTypecheckEnabled: false,
    postEditLintEnabled: false,
    postEditTypecheckScope: "auto" as "auto" | "app" | "lib" | "electron" | "tooling" | "all",
    postEditRunInPatchTool: false,
    promptCachingEnabled: true,
    rtkEnabled: false,
    rtkVerbosity: 0 as 0 | 1 | 2 | 3,
    rtkUltraCompact: false,
    // Developer Workspace settings
    devWorkspaceEnabled: false,
    devWorkspaceAutoCleanup: true,
    devWorkspaceAutoCleanupDays: 7,
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
    vectorSearchRerankModel: "cross-encoder/ms-marco-MiniLM-L-6-v2",
    vectorSearchRerankTopK: 20,
    vectorSearchTokenChunkSize: 16,
    vectorSearchTokenChunkStride: 8,
    vectorSearchMaxFileLines: 3000,
    vectorSearchMaxLineLength: 1000,
    // Local Grep settings
    localGrepEnabled: true,
    localGrepMaxResults: 20,
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
    // Voice & Audio settings
    ttsEnabled: false,
    ttsProvider: "edge" as "elevenlabs" | "openai" | "edge",
    ttsAutoMode: "off" as "off" | "always" | "channels-only",
    elevenLabsApiKey: "",
    elevenLabsVoiceId: "",
    openaiTtsVoice: "alloy",
    ttsSummarizeThreshold: 500,
    sttEnabled: false,
    sttProvider: "openai" as "openai" | "local",
    sttLocalModel: DEFAULT_WHISPER_MODEL,
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

  // Claude Code auth state (separate from form state, managed via OAuth)
  const [claudecodeAuth, setClaudecodeAuth] = useState<{
    isAuthenticated: boolean;
    email?: string;
    expiresAt?: number;
  } | null>(null);
  const [claudecodeLoading, setClaudecodeLoading] = useState(false);

  useEffect(() => {
    document.title = `${t("title")} — Seline`;
    return () => { document.title = "Seline"; };
  }, [t]);

  useEffect(() => {
    loadSettings();
    loadAntigravityAuth();
    loadCodexAuth();
    loadClaudeCodeAuth();
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
        openaiApiKey: data.openaiApiKey || "",
        ollamaBaseUrl: data.ollamaBaseUrl || "http://localhost:11434/v1",
        tavilyApiKey: data.tavilyApiKey || "",
        firecrawlApiKey: data.firecrawlApiKey || "",
        webScraperProvider: data.webScraperProvider || "firecrawl",
        webSearchProvider: data.webSearchProvider || "auto",
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
        toolLoadingMode: data.toolLoadingMode || "always",
        postEditHooksPreset: data.postEditHooksPreset ?? "off",
        postEditHooksEnabled: data.postEditHooksEnabled ?? false,
        postEditTypecheckEnabled: data.postEditTypecheckEnabled ?? false,
        postEditLintEnabled: data.postEditLintEnabled ?? false,
        postEditTypecheckScope: data.postEditTypecheckScope ?? "auto",
        postEditRunInPatchTool: data.postEditRunInPatchTool ?? false,
        promptCachingEnabled: data.promptCachingEnabled ?? true,
        rtkEnabled: data.rtkEnabled ?? false,
        rtkVerbosity: data.rtkVerbosity ?? 0,
        rtkUltraCompact: data.rtkUltraCompact ?? false,
        devWorkspaceEnabled: data.devWorkspaceEnabled ?? false,
        devWorkspaceAutoCleanup: data.devWorkspaceAutoCleanup ?? true,
        devWorkspaceAutoCleanupDays: data.devWorkspaceAutoCleanupDays ?? 7,
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
        vectorSearchRerankModel: data.vectorSearchRerankModel ?? "cross-encoder/ms-marco-MiniLM-L-6-v2",
        vectorSearchRerankTopK: data.vectorSearchRerankTopK ?? 20,
        vectorSearchTokenChunkSize: data.vectorSearchTokenChunkSize ?? 16,
        vectorSearchTokenChunkStride: data.vectorSearchTokenChunkStride ?? 8,
        vectorSearchMaxFileLines: data.vectorSearchMaxFileLines ?? 3000,
        vectorSearchMaxLineLength: data.vectorSearchMaxLineLength ?? 1000,
        // Local Grep settings
        localGrepEnabled: data.localGrepEnabled ?? true,
        localGrepMaxResults: data.localGrepMaxResults ?? 20,
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
        // Voice & Audio settings
        ttsEnabled: data.ttsEnabled ?? false,
        ttsProvider: data.ttsProvider ?? "edge",
        ttsAutoMode: data.ttsAutoMode ?? "off",
        elevenLabsApiKey: data.elevenLabsApiKey ?? "",
        elevenLabsVoiceId: data.elevenLabsVoiceId ?? "",
        openaiTtsVoice: data.openaiTtsVoice ?? "alloy",
        ttsSummarizeThreshold: data.ttsSummarizeThreshold ?? 500,
        sttEnabled: data.sttEnabled ?? false,
        sttProvider: data.sttProvider ?? "openai",
        sttLocalModel: data.sttLocalModel ?? DEFAULT_WHISPER_MODEL,
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

  const loadClaudeCodeAuth = async (): Promise<boolean> => {
    try {
      await fetch("/api/auth/claudecode/refresh", { method: "POST" });

      const response = await fetch(`/api/auth/claudecode?t=${Date.now()}`);
      if (response.ok) {
        const data = await response.json();
        console.log("[Settings] Loaded Claude Code auth:", data);
        setClaudecodeAuth({
          isAuthenticated: data.authenticated,
          email: data.email,
          expiresAt: data.expiresAt,
        });
        return data.authenticated;
      }
    } catch (err) {
      console.error("Failed to load Claude Code auth status:", err);
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
          popup.document.write(`<p style='font-family:sans-serif'>${t("errors.connectingToGoogle")}</p>`);
        }
      }

      // Get the OAuth authorization URL from our API
      const authResponse = await fetch("/api/auth/antigravity/authorize");
      const authData = await authResponse.json();

      if (!authData.success || !authData.url) {
        popup?.close();
        throw new Error(authData.error || t("errors.authUrlFailed"));
      }

      if (isElectron && electronAPI?.shell?.openExternal) {
        await electronAPI.shell.openExternal(authData.url);
      } else if (popup) {
        popup.location.href = authData.url;
      } else {
        toast.error(t("errors.popupBlocked"));
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
      toast.error(t("errors.loginFailed"));
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
          popup.document.write(`<p style='font-family:sans-serif'>${t("errors.connectingToOpenAI")}</p>`);
        }
      }

      const authResponse = await fetch("/api/auth/codex/authorize");
      const authData = await authResponse.json();

      if (!authData.success || !authData.url) {
        popup?.close();
        throw new Error(authData.error || t("errors.authUrlFailed"));
      }

      if (isElectron && electronAPI?.shell?.openExternal) {
        await electronAPI.shell.openExternal(authData.url);
      } else if (popup) {
        popup.location.href = authData.url;
      } else {
        toast.error(t("errors.popupBlocked"));
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
      toast.error(t("errors.loginFailed"));
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

  const [claudeCodePasteMode, setClaudeCodePasteMode] = useState(false);

  const handleClaudeCodeLogin = async () => {
    setClaudecodeLoading(true);
    const electronAPI = typeof window !== "undefined" && "electronAPI" in window
      ? (window as unknown as { electronAPI?: { isElectron?: boolean; shell?: { openExternal: (url: string) => Promise<void> } } }).electronAPI
      : undefined;
    const isElectron = !!electronAPI?.isElectron;

    try {
      const authResponse = await fetch("/api/auth/claudecode/authorize");
      const authData = await authResponse.json();

      if (!authData.success || !authData.url) {
        throw new Error(authData.error || t("errors.authUrlFailed"));
      }

      if (isElectron && electronAPI?.shell?.openExternal) {
        await electronAPI.shell.openExternal(authData.url);
      } else {
        window.open(authData.url, "_blank");
      }

      // Switch to paste mode
      setClaudeCodePasteMode(true);
    } catch (err) {
      console.error("Claude Code login failed:", err);
      toast.error(t("errors.authStartFailed"));
    } finally {
      setClaudecodeLoading(false);
    }
  };

  const handleClaudeCodePasteSubmit = async (code: string) => {
    setClaudecodeLoading(true);
    try {
      const response = await fetch("/api/auth/claudecode/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to exchange authorization code");
      }

      await loadClaudeCodeAuth();
      setClaudeCodePasteMode(false);
    } catch (err) {
      console.error("Claude Code code exchange failed:", err);
      toast.error(err instanceof Error ? err.message : t("errors.codeExchangeFailed"));
    } finally {
      setClaudecodeLoading(false);
    }
  };

  const handleClaudeCodeLogout = async () => {
    setClaudecodeLoading(true);
    try {
      const response = await fetch("/api/auth/claudecode", { method: "DELETE" });
      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(errorText || `Logout failed with status ${response.status}`);
      }
      setClaudecodeAuth(null);
      if (formState.llmProvider === "claudecode") {
        setFormState(prev => ({ ...prev, llmProvider: "anthropic" }));
      }
    } catch (err) {
      console.error("Claude Code logout failed:", err);
      toast.error(tc("error"));
    } finally {
      setClaudecodeLoading(false);
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
      if (!response.ok) {
        // Try to extract validation error details from the response
        try {
          const errorData = await response.json();
          if (errorData.details?.length) {
            throw new Error(errorData.details.join(" "));
          }
        } catch (parseErr) {
          // If JSON parsing fails, use generic error
          if (parseErr instanceof Error && parseErr.message !== t("errors.save")) {
            throw parseErr;
          }
        }
        throw new Error(t("errors.save"));
      }
      const result = await response.json();
      if (result.folderResyncRecommended) {
        toast.warning(
          result.folderResyncMessage || "Search index settings changed. If results look outdated, refresh synced folders in Agent Settings.",
          { duration: 9000 }
        );
      }
      // Show validation warnings as toasts
      if (result.warnings?.length) {
        for (const warning of result.warnings) {
          toast.warning(warning);
        }
      }
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
    { id: "comfyui" as const, label: t("nav.comfyui"), icon: ImageIcon },
    { id: "mcp" as const, label: t("nav.mcp"), icon: PlugIcon },
    { id: "plugins" as const, label: t("nav.plugins"), icon: PackageIcon },
    { id: "voice" as const, label: t("nav.voice"), icon: Volume2Icon },
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
              claudecodeAuth={claudecodeAuth}
              claudecodeLoading={claudecodeLoading}
              onClaudeCodeLogin={handleClaudeCodeLogin}
              onClaudeCodeLogout={handleClaudeCodeLogout}
              claudeCodePasteMode={claudeCodePasteMode}
              onClaudeCodePasteSubmit={handleClaudeCodePasteSubmit}
              onClaudeCodePasteCancel={() => setClaudeCodePasteMode(false)}
            />
          </div>
        </div>
      </div>
    </Shell>
  );
}

interface FormState {
  llmProvider: "anthropic" | "openrouter" | "antigravity" | "codex" | "kimi" | "ollama" | "claudecode";
  anthropicApiKey: string;
  openrouterApiKey: string;
  kimiApiKey: string;
  openaiApiKey: string;
  ollamaBaseUrl: string;
  tavilyApiKey: string;
  firecrawlApiKey: string;
  webScraperProvider: "firecrawl" | "local";
  webSearchProvider: "tavily" | "duckduckgo" | "auto";
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
  postEditHooksPreset: "off" | "fast" | "strict";
  postEditHooksEnabled: boolean;
  postEditTypecheckEnabled: boolean;
  postEditLintEnabled: boolean;
  postEditTypecheckScope: "auto" | "app" | "lib" | "electron" | "tooling" | "all";
  postEditRunInPatchTool: boolean;
  promptCachingEnabled: boolean;
  rtkEnabled: boolean;
  rtkVerbosity: 0 | 1 | 2 | 3;
  rtkUltraCompact: boolean;
  devWorkspaceEnabled: boolean;
  devWorkspaceAutoCleanup: boolean;
  devWorkspaceAutoCleanupDays: number;
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
  // Voice & Audio settings
  ttsEnabled: boolean;
  ttsProvider: "elevenlabs" | "openai" | "edge";
  ttsAutoMode: "off" | "always" | "channels-only";
  elevenLabsApiKey: string;
  elevenLabsVoiceId: string;
  openaiTtsVoice: string;
  ttsSummarizeThreshold: number;
  sttEnabled: boolean;
  sttProvider: "openai" | "local";
  sttLocalModel: string;
}

// Derive local embedding model list from shared registry (single source of truth)
const LOCAL_EMBEDDING_MODELS = SHARED_LOCAL_EMBEDDING_MODELS.map((m) => ({
  id: m.id,
  name: `${m.name} (${m.dimensions} dims${m.size ? `, ~${m.size}` : ""})`,
  size: m.size || "",
}));

const ANTIGRAVITY_MODELS = getAntigravityModels();
const CODEX_MODELS = getCodexModels();
const CLAUDECODE_MODELS = getClaudeCodeModels();
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

// ---------------------------------------------------------------------------
// Whisper Model Selector (follows LocalEmbeddingModelSelector pattern)
// ---------------------------------------------------------------------------

interface WhisperModelSelectorProps {
  formState: FormState;
  updateField: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
}

function WhisperModelSelector({ formState, updateField }: WhisperModelSelectorProps) {
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
  claudecodeAuth: { isAuthenticated: boolean; email?: string; expiresAt?: number } | null;
  claudecodeLoading: boolean;
  onClaudeCodeLogin: () => void;
  onClaudeCodeLogout: () => void;
  claudeCodePasteMode: boolean;
  onClaudeCodePasteSubmit: (code: string) => void;
  onClaudeCodePasteCancel: () => void;
}

function ClaudeCodePasteInput({
  loading,
  onSubmit,
  onCancel,
}: {
  loading: boolean;
  onSubmit: (code: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("settings.api.auth");
  const [code, setCode] = useState("");

  return (
    <div className="mt-3 space-y-3 border-t border-terminal-border pt-3">
      <p className="font-mono text-xs text-terminal-muted">
        {t("pasteInstructions")}
      </p>
      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={t("codePlaceholder")}
        className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter" && code.trim()) {
            onSubmit(code);
          }
        }}
      />
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          disabled={loading}
          className="rounded border border-terminal-border px-3 py-1.5 font-mono text-xs text-terminal-muted hover:bg-terminal-bg disabled:opacity-50"
        >
          {t("cancel")}
        </button>
        <button
          onClick={() => onSubmit(code)}
          disabled={loading || !code.trim()}
          className="rounded border border-terminal-green bg-terminal-green/10 px-3 py-1.5 font-mono text-xs text-terminal-green hover:bg-terminal-green/20 disabled:opacity-50"
        >
          {loading ? t("verifying") : t("submitCode")}
        </button>
      </div>
    </div>
  );
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
  claudecodeAuth,
  claudecodeLoading,
  onClaudeCodeLogin,
  onClaudeCodeLogout,
  claudeCodePasteMode,
  onClaudeCodePasteSubmit,
  onClaudeCodePasteCancel,
}: SettingsPanelProps) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
  };

  if (section === "api-keys") {
    return (
      <div className={settingsSectionShellClassName}>
        <div>
          <h2 className="mb-1 font-mono text-lg font-semibold text-terminal-dark">{t("api.title")}</h2>
          <p className="mb-4 font-mono text-sm text-terminal-muted">
            {t("api.description")}
          </p>
          <div className="space-y-3">
            <label className="flex items-center gap-3">
              <input
                type="radio"
                name="llmProvider"
                value="anthropic"
                checked={formState.llmProvider === "anthropic"}
                onChange={(e) => {
                  updateField("llmProvider", e.target.value as "anthropic" | "openrouter" | "antigravity" | "codex" | "kimi" | "ollama" | "claudecode");
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
                  updateField("llmProvider", e.target.value as "anthropic" | "openrouter" | "antigravity" | "codex" | "kimi" | "ollama" | "claudecode");
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
                  updateField("llmProvider", e.target.value as "anthropic" | "openrouter" | "antigravity" | "codex" | "kimi" | "ollama" | "claudecode");
                  updateField("chatModel", "");
                  updateField("researchModel", "");
                  updateField("visionModel", "");
                  updateField("utilityModel", "");
                }}
                className="size-4 accent-terminal-green"
              />
              <span className="font-mono text-terminal-dark">{t("api.ollama")}</span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="radio"
                name="llmProvider"
                value="kimi"
                checked={formState.llmProvider === "kimi"}
                onChange={(e) => {
                  updateField("llmProvider", e.target.value as "anthropic" | "openrouter" | "antigravity" | "codex" | "kimi" | "ollama" | "claudecode");
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
                  updateField("llmProvider", e.target.value as "anthropic" | "openrouter" | "antigravity" | "codex" | "kimi" | "ollama" | "claudecode");
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
                  <span className="ml-2 text-xs text-terminal-green">{t("api.readyStatus")}</span>
                )}
              </span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="radio"
                name="llmProvider"
                value="claudecode"
                checked={formState.llmProvider === "claudecode"}
                onChange={(e) => {
                  updateField("llmProvider", e.target.value as "anthropic" | "openrouter" | "antigravity" | "codex" | "kimi" | "ollama" | "claudecode");
                  updateField("chatModel", "");
                  updateField("researchModel", "");
                  updateField("visionModel", "");
                  updateField("utilityModel", "");
                }}
                disabled={!claudecodeAuth?.isAuthenticated}
                className="size-4 accent-terminal-green disabled:opacity-50"
              />
              <span className={cn(
                "font-mono",
                claudecodeAuth?.isAuthenticated ? "text-terminal-dark" : "text-terminal-muted"
              )}>
                Claude Code
                {claudecodeAuth?.isAuthenticated && (
                  <span className="ml-2 text-xs text-terminal-green">{t("api.readyStatus")}</span>
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
                  updateField("llmProvider", e.target.value as "anthropic" | "openrouter" | "antigravity" | "codex" | "kimi" | "ollama" | "claudecode");
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
                  <span className="ml-2 text-xs text-terminal-green">{t("api.readyStatus")}</span>
                )}
              </span>
            </label>
          </div>
        </div>

        {/* Antigravity OAuth Section */}
        <div className="rounded-lg border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-mono text-sm font-semibold text-terminal-dark">
                {t("api.auth.antigravityTitle")}
              </h3>
              <p className="mt-1 font-mono text-xs text-terminal-muted">
                {t("api.auth.antigravityDesc")}
              </p>
              {antigravityAuth?.isAuthenticated && antigravityAuth.email && (
                <p className="mt-1 font-mono text-xs text-terminal-green">
                  {t("api.auth.signedIn", { email: antigravityAuth.email })}
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
                  {antigravityLoading ? "..." : t("api.auth.signOut")}
                </button>
              ) : (
                <button
                  onClick={onAntigravityLogin}
                  disabled={antigravityLoading}
                  className="rounded border border-terminal-green bg-terminal-green/10 px-3 py-1.5 font-mono text-xs text-terminal-green hover:bg-terminal-green/20 disabled:opacity-50"
                >
                  {antigravityLoading ? t("api.auth.connecting") : t("api.auth.signInGoogle")}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Codex OAuth Section */}
        <div className="rounded-lg border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-mono text-sm font-semibold text-terminal-dark">
                {t("api.auth.codexTitle")}
              </h3>
              <p className="mt-1 font-mono text-xs text-terminal-muted">
                {t("api.auth.codexDesc")}
              </p>
              {codexAuth?.isAuthenticated && (codexAuth.email || codexAuth.accountId) && (
                <p className="mt-1 font-mono text-xs text-terminal-green">
                  {t("api.auth.signedIn", { email: codexAuth.email || codexAuth.accountId || "" })}
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
                  {codexLoading ? "..." : t("api.auth.signOut")}
                </button>
              ) : (
                <button
                  onClick={onCodexLogin}
                  disabled={codexLoading}
                  className="rounded border border-terminal-green bg-terminal-green/10 px-3 py-1.5 font-mono text-xs text-terminal-green hover:bg-terminal-green/20 disabled:opacity-50"
                >
                  {codexLoading ? t("api.auth.connecting") : t("api.auth.signInOpenAI")}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Claude Code OAuth Section */}
        <div className="rounded-lg border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-mono text-sm font-semibold text-terminal-dark">
                {t("api.auth.claudecodeTitle")}
              </h3>
              <p className="mt-1 font-mono text-xs text-terminal-muted">
                {t("api.auth.claudecodeDesc")}
              </p>
              {claudecodeAuth?.isAuthenticated && claudecodeAuth.email && (
                <p className="mt-1 font-mono text-xs text-terminal-green">
                  {t("api.auth.signedIn", { email: claudecodeAuth.email })}
                </p>
              )}
            </div>
            <div>
              {claudecodeAuth?.isAuthenticated ? (
                <button
                  onClick={onClaudeCodeLogout}
                  disabled={claudecodeLoading}
                  className="rounded border border-red-300 bg-red-50 px-3 py-1.5 font-mono text-xs text-red-600 hover:bg-red-100 disabled:opacity-50"
                >
                  {claudecodeLoading ? "..." : t("api.auth.signOut")}
                </button>
              ) : !claudeCodePasteMode ? (
                <button
                  onClick={onClaudeCodeLogin}
                  disabled={claudecodeLoading}
                  className="rounded border border-terminal-green bg-terminal-green/10 px-3 py-1.5 font-mono text-xs text-terminal-green hover:bg-terminal-green/20 disabled:opacity-50"
                >
                  {claudecodeLoading ? t("api.auth.connecting") : t("api.auth.signInAnthropic")}
                </button>
              ) : null}
            </div>
          </div>
          {claudeCodePasteMode && !claudecodeAuth?.isAuthenticated && (
            <ClaudeCodePasteInput
              loading={claudecodeLoading}
              onSubmit={onClaudeCodePasteSubmit}
              onCancel={onClaudeCodePasteCancel}
            />
          )}
        </div>

        <div className="space-y-4">
          <h2 className="font-mono text-lg font-semibold text-terminal-dark">{t("api.keysTitle")}</h2>

          {formState.llmProvider === "ollama" && (
            <div>
              <label className="mb-1 block font-mono text-sm text-terminal-muted">{t("api.fields.ollama.label")}</label>
              <input
                type="text"
                value={formState.ollamaBaseUrl}
                onChange={(e) => updateField("ollamaBaseUrl", e.target.value)}
                placeholder={t("api.fields.ollama.placeholder")}
                className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
              />
              <p className="mt-1 font-mono text-xs text-terminal-muted">
                {t("api.fields.ollama.helper")}
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
              className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
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
              className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
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
              className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
            />
            <p className="mt-1 font-mono text-xs text-terminal-muted">{t("api.fields.kimi.helper")}</p>
          </div>

          <div>
            <label className="mb-1 block font-mono text-sm text-terminal-muted">{t("api.fields.openai.label")}</label>
            <input
              type="password"
              value={formState.openaiApiKey}
              onChange={(e) => updateField("openaiApiKey", e.target.value)}
              placeholder={t("api.fields.openai.placeholder")}
              className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
            />
            <p className="mt-1 font-mono text-xs text-terminal-muted">
              {t("api.fields.openai.helper")}{" "}
              <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-terminal-green underline hover:text-terminal-green/80">
                platform.openai.com
              </a>
            </p>
          </div>

          <div>
            <label className="mb-1 block font-mono text-sm text-terminal-muted">
              {t("api.fields.webSearchProvider.label")}
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-3">
                <input
                  type="radio"
                  name="webSearchProvider"
                  value="auto"
                  checked={formState.webSearchProvider === "auto"}
                  onChange={(e) => updateField("webSearchProvider", e.target.value as "tavily" | "duckduckgo" | "auto")}
                  className="size-4 accent-terminal-green"
                />
                <span className="font-mono text-terminal-dark">
                  {t("api.fields.webSearchProvider.options.auto")}
                </span>
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="radio"
                  name="webSearchProvider"
                  value="tavily"
                  checked={formState.webSearchProvider === "tavily"}
                  onChange={(e) => updateField("webSearchProvider", e.target.value as "tavily" | "duckduckgo" | "auto")}
                  className="size-4 accent-terminal-green"
                />
                <span className="font-mono text-terminal-dark">
                  {t("api.fields.webSearchProvider.options.tavily")}
                </span>
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="radio"
                  name="webSearchProvider"
                  value="duckduckgo"
                  checked={formState.webSearchProvider === "duckduckgo"}
                  onChange={(e) => updateField("webSearchProvider", e.target.value as "tavily" | "duckduckgo" | "auto")}
                  className="size-4 accent-terminal-green"
                />
                <span className="font-mono text-terminal-dark">
                  {t("api.fields.webSearchProvider.options.duckduckgo")}
                </span>
              </label>
            </div>
            <p className="mt-1 font-mono text-xs text-terminal-muted">
              {t("api.fields.webSearchProvider.helper")}
            </p>
          </div>

          <div>
            <label className="mb-1 block font-mono text-sm text-terminal-muted">{t("api.fields.tavily.label")}</label>
            <input
              type="password"
              value={formState.tavilyApiKey}
              onChange={(e) => updateField("tavilyApiKey", e.target.value)}
              placeholder={t("api.fields.tavily.placeholder")}
              className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
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
              className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
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
              className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
            />
            <p className="mt-1 font-mono text-xs text-terminal-muted">{t("api.fields.seline.helper")}</p>
          </div>
        </div>
      </div>
    );
  }

  if (section === "models") {
    return (
      <div className={settingsSectionShellClassName}>
        <div>
          <h2 className="font-mono text-lg font-semibold text-terminal-dark">{t("models.title")}</h2>
          <p className="font-mono text-sm text-terminal-muted">
            {t("models.subtitle")}
          </p>
          <p className="font-mono text-xs text-terminal-muted">
            Choose which model handles each job, like chat, research, and image understanding.
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
                className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
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
                className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
              >
                {CODEX_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            ) : formState.llmProvider === "claudecode" ? (
              <select
                value={formState.chatModel || "claude-sonnet-4-5-20250929"}
                onChange={(e) => updateField("chatModel", e.target.value)}
                className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
              >
                {CLAUDECODE_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            ) : formState.llmProvider === "kimi" ? (
              <select
                value={formState.chatModel || "kimi-k2.5"}
                onChange={(e) => updateField("chatModel", e.target.value)}
                className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
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
                className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
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
                className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
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
                className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
              >
                {CODEX_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            ) : formState.llmProvider === "claudecode" ? (
              <select
                value={formState.researchModel || "claude-opus-4-6"}
                onChange={(e) => updateField("researchModel", e.target.value)}
                className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
              >
                {CLAUDECODE_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            ) : formState.llmProvider === "kimi" ? (
              <select
                value={formState.researchModel || "kimi-k2-thinking"}
                onChange={(e) => updateField("researchModel", e.target.value)}
                className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
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
                className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
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
                className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
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
                className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
              >
                {CODEX_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            ) : formState.llmProvider === "claudecode" ? (
              <select
                value={formState.visionModel || "claude-sonnet-4-5-20250929"}
                onChange={(e) => updateField("visionModel", e.target.value)}
                className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
              >
                {CLAUDECODE_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            ) : formState.llmProvider === "kimi" ? (
              <select
                value={formState.visionModel || "kimi-k2.5"}
                onChange={(e) => updateField("visionModel", e.target.value)}
                className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
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
                className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
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
                className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
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
                className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
              >
                {CODEX_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            ) : formState.llmProvider === "claudecode" ? (
              <select
                value={formState.utilityModel || "claude-haiku-4-5-20251001"}
                onChange={(e) => updateField("utilityModel", e.target.value)}
                className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
              >
                {CLAUDECODE_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            ) : formState.llmProvider === "kimi" ? (
              <select
                value={formState.utilityModel || "kimi-k2-turbo-preview"}
                onChange={(e) => updateField("utilityModel", e.target.value)}
                className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
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
                className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
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
                className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-xs text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green resize-none"
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
      <div className={settingsSectionShellClassName}>
        <h2 className="font-mono text-lg font-semibold text-terminal-dark">{t("vector.title")}</h2>
        <p className="font-mono text-sm text-terminal-muted">
          {t("vector.subtitle")}
        </p>

        {formState.embeddingReindexRequired && (
          <div className="rounded border border-amber-200 bg-amber-50 p-4">
            <p className="font-mono text-xs text-amber-800">
              <strong>{t("vector.reindexRequired.title")}</strong> {t("vector.reindexRequired.body")}
            </p>
            <p className="mt-2 font-mono text-xs text-amber-800">
              {t("vector.reindexRequired.folderHint")}
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
              embeddingModel={formState.embeddingModel}
              embeddingProvider={formState.embeddingProvider}
            />


          </div>
        )}
      </div>
    );
  }

  if (section === "preferences") {
    return (
      <div className={settingsSectionShellClassName}>
        <PreferencesSection formState={formState} updateField={updateField} />
      </div>
    );
  }

  if (section === "comfyui") {
    return (
      <div className={settingsSectionShellClassName}>
        <div>
          <h2 className="mb-2 text-lg font-semibold text-terminal-text">{t("localImage.heading")}</h2>
          <p className="text-sm text-terminal-muted">
            {t("localImage.description")}
          </p>
        </div>

        <div className="rounded-xl border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-terminal-border bg-terminal-green/15 text-terminal-green">
                <KeyIcon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-terminal-text">{t("localImage.hfTokenTitle")}</p>
                <p className="text-xs text-terminal-muted">
                  {t("localImage.hfTokenDesc")}
                </p>
              </div>
            </div>
            <a
              href="https://huggingface.co/settings/tokens"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-terminal-green underline hover:text-terminal-green/80"
            >
              {t("localImage.hfTokenLink")}
            </a>
          </div>
          <input
            type="password"
            value={formState.huggingFaceToken}
            onChange={(e) => updateField("huggingFaceToken", e.target.value)}
            placeholder={t("localImage.hfTokenPlaceholder")}
            className="mt-3 w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 text-sm text-terminal-text placeholder:text-terminal-muted/60 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
          />
        </div>

        <div className="space-y-3">
          <p className="text-xs uppercase tracking-wide text-terminal-muted">{t("localImage.backendsLabel")}</p>
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
            <h3 className="text-sm font-semibold text-terminal-text">{t("localImage.workflowsHeading")}</h3>
            <p className="text-xs text-terminal-muted">
              {t("localImage.workflowsDesc")}
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
    return (
      <div className={settingsSectionShellClassName}>
        <MemorySection />
      </div>
    );
  }

  if (section === "mcp") {
    return (
      <div className={settingsSectionShellClassName}>
        <div>
          <h2 className="mb-2 font-mono text-lg font-semibold text-terminal-dark">
            Tool servers (MCP)
          </h2>
          <p className="mb-4 font-mono text-sm text-terminal-muted">
            Connect external tool servers so your agent can use more tools.
          </p>
        </div>
        <MCPSettings />
      </div>
    );
  }

  if (section === "plugins") {
    return (
      <div className={settingsSectionShellClassName}>
        <PluginSettings />
      </div>
    );
  }

  if (section === "voice") {
    const ttsAutoModeOptions = [
      { value: "off" as const, label: t("voice.tts.modeOff"), description: t("voice.tts.modeOffDesc") },
      { value: "channels-only" as const, label: t("voice.tts.modeChannels"), description: t("voice.tts.modeChannelsDesc") },
      { value: "always" as const, label: t("voice.tts.modeAlways"), description: t("voice.tts.modeAlwaysDesc") },
    ];

    const ttsProviderOptions = [
      { value: "edge" as const, label: t("voice.tts.providerEdge"), description: t("voice.tts.providerEdgeDesc"), badge: t("voice.tts.badgeFree") },
      { value: "openai" as const, label: t("voice.tts.providerOpenAI"), description: t("voice.tts.providerOpenAIDesc"), badge: t("voice.tts.badgeApiKey") },
      { value: "elevenlabs" as const, label: t("voice.tts.providerElevenLabs"), description: t("voice.tts.providerElevenLabsDesc"), badge: t("voice.tts.badgeApiKey") },
    ];

    const sttProviderOptions = [
      { value: "openai" as const, label: t("voice.stt.providerOpenAI"), description: t("voice.stt.providerOpenAIDesc") },
      { value: "local" as const, label: t("voice.stt.providerLocal"), description: t("voice.stt.providerLocalDesc") },
    ];

    return (
      <div className={settingsSectionShellClassName}>
        <div className="space-y-1.5">
          <h2 className="font-mono text-lg font-semibold text-terminal-dark">{t("voice.heading")}</h2>
          <p className="font-mono text-sm text-terminal-muted">
            {t("voice.description")}
          </p>
        </div>

        <div className="space-y-5">
          <SettingsPanelCard
            title={t("voice.tts.title")}
            description={t("voice.tts.description")}
          >
            <SettingsToggleRow
              id="ttsEnabled"
              label={t("voice.tts.enableLabel")}
              description={t("voice.tts.enableDesc")}
              checked={formState.ttsEnabled}
              onChange={(checked) => updateField("ttsEnabled", checked)}
            />

            {formState.ttsEnabled ? (
              <div className="space-y-6">
                <SettingsOptionGroup
                  title={t("voice.tts.whenTitle")}
                  description={t("voice.tts.whenDesc")}
                >
                  {ttsAutoModeOptions.map((option) => (
                    <SettingsRadioCard
                      key={option.value}
                      id={`tts-auto-mode-${option.value}`}
                      name="ttsAutoMode"
                      value={option.value}
                      label={option.label}
                      description={option.description}
                      checked={formState.ttsAutoMode === option.value}
                      onChange={() => updateField("ttsAutoMode", option.value)}
                    />
                  ))}
                </SettingsOptionGroup>

                <SettingsOptionGroup
                  title={t("voice.tts.providerTitle")}
                  description={t("voice.tts.providerDesc")}
                >
                  {ttsProviderOptions.map((option) => (
                    <SettingsRadioCard
                      key={option.value}
                      id={`tts-provider-${option.value}`}
                      name="ttsProvider"
                      value={option.value}
                      label={option.label}
                      description={option.description}
                      badge={option.badge}
                      checked={formState.ttsProvider === option.value}
                      onChange={() => updateField("ttsProvider", option.value)}
                    />
                  ))}
                </SettingsOptionGroup>

                {formState.ttsProvider === "openai" && (
                  <SettingsField
                    label={t("voice.tts.defaultVoiceLabel")}
                    htmlFor="openaiTtsVoice"
                    helperText={t("voice.tts.defaultVoiceHelper")}
                    className="max-w-sm"
                  >
                    <select
                      id="openaiTtsVoice"
                      value={formState.openaiTtsVoice}
                      onChange={(e) => updateField("openaiTtsVoice", e.target.value)}
                      aria-describedby="openaiTtsVoice-help"
                      className={settingsInputClassName}
                    >
                      {["alloy", "ash", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"].map((voice) => (
                        <option key={voice} value={voice}>
                          {voice}
                        </option>
                      ))}
                    </select>
                  </SettingsField>
                )}

                {formState.ttsProvider === "elevenlabs" && (
                  <SettingsOptionGroup
                    title={t("voice.tts.elevenLabsTitle")}
                    description={t("voice.tts.elevenLabsDesc")}
                  >
                    <div className="grid gap-4 md:grid-cols-2">
                      <SettingsField label={t("voice.tts.elevenLabsKeyLabel")} htmlFor="elevenLabsApiKey">
                        <input
                          id="elevenLabsApiKey"
                          type="password"
                          value={formState.elevenLabsApiKey}
                          onChange={(e) => updateField("elevenLabsApiKey", e.target.value)}
                          placeholder={t("voice.tts.elevenLabsKeyPlaceholder")}
                          className={settingsInputClassName}
                        />
                      </SettingsField>
                      <SettingsField
                        label={t("voice.tts.voiceIdLabel")}
                        htmlFor="elevenLabsVoiceId"
                        helperText={t("voice.tts.voiceIdHelper")}
                      >
                        <input
                          id="elevenLabsVoiceId"
                          type="text"
                          value={formState.elevenLabsVoiceId}
                          onChange={(e) => updateField("elevenLabsVoiceId", e.target.value)}
                          placeholder={t("voice.tts.voiceIdPlaceholder")}
                          aria-describedby="elevenLabsVoiceId-help"
                          className={settingsInputClassName}
                        />
                      </SettingsField>
                    </div>
                  </SettingsOptionGroup>
                )}

                <SettingsField
                  label={t("voice.tts.limitLabel")}
                  htmlFor="ttsSummarizeThreshold"
                  helperText={t("voice.tts.limitHelper")}
                  className="max-w-xs"
                >
                  <input
                    id="ttsSummarizeThreshold"
                    type="number"
                    min={100}
                    max={5000}
                    step={100}
                    value={formState.ttsSummarizeThreshold}
                    onChange={(e) => updateField("ttsSummarizeThreshold", parseInt(e.target.value, 10) || 500)}
                    aria-describedby="ttsSummarizeThreshold-help"
                    className={settingsInputClassName}
                  />
                </SettingsField>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-terminal-border/60 bg-terminal-bg/5 px-3 py-2.5 font-mono text-xs text-terminal-muted dark:border-terminal-border/80 dark:bg-terminal-cream/5">
                {t("voice.tts.disabledHint")}
              </div>
            )}
          </SettingsPanelCard>

          <SettingsPanelCard
            title={t("voice.stt.title")}
            description={t("voice.stt.description")}
          >
            <SettingsToggleRow
              id="sttEnabled"
              label={t("voice.stt.enableLabel")}
              description={t("voice.stt.enableDesc")}
              checked={formState.sttEnabled}
              onChange={(checked) => updateField("sttEnabled", checked)}
            />

            {formState.sttEnabled ? (
              <div className="space-y-6">
                <SettingsOptionGroup
                  title={t("voice.stt.providerTitle")}
                  description={t("voice.stt.providerDesc")}
                >
                  {sttProviderOptions.map((option) => (
                    <SettingsRadioCard
                      key={option.value}
                      id={`stt-provider-${option.value}`}
                      name="sttProvider"
                      value={option.value}
                      label={option.label}
                      description={option.description}
                      checked={formState.sttProvider === option.value}
                      onChange={() => updateField("sttProvider", option.value)}
                    />
                  ))}
                </SettingsOptionGroup>

                {formState.sttProvider === "local" && (
                  <WhisperModelSelector formState={formState} updateField={updateField} />
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-terminal-border/60 bg-terminal-bg/5 px-3 py-2.5 font-mono text-xs text-terminal-muted dark:border-terminal-border/80 dark:bg-terminal-cream/5">
                {t("voice.stt.disabledHint")}
              </div>
            )}
          </SettingsPanelCard>
        </div>
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
      <div>
        <h2 className="font-mono text-lg font-semibold text-terminal-dark">{t("preferences.title")}</h2>
        <p className="mt-1 font-mono text-sm text-terminal-muted">
          {t("preferences.description")}
        </p>
      </div>

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
              checked={formState.toolLoadingMode === "deferred"}
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
              checked={formState.toolLoadingMode === "always" || !formState.toolLoadingMode}
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

      <div className="space-y-4 rounded border border-terminal-border bg-terminal-cream/30 p-4">
        <div>
          <h3 className="font-mono text-base font-semibold text-terminal-dark">{t("localGrep.heading")}</h3>
          <p className="mt-1 font-mono text-xs text-terminal-muted">{t("localGrep.description")}</p>
          <p className="mt-2 font-mono text-xs text-terminal-muted">{t("localGrep.tip")}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex items-center justify-between rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2">
            <span className="font-mono text-sm text-terminal-dark">{t("localGrep.enableLabel")}</span>
            <input
              type="checkbox"
              checked={formState.localGrepEnabled}
              onChange={(e) => updateField("localGrepEnabled", e.target.checked)}
              className="size-4 accent-terminal-green"
            />
          </label>
          <label className="flex items-center justify-between rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2">
            <span className="font-mono text-sm text-terminal-dark">{t("localGrep.gitignoreLabel")}</span>
            <input
              type="checkbox"
              checked={formState.localGrepRespectGitignore}
              onChange={(e) => updateField("localGrepRespectGitignore", e.target.checked)}
              className="size-4 accent-terminal-green"
            />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block font-mono text-xs text-terminal-muted">{t("localGrep.maxResultsLabel")}</label>
            <input
              type="number"
              min={1}
              max={100}
              value={formState.localGrepMaxResults}
              onChange={(e) => updateField("localGrepMaxResults", Number(e.target.value) || 20)}
              className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
            />
          </div>
          <div>
            <label className="mb-1 block font-mono text-xs text-terminal-muted">{t("localGrep.contextLinesLabel")}</label>
            <input
              type="number"
              min={0}
              max={10}
              value={formState.localGrepContextLines}
              onChange={(e) => updateField("localGrepContextLines", Number(e.target.value) || 2)}
              className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
            />
          </div>
        </div>
      </div>

      {/* Post-Edit Hooks */}
      <div className="space-y-4 rounded border border-terminal-border bg-terminal-cream/30 p-4">
        <div>
          <h3 className="font-mono text-base font-semibold text-terminal-dark">{t("preferences.postEditHooks.heading")}</h3>
          <p className="mt-1 font-mono text-xs text-terminal-muted">
            {t("preferences.postEditHooks.description")}
          </p>
        </div>

        <div>
          <label className="mb-2 block font-mono text-sm text-terminal-dark">{t("preferences.postEditHooks.profileLabel")}</label>
          <div className="space-y-2">
            <label className="flex items-start gap-3">
              <input
                type="radio"
                name="postEditHooksPreset"
                value="off"
                checked={formState.postEditHooksPreset === "off"}
                onChange={() => {
                  updateField("postEditHooksPreset", "off");
                  updateField("postEditHooksEnabled", false);
                  updateField("postEditTypecheckEnabled", false);
                  updateField("postEditLintEnabled", false);
                }}
                className="mt-1 size-4 accent-terminal-green"
              />
              <div>
                <span className="font-mono text-terminal-dark">{t("preferences.postEditHooks.off")}</span>
                <p className="font-mono text-xs text-terminal-muted">{t("preferences.postEditHooks.offDesc")}</p>
              </div>
            </label>
            <label className="flex items-start gap-3">
              <input
                type="radio"
                name="postEditHooksPreset"
                value="fast"
                checked={formState.postEditHooksPreset === "fast"}
                onChange={() => {
                  updateField("postEditHooksPreset", "fast");
                  updateField("postEditHooksEnabled", true);
                  updateField("postEditTypecheckEnabled", true);
                  updateField("postEditLintEnabled", false);
                  updateField("postEditTypecheckScope", "auto");
                  updateField("postEditRunInPatchTool", false);
                }}
                className="mt-1 size-4 accent-terminal-green"
              />
              <div>
                <span className="font-mono text-terminal-dark">{t("preferences.postEditHooks.fast")}</span>
                <p className="font-mono text-xs text-terminal-muted">{t("preferences.postEditHooks.fastDesc")}</p>
              </div>
            </label>
            <label className="flex items-start gap-3">
              <input
                type="radio"
                name="postEditHooksPreset"
                value="strict"
                checked={formState.postEditHooksPreset === "strict"}
                onChange={() => {
                  updateField("postEditHooksPreset", "strict");
                  updateField("postEditHooksEnabled", true);
                  updateField("postEditTypecheckEnabled", true);
                  updateField("postEditLintEnabled", true);
                  updateField("postEditTypecheckScope", "all");
                  updateField("postEditRunInPatchTool", true);
                }}
                className="mt-1 size-4 accent-terminal-green"
              />
              <div>
                <span className="font-mono text-terminal-dark">{t("preferences.postEditHooks.strict")}</span>
                <p className="font-mono text-xs text-terminal-muted">{t("preferences.postEditHooks.strictDesc")}</p>
              </div>
            </label>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex items-center justify-between rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2">
            <span className="font-mono text-sm text-terminal-dark">{t("preferences.postEditHooks.enableHooks")}</span>
            <input
              type="checkbox"
              checked={formState.postEditHooksEnabled}
              onChange={(e) => updateField("postEditHooksEnabled", e.target.checked)}
              className="size-4 accent-terminal-green"
            />
          </label>
          <label className="flex items-center justify-between rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2">
            <span className="font-mono text-sm text-terminal-dark">{t("preferences.postEditHooks.includePatches")}</span>
            <input
              type="checkbox"
              checked={formState.postEditRunInPatchTool}
              onChange={(e) => updateField("postEditRunInPatchTool", e.target.checked)}
              className="size-4 accent-terminal-green"
            />
          </label>
          <label className="flex items-center justify-between rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2">
            <span className="font-mono text-sm text-terminal-dark">{t("preferences.postEditHooks.typecheck")}</span>
            <input
              type="checkbox"
              checked={formState.postEditTypecheckEnabled}
              onChange={(e) => updateField("postEditTypecheckEnabled", e.target.checked)}
              className="size-4 accent-terminal-green"
            />
          </label>
          <label className="flex items-center justify-between rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2">
            <span className="font-mono text-sm text-terminal-dark">{t("preferences.postEditHooks.eslint")}</span>
            <input
              type="checkbox"
              checked={formState.postEditLintEnabled}
              onChange={(e) => updateField("postEditLintEnabled", e.target.checked)}
              className="size-4 accent-terminal-green"
            />
          </label>
        </div>

        <div>
          <label className="mb-1 block font-mono text-sm text-terminal-dark">{t("preferences.postEditHooks.typecheckScopeLabel")}</label>
          <p className="mb-2 font-mono text-xs text-terminal-muted">
            {t("preferences.postEditHooks.typecheckScopeDesc")}
          </p>
          <select
            value={formState.postEditTypecheckScope}
            onChange={(e) => updateField("postEditTypecheckScope", e.target.value as FormState["postEditTypecheckScope"])}
            className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
          >
            <option value="auto">{t("preferences.postEditHooks.scopeAuto")}</option>
            <option value="app">{t("preferences.postEditHooks.scopeApp")}</option>
            <option value="lib">{t("preferences.postEditHooks.scopeLib")}</option>
            <option value="electron">{t("preferences.postEditHooks.scopeElectron")}</option>
            <option value="tooling">{t("preferences.postEditHooks.scopeTooling")}</option>
            <option value="all">{t("preferences.postEditHooks.scopeAll")}</option>
          </select>
        </div>
      </div>

      {/* Prompt Caching */}
      <div className="space-y-4">
        <h3 className="font-mono text-base font-semibold text-terminal-dark">
          {t("preferences.promptCaching.heading")}
        </h3>
        <p className="font-mono text-xs text-terminal-muted">
          {t("preferences.promptCaching.description")}
        </p>

        {/* Enable/Disable Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <label className="font-mono text-sm text-terminal-dark">
              {t("preferences.promptCaching.enableLabel")}
            </label>
            <p className="mt-1 font-mono text-xs text-terminal-muted">
              {t("preferences.promptCaching.enableDesc")}
            </p>
          </div>
          <input
            type="checkbox"
            checked={formState.promptCachingEnabled ?? true}
            onChange={(e) => updateField("promptCachingEnabled", e.target.checked)}
            className="size-5 accent-terminal-green"
          />
        </div>

      </div>

      {/* RTK (Rust Token Killer) */}
      <div className="space-y-4 rounded border border-terminal-border bg-terminal-cream/30 p-4">
        <div>
          <h3 className="font-mono text-base font-semibold text-terminal-dark">
            {t("preferences.rtk.heading")}
          </h3>
          <p className="font-mono text-xs text-terminal-muted">
            {t("preferences.rtk.description")}
          </p>
        </div>

        <label className="flex items-center justify-between gap-3">
          <div>
            <span className="font-mono text-sm text-terminal-dark">{t("preferences.rtk.enableLabel")}</span>
            <p className="mt-1 font-mono text-xs text-terminal-muted">
              {t("preferences.rtk.enableDesc")}
            </p>
          </div>
          <input
            type="checkbox"
            checked={formState.rtkEnabled}
            onChange={(e) => updateField("rtkEnabled", e.target.checked)}
            className="size-5 accent-terminal-green"
          />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block font-mono text-xs text-terminal-muted">{t("preferences.rtk.verbosityLabel")}</label>
            <select
              value={String(formState.rtkVerbosity)}
              onChange={(e) => updateField("rtkVerbosity", Number(e.target.value) as 0 | 1 | 2 | 3)}
              className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
            >
              <option value="0">0 (quiet)</option>
              <option value="1">1 (-v)</option>
              <option value="2">2 (-vv)</option>
              <option value="3">3 (-vvv)</option>
            </select>
          </div>

          <label className="flex items-center gap-3 md:pt-6">
            <input
              type="checkbox"
              checked={formState.rtkUltraCompact}
              onChange={(e) => updateField("rtkUltraCompact", e.target.checked)}
              className="size-4 accent-terminal-green"
            />
            <span className="font-mono text-sm text-terminal-dark">{t("preferences.rtk.ultraCompact")}</span>
          </label>
        </div>
      </div>

      {/* Developer Workspace (Git Worktree Integration) */}
      <div className="space-y-4 rounded border border-terminal-border bg-terminal-cream/30 p-4">
        <div>
          <h3 className="font-mono text-base font-semibold text-terminal-dark">
            {t("preferences.devWorkspace.heading")}
          </h3>
          <p className="mt-1 font-mono text-xs text-terminal-muted">
            {t("preferences.devWorkspace.description")}
          </p>
        </div>

        <label className="flex items-center justify-between gap-3">
          <div>
            <span className="font-mono text-sm text-terminal-dark">{t("preferences.devWorkspace.enableLabel")}</span>
            <p className="mt-1 font-mono text-xs text-terminal-muted">
              {t("preferences.devWorkspace.enableDesc")}
            </p>
          </div>
          <input
            type="checkbox"
            checked={formState.devWorkspaceEnabled}
            onChange={(e) => updateField("devWorkspaceEnabled", e.target.checked)}
            className="size-5 accent-terminal-green"
          />
        </label>

        {formState.devWorkspaceEnabled && (
          <div className="space-y-4 border-t border-terminal-border pt-4">
            <label className="flex items-center justify-between gap-3">
              <div>
                <span className="font-mono text-sm text-terminal-dark">{t("preferences.devWorkspace.autoCleanLabel")}</span>
                <p className="mt-1 font-mono text-xs text-terminal-muted">
                  {t("preferences.devWorkspace.autoCleanDesc")}
                </p>
              </div>
              <input
                type="checkbox"
                checked={formState.devWorkspaceAutoCleanup}
                onChange={(e) => updateField("devWorkspaceAutoCleanup", e.target.checked)}
                className="size-5 accent-terminal-green"
              />
            </label>

            {formState.devWorkspaceAutoCleanup && (
              <div>
                <label className="mb-1 block font-mono text-xs text-terminal-muted">
                  {t("preferences.devWorkspace.cleanupDaysLabel")}
                </label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={formState.devWorkspaceAutoCleanupDays}
                  onChange={(e) => updateField("devWorkspaceAutoCleanupDays", Math.max(1, Math.min(30, Number(e.target.value))))}
                  className="w-24 rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
                />
              </div>
            )}

            <div className="rounded border border-dashed border-terminal-border bg-terminal-cream/50 p-3">
              <p className="font-mono text-xs text-terminal-muted">
                <strong className="text-terminal-dark">{t("preferences.devWorkspace.recommendedServers")}</strong>{" "}
                {t.rich("preferences.devWorkspace.recommendedServersDesc", {
                  worktreeTools: () => <code className="rounded bg-terminal-border/30 px-1">worktree-tools-mcp</code>,
                  githubMcp: () => <code className="rounded bg-terminal-border/30 px-1">github-mcp-server</code>,
                })}
              </p>
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
      toast.error(t("errors.memorySaveFailed"));
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
    visual_preferences: t("memory.categoryLabels.visual_preferences"),
    communication_style: t("memory.categoryLabels.communication_style"),
    workflow_patterns: t("memory.categoryLabels.workflow_patterns"),
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
          <p className="mt-1 font-mono text-sm text-terminal-muted">
            {t("memoryDefaults.description")}
          </p>
        </div>

        {/* Add new default memory */}
        <div className="rounded-lg border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 p-4">
          <h3 className="font-mono text-sm font-medium text-terminal-dark mb-3">
            {t("memoryDefaults.addNew")}
          </h3>
          <div className="flex gap-2">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as typeof selectedCategory)}
              className="rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm"
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
              className="flex-1 rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm"
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

        {/* Existing default memory */}
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
                        className="flex items-center gap-2 bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 rounded px-3 py-2 border border-terminal-border"
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

      {/* Run onboarding again */}
      <div className="border-t border-terminal-border pt-6">
        <div className="rounded-lg border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 p-4">
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
