"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { ComputerGraphic } from "../computer-graphic";
import { TypewriterText } from "@/components/ui/typewriter-text";
import { TerminalPrompt } from "@/components/ui/terminal-prompt";
import { useReducedMotion } from "../hooks/use-reduced-motion";
import { useTranslations } from "next-intl";
import {
    CloudIcon,
    HardDriveIcon,
    CheckCircleIcon,
    AlertCircleIcon,
    Loader2Icon,
} from "lucide-react";

// Suggested OpenRouter embedding models
const OPENROUTER_MODELS = [
    {
        id: "openai/text-embedding-3-small",
        name: "OpenAI Embedding 3 Small",
        description: "Fast, cost-effective, 1536 dimensions",
        recommended: true,
    },
    {
        id: "openai/text-embedding-3-large",
        name: "OpenAI Embedding 3 Large",
        description: "Highest quality, 3072 dimensions",
        recommended: false,
    },
    {
        id: "voyage-ai/voyage-3-lite",
        name: "Voyage 3 Lite",
        description: "Fast retrieval, 512 dimensions",
        recommended: false,
    },
];

// Local embedding models (from settings page)
const LOCAL_MODELS = [
    {
        id: "Xenova/bge-large-en-v1.5",
        name: "BGE Large",
        description: "1024 dimensions, ~1.3GB download",
        recommended: true,
    },
    {
        id: "Xenova/bge-base-en-v1.5",
        name: "BGE Base",
        description: "768 dimensions, ~440MB download",
        recommended: false,
    },
    {
        id: "Xenova/bge-small-en-v1.5",
        name: "BGE Small",
        description: "384 dimensions, ~130MB download",
        recommended: false,
    },
    {
        id: "Xenova/all-MiniLM-L6-v2",
        name: "MiniLM L6",
        description: "384 dimensions, ~90MB download",
        recommended: false,
    },
];

interface EmbeddingSetupPageProps {
    agentName: string;
    onSubmit: (config: { provider: string; model: string; apiKey?: string }) => void;
    onBack: () => void;
    onSkip: () => void;
}

