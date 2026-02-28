"use client";

import { useState, useEffect } from "react";
import { Shell } from "@/components/layout/shell";
import { Button } from "@/components/ui/button";
import { SaveIcon, Loader2Icon, CheckIcon, KeyIcon, PaletteIcon, CpuIcon, DatabaseIcon, ImageIcon, BrainIcon, PlugIcon, Volume2Icon, PackageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { useTheme } from "@/components/theme/theme-provider";
import { toast } from "sonner";
import type { SettingsSection, FormState } from "./settings-types";
import { DEFAULT_FORM_STATE, buildFormStateFromData } from "./settings-types";
import { SettingsPanel } from "./settings-panel";

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SettingsSection>("api-keys");
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const { setTheme } = useTheme();

  // Form state for editable fields
  const [formState, setFormState] = useState<FormState>(DEFAULT_FORM_STATE);

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
      setFormState(buildFormStateFromData(data));
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
  const [claudeCodeAuthSuccess, setClaudeCodeAuthSuccess] = useState(false);

  // Periodic status polling to keep connection status fresh
  useEffect(() => {
    if (!claudeCodePasteMode) return;

    const pollInterval = setInterval(async () => {
      try {
        const authenticated = await loadClaudeCodeAuth();
        if (authenticated && !claudeCodeAuthSuccess) {
          setClaudeCodeAuthSuccess(true);
          setClaudecodeLoading(false);
        }
      } catch (err) {
        console.error("[Settings] Claude Code status poll failed:", err);
      }
    }, 2000); // Poll every 2 seconds during auth flow

    return () => clearInterval(pollInterval);
  }, [claudeCodePasteMode, claudeCodeAuthSuccess]);

  const handleClaudeCodeLogin = async () => {
    setClaudecodeLoading(true);
    setClaudeCodeAuthSuccess(false);
    const electronAPI = typeof window !== "undefined" && "electronAPI" in window
      ? (window as unknown as { electronAPI?: { isElectron?: boolean; shell?: { openExternal: (url: string) => Promise<void> } } }).electronAPI
      : undefined;
    const isElectron = !!electronAPI?.isElectron;

    try {
      const authResponse = await fetch("/api/auth/claudecode/authorize");
      const authData = await authResponse.json();

      if (!authData.success) {
        throw new Error(authData.error || t("errors.authUrlFailed"));
      }

      if (authData.url) {
        if (isElectron && electronAPI?.shell?.openExternal) {
          await electronAPI.shell.openExternal(authData.url);
        } else {
          window.open(authData.url, "_blank");
        }
      }

      // Show the verification panel while auth is completed via Agent SDK.
      setClaudeCodePasteMode(true);
    } catch (err) {
      console.error("Claude Code login failed:", err);
      toast.error(t("errors.authStartFailed"));
      setClaudecodeLoading(false);
    }
    // Note: Keep loading state active while waiting for auth completion
  };

  const handleClaudeCodePasteSubmit = async (code: string) => {
    setClaudecodeLoading(true);
    try {
      const response = await fetch("/api/auth/claudecode/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Claude Agent SDK is not authenticated yet");
      }

      // Load auth state and show success
      const authenticated = await loadClaudeCodeAuth();
      if (authenticated) {
        setClaudeCodeAuthSuccess(true);
      } else {
        throw new Error("Authentication verification failed");
      }
    } catch (err) {
      console.error("Claude Code auth verification failed:", err);
      toast.error(err instanceof Error ? err.message : t("errors.codeExchangeFailed"));
      setClaudecodeLoading(false);
    }
  };

  const handleClaudeCodeAuthComplete = () => {
    setClaudeCodePasteMode(false);
    setClaudeCodeAuthSuccess(false);
    setClaudecodeLoading(false);
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

          {/* Settings Panel */}
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
              claudeCodeAuthSuccess={claudeCodeAuthSuccess}
              onClaudeCodePasteSubmit={handleClaudeCodePasteSubmit}
              onClaudeCodePasteCancel={() => {
                setClaudeCodePasteMode(false);
                setClaudeCodeAuthSuccess(false);
                setClaudecodeLoading(false);
              }}
              onClaudeCodeAuthComplete={handleClaudeCodeAuthComplete}
            />
          </div>
        </div>
      </div>
    </Shell>
  );
}
