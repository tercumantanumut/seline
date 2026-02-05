"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Loader2, CheckCircle2, Cloud, HardDrive, Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface EmbeddingStepProps {
    onContinue: () => void;
    onBack: () => void;
    onSkip: () => void;
}

// Local embedding models available for download
const LOCAL_EMBEDDING_MODELS = [
    { id: "Xenova/bge-small-en-v1.5", name: "BGE Small (384 dims)", size: "130MB", recommended: true },
    { id: "Xenova/all-MiniLM-L6-v2", name: "MiniLM L6 (384 dims)", size: "90MB", recommended: false },
    { id: "Xenova/bge-base-en-v1.5", name: "BGE Base (768 dims)", size: "440MB", recommended: false },
    { id: "Xenova/bge-large-en-v1.5", name: "BGE Large (1024 dims)", size: "1.3GB", recommended: false },
];

export function EmbeddingStep({ onContinue, onBack, onSkip }: EmbeddingStepProps) {
    const t = useTranslations("onboarding.embedding");
    const [provider, setProvider] = useState<"openrouter" | "local">("openrouter");
    const [selectedModel, setSelectedModel] = useState(LOCAL_EMBEDDING_MODELS[0].id);
    const [hasOpenRouterKey, setHasOpenRouterKey] = useState(false);
    const [isElectron, setIsElectron] = useState(false);
    const [modelStatus, setModelStatus] = useState<Record<string, boolean>>({});
    const [downloading, setDownloading] = useState<string | null>(null);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    // Check environment and existing settings on mount
    useEffect(() => {
        const checkEnvironment = async () => {
            // Check if Electron
            if (typeof window !== "undefined" && "electronAPI" in window) {
                setIsElectron(true);
                const electronAPI = (window as unknown as {
                    electronAPI: {
                        model: { checkExists: (id: string) => Promise<boolean> }
                    }
                }).electronAPI;

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

            // Check if OpenRouter key exists
            try {
                const res = await fetch("/api/settings");
                if (res.ok) {
                    const data = await res.json();
                    setHasOpenRouterKey(!!data.openrouterApiKey);
                    // Default to local if no OpenRouter key
                    if (!data.openrouterApiKey) {
                        setProvider("local");
                    }
                }
            } catch (err) {
                console.error("Failed to check settings:", err);
            }
        };

        checkEnvironment();
    }, []);

    const handleDownload = async (modelId: string) => {
        if (!isElectron) return;

        setDownloading(modelId);
        setDownloadProgress(0);

        const electronAPI = (window as unknown as {
            electronAPI?: {
                model?: {
                    download?: (id: string) => Promise<{ success: boolean; error?: string }>;
                    onProgress?: (cb: (data: { modelId: string; status: string; progress?: number; error?: string }) => void) => void;
                    removeProgressListener?: () => void;
                }
            }
        }).electronAPI;

        if (!electronAPI?.model?.download) {
            setDownloading(null);
            return;
        }

        // Set up progress listener
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
                    }
                }
            });
        }

        try {
            await electronAPI.model.download(modelId);
        } catch {
            setDownloading(null);
        } finally {
            electronAPI.model.removeProgressListener?.();
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const settings: Record<string, unknown> = {
                embeddingProvider: provider,
            };

            if (provider === "local") {
                settings.embeddingModel = selectedModel;
            } else {
                settings.embeddingModel = "openai/text-embedding-3-small";
            }

            const res = await fetch("/api/settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(settings),
            });

            if (res.ok) {
                setSaved(true);
                setTimeout(() => onContinue(), 500);
            }
        } catch (err) {
            console.error("Failed to save embedding settings:", err);
        } finally {
            setSaving(false);
        }
    };

    const canContinue = provider === "openrouter"
        ? hasOpenRouterKey
        : modelStatus[selectedModel];

    return (
        <div className="flex flex-col items-center justify-center min-h-full px-6 py-12">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center max-w-xl w-full"
            >
                <h1 className="text-2xl font-bold text-terminal-dark mb-2 font-mono">
                    {t("title")}
                </h1>
                <p className="text-terminal-muted mb-8 font-mono">
                    {t("subtitle")}
                </p>

                {saved ? (
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="p-6 rounded-xl bg-terminal-green/10 border border-terminal-green mb-8"
                    >
                        <CheckCircle2 className="w-12 h-12 text-terminal-green mx-auto mb-4" />
                        <p className="font-mono text-terminal-green font-semibold">
                            {t("saved")}
                        </p>
                    </motion.div>
                ) : (
                    <>
                        {/* Provider Selection */}
                        <div className="space-y-4 mb-8">
                            <button
                                onClick={() => setProvider("openrouter")}
                                className={cn(
                                    "w-full p-4 rounded-xl border-2 transition-all text-left flex items-start gap-4",
                                    provider === "openrouter"
                                        ? "border-terminal-green bg-terminal-green/5"
                                        : "border-terminal-border hover:border-terminal-green/50 bg-white/50"
                                )}
                            >
                                <div className={cn(
                                    "p-3 rounded-lg",
                                    provider === "openrouter"
                                        ? "bg-terminal-green text-white"
                                        : "bg-terminal-dark/5 text-terminal-muted"
                                )}>
                                    <Cloud className="w-6 h-6" />
                                </div>
                                <div className="flex-1">
                                    <span className="font-semibold text-terminal-dark font-mono">
                                        {t("providers.openrouter.title")}
                                    </span>
                                    <p className="text-sm text-terminal-muted font-mono mt-1">
                                        {t("providers.openrouter.desc")}
                                    </p>
                                    {!hasOpenRouterKey && provider === "openrouter" && (
                                        <p className="text-xs text-amber-600 font-mono mt-2">
                                            {t("providers.openrouter.noKey")}
                                        </p>
                                    )}
                                </div>
                            </button>

                            <button
                                onClick={() => setProvider("local")}
                                disabled={!isElectron}
                                className={cn(
                                    "w-full p-4 rounded-xl border-2 transition-all text-left flex items-start gap-4",
                                    provider === "local"
                                        ? "border-terminal-green bg-terminal-green/5"
                                        : "border-terminal-border hover:border-terminal-green/50 bg-white/50",
                                    !isElectron && "opacity-50 cursor-not-allowed"
                                )}
                            >
                                <div className={cn(
                                    "p-3 rounded-lg",
                                    provider === "local"
                                        ? "bg-terminal-green text-white"
                                        : "bg-terminal-dark/5 text-terminal-muted"
                                )}>
                                    <HardDrive className="w-6 h-6" />
                                </div>
                                <div className="flex-1">
                                    <span className="font-semibold text-terminal-dark font-mono">
                                        {t("providers.local.title")}
                                    </span>
                                    <p className="text-sm text-terminal-muted font-mono mt-1">
                                        {t("providers.local.desc")}
                                    </p>
                                    {!isElectron && (
                                        <p className="text-xs text-amber-600 font-mono mt-2">
                                            {t("providers.local.electronOnly")}
                                        </p>
                                    )}
                                </div>
                            </button>
                        </div>

                        {/* Local Model Selection */}
                        {provider === "local" && isElectron && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                className="mb-8 space-y-3"
                            >
                                <p className="text-sm text-terminal-muted font-mono text-left">
                                    {t("selectModel")}
                                </p>
                                {LOCAL_EMBEDDING_MODELS.map((model) => (
                                    <div
                                        key={model.id}
                                        className={cn(
                                            "flex items-center justify-between p-3 rounded-lg border transition-all",
                                            selectedModel === model.id
                                                ? "border-terminal-green bg-terminal-green/5"
                                                : "border-terminal-border bg-white/50"
                                        )}
                                    >
                                        <button
                                            onClick={() => setSelectedModel(model.id)}
                                            className="flex-1 text-left"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-sm text-terminal-dark">
                                                    {model.name}
                                                </span>
                                                {model.recommended && (
                                                    <span className="text-xs px-2 py-0.5 rounded-full bg-terminal-green/10 text-terminal-green">
                                                        {t("recommended")}
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-xs text-terminal-muted font-mono">
                                                {model.size}
                                            </span>
                                        </button>

                                        {modelStatus[model.id] ? (
                                            <CheckCircle2 className="w-5 h-5 text-terminal-green" />
                                        ) : downloading === model.id ? (
                                            <div className="flex items-center gap-2">
                                                <Loader2 className="w-4 h-4 animate-spin text-terminal-green" />
                                                <span className="text-xs font-mono text-terminal-muted">
                                                    {downloadProgress}%
                                                </span>
                                            </div>
                                        ) : (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleDownload(model.id)}
                                                className="gap-1 text-xs"
                                            >
                                                <Download className="w-3 h-3" />
                                                {t("download")}
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </motion.div>
                        )}
                    </>
                )}

                {/* Navigation */}
                <div className="flex justify-between mt-8">
                    <Button
                        variant="ghost"
                        onClick={onBack}
                        className="gap-2 font-mono text-terminal-muted hover:text-terminal-dark"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        {t("back")}
                    </Button>
                    <div className="flex gap-2">
                        <Button
                            variant="ghost"
                            onClick={onSkip}
                            className="font-mono text-terminal-muted hover:text-terminal-dark"
                        >
                            {t("skip")}
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={!canContinue || saving || saved}
                            className="gap-2 bg-terminal-green text-white hover:bg-terminal-green/90 font-mono"
                        >
                            {saving ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    {t("saving")}
                                </>
                            ) : (
                                <>
                                    {t("continue")}
                                    <ArrowRight className="w-4 h-4" />
                                </>
                            )}
                        </Button>
                    </div>
                </div>

                <p className="text-xs text-terminal-muted font-mono mt-4">
                    {t("skipHint")}
                </p>
            </motion.div>
        </div>
    );
}