export function EmbeddingSetupPage({
    agentName,
    onSubmit,
    onBack,
    onSkip,
}: EmbeddingSetupPageProps) {
    const t = useTranslations("characterCreation.embeddingSetup");
    const [provider, setProvider] = useState<"openrouter" | "local">("openrouter");
    const [selectedModel, setSelectedModel] = useState(OPENROUTER_MODELS[0].id);
    const [hasOpenRouterKey, setHasOpenRouterKey] = useState<boolean | null>(null);
    const [apiKey, setApiKey] = useState("");
    const [showForm, setShowForm] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [modelStatus, setModelStatus] = useState<Record<string, boolean>>({});
    const prefersReducedMotion = useReducedMotion();
    const hasAnimated = useRef(false);

    // Check if OpenRouter API key is configured
    useEffect(() => {
        fetch("/api/settings")
            .then((res) => res.json())
            .then((data) => {
                setHasOpenRouterKey(!!data.openrouterApiKey);
                // If no OpenRouter key, default to local
                if (!data.openrouterApiKey) {
                    setProvider("local");
                    setSelectedModel(LOCAL_MODELS[0].id);
                }
            })
            .catch(() => setHasOpenRouterKey(false));
    }, []);

    // Check local model status in Electron
    useEffect(() => {
        const checkModels = async () => {
            if (typeof window !== "undefined" && "electronAPI" in window) {
                const electronAPI = (window as unknown as {
                    electronAPI: { model: { checkExists: (id: string) => Promise<boolean> } };
                }).electronAPI;

                const status: Record<string, boolean> = {};
                for (const model of LOCAL_MODELS) {
                    try {
                        status[model.id] = await electronAPI.model.checkExists(model.id);
                    } catch {
                        status[model.id] = false;
                    }
                }
                setModelStatus(status);
            }
        };
        checkModels();
    }, []);

    const handleProviderChange = (newProvider: "openrouter" | "local") => {
        setProvider(newProvider);
        setSelectedModel(
            newProvider === "openrouter" ? OPENROUTER_MODELS[0].id : LOCAL_MODELS[0].id
        );
    };

    const handleDownload = async (modelId: string) => {
        if (typeof window === "undefined" || !("electronAPI" in window)) return;

        setIsDownloading(true);
        setDownloadProgress(0);

        const electronAPI = (window as unknown as {
            electronAPI?: {
                model?: {
                    download?: (id: string) => Promise<{ success: boolean; error?: string }>;
                    onProgress?: (
                        cb: (data: {
                            modelId: string;
                            status: string;
                            progress?: number;
                            error?: string;
                        }) => void
                    ) => void;
                    removeProgressListener?: () => void;
                };
            };
        }).electronAPI;

        if (!electronAPI?.model?.download) {
            setIsDownloading(false);
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
                        setIsDownloading(false);
                        setModelStatus((prev) => ({ ...prev, [modelId]: true }));
                    }
                    if (data.status === "error") {
                        setIsDownloading(false);
                    }
                }
            });
        }

        try {
            await electronAPI.model.download(modelId);
        } catch {
            setIsDownloading(false);
        } finally {
            electronAPI.model.removeProgressListener?.();
        }
    };

    const handleSubmit = () => {
        if (provider === "openrouter" && !hasOpenRouterKey && !apiKey) {
            return;
        }
        onSubmit({ provider, model: selectedModel, apiKey: apiKey || undefined });
    };

    const models = provider === "openrouter" ? OPENROUTER_MODELS : LOCAL_MODELS;
    const isElectron = typeof window !== "undefined" && "electronAPI" in window;
    const needsDownload =
        provider === "local" && isElectron && !modelStatus[selectedModel];

    return (
        <div className="flex h-full min-h-full flex-col items-center bg-terminal-cream px-4 py-6 sm:px-8">
            <div className="flex w-full max-w-4xl flex-1 flex-col gap-6 min-h-0">
                {/* Header */}
                <div className="flex items-start gap-8">
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: prefersReducedMotion ? 0 : 0.5 }}
                    >
                        <ComputerGraphic size="sm" />
                    </motion.div>

                    <div className="flex-1 space-y-4">
                        <TerminalPrompt
                            prefix="step-3"
                            symbol="$"
                            animate={!prefersReducedMotion}
                        >
                            <span className="text-terminal-amber">
                                agent.configureEmbeddings(&quot;{agentName}&quot;)
                            </span>
                        </TerminalPrompt>

                        <div className="font-mono text-lg text-terminal-dark">
                            {!hasAnimated.current ? (
                                <TypewriterText
                                    text={t("question")}
                                    delay={prefersReducedMotion ? 0 : 200}
                                    speed={prefersReducedMotion ? 0 : 25}
                                    onComplete={() => {
                                        hasAnimated.current = true;
                                        setShowForm(true);
                                    }}
                                    showCursor={false}
                                />
                            ) : (
                                <span>{t("question")}</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Provider Selection */}
                {showForm && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: prefersReducedMotion ? 0 : 0.3 }}
                        className="flex min-h-0 flex-1 flex-col rounded-lg border border-terminal-border bg-terminal-bg/30"
                    >
                        <div className="flex-1 min-h-0 overflow-y-auto p-5">
                            {/* Provider Toggle */}
                            <div className="flex gap-4 mb-6">
                                <ProviderCard
                                    icon={<CloudIcon className="w-5 h-5" />}
                                    title={t("providers.openrouter.title")}
                                    description={t("providers.openrouter.description")}
                                    selected={provider === "openrouter"}
                                    onClick={() => handleProviderChange("openrouter")}
                                />
                                <ProviderCard
                                    icon={<HardDriveIcon className="w-5 h-5" />}
                                    title={t("providers.local.title")}
                                    description={t("providers.local.description")}
                                    selected={provider === "local"}
                                    onClick={() => handleProviderChange("local")}
                                />
                            </div>



                            {/* API Key Input for OpenRouter */}
                            {provider === "openrouter" && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    className="mb-6"
                                >
                                    <label className="block text-sm font-mono text-terminal-dark mb-2">
                                        OpenRouter API Key
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type="password"
                                            value={apiKey}
                                            onChange={(e) => setApiKey(e.target.value)}
                                            placeholder={hasOpenRouterKey ? "••••••••••••••••" : "sk-or-..."}
                                            className="flex-1 rounded border border-terminal-border bg-terminal-cream px-3 py-2 font-mono text-sm focus:border-terminal-amber focus:outline-none"
                                        />
                                    </div>
                                    {!hasOpenRouterKey && !apiKey && (
                                        <p className="mt-1 text-xs font-mono text-terminal-amber flex items-center gap-1">
                                            <AlertCircleIcon className="w-3 h-3" />
                                            API Key required for OpenRouter
                                        </p>
                                    )}
                                </motion.div>
                            )}

                            {/* Model Selection */}
                            <div className="space-y-3">
                                <h3 className="text-sm font-mono font-semibold text-terminal-amber">
                                    {t("selectModel")}
                                </h3>
                                <div className="grid gap-2">
                                    {models.map((model) => (
                                        <ModelCard
                                            key={model.id}
                                            model={model}
                                            selected={selectedModel === model.id}
                                            downloaded={modelStatus[model.id]}
                                            onClick={() => setSelectedModel(model.id)}
                                            recommendedLabel={t("models.recommended")}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Navigation */}
                        <div className="flex flex-col gap-3 border-t border-terminal-border/50 bg-terminal-cream/90 px-5 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
                            <button
                                onClick={onBack}
                                className="order-2 text-sm font-mono text-terminal-dark/60 transition-colors hover:text-terminal-dark sm:order-1"
                            >
                                {t("back")}
                            </button>
                            <div className="flex gap-3 order-1 sm:order-2">
                                <button
                                    onClick={onSkip}
                                    className="text-sm font-mono text-terminal-dark/60 transition-colors hover:text-terminal-dark"
                                >
                                    {t("skip")}
                                </button>
                                {needsDownload ? (
                                    <button
                                        onClick={() => handleDownload(selectedModel)}
                                        disabled={isDownloading}
                                        className="w-full rounded bg-terminal-amber px-4 py-2 text-sm font-mono text-white transition-colors hover:bg-terminal-amber/90 disabled:opacity-70 sm:w-auto flex items-center justify-center gap-2"
                                    >
                                        {isDownloading ? (
                                            <>
                                                <Loader2Icon className="w-4 h-4 animate-spin" />
                                                {downloadProgress}%
                                            </>
                                        ) : (
                                            t("downloading").replace("...", "")
                                        )}
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleSubmit}
                                        className="w-full rounded bg-terminal-dark px-4 py-2 text-sm font-mono text-terminal-cream transition-colors hover:bg-terminal-dark/90 sm:w-auto"
                                    >
                                        {t("continue")}
                                    </button>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </div>
        </div >
    );
}

// Helper Components
function ProviderCard({
    icon,
    title,
    description,
    selected,
    disabled,
    warning,
    onClick,
}: {
    icon: React.ReactNode;
    title: string;
    description: string;
    selected: boolean;
    disabled?: boolean;
    warning?: string;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`flex-1 p-4 rounded-lg border-2 transition-all text-left ${selected
                ? "border-terminal-amber bg-terminal-amber/10"
                : disabled
                    ? "border-terminal-border/50 bg-terminal-bg/20 opacity-60 cursor-not-allowed"
                    : "border-terminal-border hover:border-terminal-amber/50"
                }`}
        >
            <div className="flex items-center gap-3 mb-2">
                <div className={selected ? "text-terminal-amber" : "text-terminal-dark/60"}>
                    {icon}
                </div>
                <span className="font-mono font-semibold text-terminal-dark">{title}</span>
                {selected && (
                    <CheckCircleIcon className="w-4 h-4 text-terminal-green ml-auto" />
                )}
            </div>
            <p className="text-sm text-terminal-dark/70">{description}</p>
            {warning && (
                <div className="flex items-center gap-2 mt-2 text-xs text-terminal-amber">
                    <AlertCircleIcon className="w-3 h-3" />
                    <span>{warning}</span>
                </div>
            )}
        </button>
    );
}

function ModelCard({
    model,
    selected,
    downloaded,
    onClick,
    recommendedLabel,
}: {
    model: { id: string; name: string; description: string; recommended: boolean };
    selected: boolean;
    downloaded?: boolean;
    onClick: () => void;
    recommendedLabel: string;
}) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center justify-between p-3 rounded border transition-all ${selected
                ? "border-terminal-amber bg-terminal-amber/5"
                : "border-terminal-border/50 hover:border-terminal-amber/30"
                }`}
        >
            <div className="flex items-center gap-3">
                <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${selected ? "border-terminal-amber" : "border-terminal-border"
                        }`}
                >
                    {selected && <div className="w-2 h-2 rounded-full bg-terminal-amber" />}
                </div>
                <div className="text-left">
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-terminal-dark">{model.name}</span>
                        {model.recommended && (
                            <span className="px-1.5 py-0.5 text-xs font-mono bg-terminal-green/20 text-terminal-green rounded">
                                {recommendedLabel}
                            </span>
                        )}
                        {downloaded && (
                            <CheckCircleIcon className="w-3.5 h-3.5 text-terminal-green" />
                        )}
                    </div>
                    <span className="text-xs text-terminal-dark/60">{model.description}</span>
                </div>
            </div>
        </button>
    );
}
