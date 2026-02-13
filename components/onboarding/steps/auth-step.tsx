"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { resilientFetch, resilientPost, resilientPut } from "@/lib/utils/resilient-fetch";

import type { LLMProvider } from "./provider-step";

interface AuthStepProps {
    provider: LLMProvider;
    onAuthenticated: () => void;
    onBack: () => void;
    onSkip: () => void;
}

export function AuthStep({ provider, onAuthenticated, onBack, onSkip }: AuthStepProps) {
    const t = useTranslations("onboarding.auth");
    const [apiKey, setApiKey] = useState("");
    const [loading, setLoading] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [claudeCodePasteMode, setClaudeCodePasteMode] = useState(false);
    const [claudeCodePasteValue, setClaudeCodePasteValue] = useState("");

    // Check if already authenticated for OAuth providers
    useEffect(() => {
        if (provider === "antigravity") {
            checkOAuthAuth("/api/auth/antigravity");
        } else if (provider === "codex") {
            checkOAuthAuth("/api/auth/codex");
        } else if (provider === "claudecode") {
            checkOAuthAuth("/api/auth/claudecode");
        }
    }, [provider]);

    const checkOAuthAuth = async (endpoint: string) => {
        try {
            const { data } = await resilientFetch<{ authenticated: boolean }>(`${endpoint}?t=${Date.now()}`, { retries: 0 });
            if (data?.authenticated) {
                setIsAuthenticated(true);
            }
        } catch (err) {
            console.error(`Failed to check auth for ${endpoint}:`, err);
        }
    };

    const handleAntigravityLogin = async () => {
        setLoading(true);
        setError(null);

        const electronAPI = typeof window !== "undefined" && "electronAPI" in window
            ? (window as unknown as { electronAPI?: { isElectron?: boolean; shell?: { openExternal: (url: string) => Promise<void> } } }).electronAPI
            : undefined;
        const isElectron = !!electronAPI?.isElectron;

        let popup: Window | null = null;
        let pollInterval: NodeJS.Timeout | null = null;
        let timeoutId: NodeJS.Timeout | null = null;

        const cleanup = () => {
            if (pollInterval) clearInterval(pollInterval);
            if (timeoutId) clearTimeout(timeoutId);
            setLoading(false);
        };

        try {
            // Open a placeholder popup synchronously
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
                    popup.document.write("<p style='font-family:monospace;padding:20px'>Connecting to Google...</p>");
                }
            }

            // Get the OAuth authorization URL
            const { data: authData, error: authError } = await resilientFetch<{ success: boolean; url: string; error?: string }>("/api/auth/antigravity/authorize", { retries: 1 });

            if (authError || !authData?.success || !authData?.url) {
                popup?.close();
                throw new Error(authData?.error || authError || "Failed to get authorization URL");
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

            // Poll for auth completion
            let pollInFlight = false;
            pollInterval = setInterval(async () => {
                if (pollInFlight) return;
                pollInFlight = true;
                try {
                    const response = await fetch(`/api/auth/antigravity?t=${Date.now()}`);
                    if (response.ok) {
                        const data = await response.json();
                        if (data.authenticated) {
                            popup?.close();
                            setIsAuthenticated(true);
                            cleanup();
                            return;
                        }
                    }

                    if (popup?.closed) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                        const finalCheck = await fetch(`/api/auth/antigravity?t=${Date.now()}`);
                        if (finalCheck.ok) {
                            const data = await finalCheck.json();
                            if (data.authenticated) {
                                setIsAuthenticated(true);
                            }
                        }
                        cleanup();
                    }
                } finally {
                    pollInFlight = false;
                }
            }, 1000);

            // Timeout after 5 minutes
            timeoutId = setTimeout(() => {
                popup?.close();
                cleanup();
            }, 5 * 60 * 1000);

        } catch (err) {
            console.error("Antigravity login failed:", err);
            setError(err instanceof Error ? err.message : "Authentication failed");
            cleanup();
        }
    };

    const handleCodexLogin = async () => {
        setLoading(true);
        setError(null);

        const electronAPI = typeof window !== "undefined" && "electronAPI" in window
            ? (window as unknown as { electronAPI?: { isElectron?: boolean; shell?: { openExternal: (url: string) => Promise<void> } } }).electronAPI
            : undefined;
        const isElectron = !!electronAPI?.isElectron;

        let popup: Window | null = null;
        let pollInterval: NodeJS.Timeout | null = null;
        let timeoutId: NodeJS.Timeout | null = null;

        const cleanup = () => {
            if (pollInterval) clearInterval(pollInterval);
            if (timeoutId) clearTimeout(timeoutId);
            setLoading(false);
        };

        try {
            // Open a placeholder popup synchronously
            if (!isElectron) {
                const width = 500;
                const height = 700;
                const left = window.screenX + (window.outerWidth - width) / 2;
                const top = window.screenY + (window.outerHeight - height) / 2;

                popup = window.open(
                    "about:blank",
                    "codex-auth",
                    `width=${width},height=${height},left=${left},top=${top}`
                );

                if (popup) {
                    popup.document.write("<p style='font-family:monospace;padding:20px'>Connecting to OpenAI...</p>");
                }
            }

            // Get the OAuth authorization URL
            const { data: authData, error: authError } = await resilientFetch<{ success: boolean; url: string; error?: string }>("/api/auth/codex/authorize", { retries: 1 });

            if (authError || !authData?.success || !authData?.url) {
                popup?.close();
                throw new Error(authData?.error || authError || "Failed to get authorization URL");
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

            // Poll for auth completion
            let pollInFlight = false;
            pollInterval = setInterval(async () => {
                if (pollInFlight) return;
                pollInFlight = true;
                try {
                    const response = await fetch(`/api/auth/codex?t=${Date.now()}`);
                    if (response.ok) {
                        const data = await response.json();
                        if (data.authenticated) {
                            popup?.close();
                            setIsAuthenticated(true);
                            cleanup();
                            return;
                        }
                    }

                    if (popup?.closed) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                        const finalCheck = await fetch(`/api/auth/codex?t=${Date.now()}`);
                        if (finalCheck.ok) {
                            const data = await finalCheck.json();
                            if (data.authenticated) {
                                setIsAuthenticated(true);
                            }
                        }
                        cleanup();
                    }
                } finally {
                    pollInFlight = false;
                }
            }, 1000);

            // Timeout after 5 minutes
            timeoutId = setTimeout(() => {
                popup?.close();
                cleanup();
            }, 5 * 60 * 1000);

        } catch (err) {
            console.error("Codex login failed:", err);
            setError(err instanceof Error ? err.message : "Authentication failed");
            cleanup();
        }
    };

    const handleClaudeCodeLogin = async () => {
        setLoading(true);
        setError(null);

        const electronAPI = typeof window !== "undefined" && "electronAPI" in window
            ? (window as unknown as { electronAPI?: { isElectron?: boolean; shell?: { openExternal: (url: string) => Promise<void> } } }).electronAPI
            : undefined;
        const isElectron = !!electronAPI?.isElectron;

        try {
            // Get the OAuth authorization URL from our backend
            const { data: authData, error: authError } = await resilientFetch<{ success: boolean; url: string; error?: string }>("/api/auth/claudecode/authorize", { retries: 1 });

            if (authError || !authData?.success || !authData?.url) {
                throw new Error(authData?.error || authError || "Failed to get authorization URL");
            }

            // Open the Anthropic authorization page
            if (isElectron && electronAPI?.shell?.openExternal) {
                await electronAPI.shell.openExternal(authData.url);
            } else {
                window.open(authData.url, "_blank");
            }

            // Switch to paste mode so the user can enter the code from the console page
            setClaudeCodePasteMode(true);
            setLoading(false);
        } catch (err) {
            console.error("Claude Code login failed:", err);
            setError(err instanceof Error ? err.message : "Authentication failed");
            setLoading(false);
        }
    };

    const handleClaudeCodePasteSubmit = async () => {
        if (!claudeCodePasteValue.trim()) {
            setError("Please paste the authorization code");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const { data, error: fetchError } = await resilientPost<{ success: boolean; error?: string }>("/api/auth/claudecode/exchange", { code: claudeCodePasteValue.trim() });

            if (fetchError || !data?.success) {
                throw new Error(data?.error || fetchError || "Failed to exchange authorization code");
            }

            setIsAuthenticated(true);
            setClaudeCodePasteMode(false);
            setClaudeCodePasteValue("");
        } catch (err) {
            console.error("Claude Code code exchange failed:", err);
            setError(err instanceof Error ? err.message : "Code exchange failed");
        } finally {
            setLoading(false);
        }
    };

    const handleApiKeySubmit = async () => {
        if (!apiKey.trim()) {
            setError("Please enter an API key");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // Save the API key to settings
            const keyFieldMap: Record<string, string> = {
                anthropic: "anthropicApiKey",
                openrouter: "openrouterApiKey",
                kimi: "kimiApiKey",
            };
            const keyField = keyFieldMap[provider];
            if (!keyField) {
                throw new Error("Invalid provider for API key");
            }

            const { error: saveError } = await resilientPut("/api/settings", {
                llmProvider: provider,
                [keyField]: apiKey,
            });

            if (saveError) {
                throw new Error("Failed to save API key");
            }

            setIsAuthenticated(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save API key");
        } finally {
            setLoading(false);
        }
    };

    const handleContinue = () => {
        if (isAuthenticated) {
            onAuthenticated();
        } else {
            onSkip();
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-full px-6 py-12">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center max-w-md w-full"
            >
                <h1 className="text-2xl font-bold text-terminal-dark mb-2 font-mono">
                    {t("title")}
                </h1>

                {provider === "antigravity" || provider === "codex" || provider === "claudecode" ? (
                    <div className="space-y-6 mt-8">
                        {isAuthenticated ? (
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                className="p-6 rounded-xl bg-terminal-green/10 border border-terminal-green"
                            >
                                <CheckCircle2 className="w-12 h-12 text-terminal-green mx-auto mb-4" />
                                <p className="font-mono text-terminal-green font-semibold">
                                    Connected to {provider === "antigravity" ? "Antigravity" : provider === "codex" ? "Codex" : "Claude Code"}!
                                </p>
                            </motion.div>
                        ) : provider === "claudecode" && claudeCodePasteMode ? (
                            <>
                                <div className="text-left space-y-3">
                                    <p className="text-sm text-terminal-muted font-mono">
                                        A browser tab has been opened. After authorizing, copy the code shown on the page and paste it below.
                                    </p>
                                    <label className="block font-mono text-sm text-terminal-muted">
                                        Authorization Code
                                    </label>
                                    <input
                                        type="text"
                                        value={claudeCodePasteValue}
                                        onChange={(e) => setClaudeCodePasteValue(e.target.value)}
                                        placeholder="Paste the code here..."
                                        className="w-full rounded-lg border border-terminal-border bg-white px-4 py-3 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-2 focus:ring-terminal-green/20"
                                        autoFocus
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                void handleClaudeCodePasteSubmit();
                                            }
                                        }}
                                    />
                                </div>

                                {error && (
                                    <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600">
                                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                        <span className="text-sm font-mono">{error}</span>
                                    </div>
                                )}

                                <div className="flex gap-2">
                                    <Button
                                        variant="ghost"
                                        onClick={() => {
                                            setClaudeCodePasteMode(false);
                                            setClaudeCodePasteValue("");
                                            setError(null);
                                        }}
                                        disabled={loading}
                                        className="font-mono text-terminal-muted hover:text-terminal-dark"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        onClick={handleClaudeCodePasteSubmit}
                                        disabled={loading || !claudeCodePasteValue.trim()}
                                        className="flex-1 gap-2 bg-terminal-green text-white hover:bg-terminal-green/90 font-mono"
                                    >
                                        {loading ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Verifying...
                                            </>
                                        ) : (
                                            "Submit Code"
                                        )}
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <>
                                <Button
                                    onClick={provider === "antigravity" ? handleAntigravityLogin : provider === "codex" ? handleCodexLogin : handleClaudeCodeLogin}
                                    disabled={loading}
                                    className="w-full gap-2 bg-terminal-green text-white hover:bg-terminal-green/90 font-mono py-6"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                            Connecting...
                                        </>
                                    ) : provider === "codex" ? (
                                        "Sign in with OpenAI"
                                    ) : provider === "claudecode" ? (
                                        "Sign in with Anthropic"
                                    ) : (
                                        t("oauth.button")
                                    )}
                                </Button>
                                <p className="text-sm text-terminal-muted font-mono">
                                    {t("oauth.hint")}
                                </p>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="space-y-4 mt-8">
                        {isAuthenticated ? (
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                className="p-6 rounded-xl bg-terminal-green/10 border border-terminal-green"
                            >
                                <CheckCircle2 className="w-12 h-12 text-terminal-green mx-auto mb-4" />
                                <p className="font-mono text-terminal-green font-semibold">
                                    API Key saved!
                                </p>
                            </motion.div>
                        ) : (
                            <>
                                <div className="text-left">
                                    <label className="block font-mono text-sm text-terminal-muted mb-2">
                                        {t("apiKey.label")}
                                    </label>
                                    <input
                                        type="password"
                                        value={apiKey}
                                        onChange={(e) => setApiKey(e.target.value)}
                                        placeholder={t("apiKey.placeholder")}
                                        className="w-full rounded-lg border border-terminal-border bg-white px-4 py-3 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-2 focus:ring-terminal-green/20"
                                    />
                                    <p className="mt-2 text-xs text-terminal-muted font-mono">
                                        {t("apiKey.hint")}
                                    </p>
                                </div>

                                {error && (
                                    <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600">
                                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                        <span className="text-sm font-mono">{error}</span>
                                    </div>
                                )}

                                <Button
                                    onClick={handleApiKeySubmit}
                                    disabled={loading || !apiKey.trim()}
                                    className="w-full gap-2 bg-terminal-green text-white hover:bg-terminal-green/90 font-mono"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Saving...
                                        </>
                                    ) : (
                                        "Save API Key"
                                    )}
                                </Button>
                            </>
                        )}
                    </div>
                )}

                <div className="flex justify-between mt-8">
                    <Button
                        variant="ghost"
                        onClick={onBack}
                        className="gap-2 font-mono text-terminal-muted hover:text-terminal-dark"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back
                    </Button>
                    <div className="flex gap-2">
                        {!isAuthenticated && (
                            <Button
                                variant="ghost"
                                onClick={onSkip}
                                className="font-mono text-terminal-muted hover:text-terminal-dark"
                            >
                                {t("skip")}
                            </Button>
                        )}
                        <Button
                            onClick={handleContinue}
                            className="gap-2 bg-terminal-green text-white hover:bg-terminal-green/90 font-mono"
                        >
                            Continue
                            <ArrowRight className="w-4 h-4" />
                        </Button>
                    </div>
                </div>

                {!isAuthenticated && (
                    <p className="text-xs text-terminal-muted font-mono mt-4">
                        {t("skipHint")}
                    </p>
                )}
            </motion.div>
        </div>
    );
}
