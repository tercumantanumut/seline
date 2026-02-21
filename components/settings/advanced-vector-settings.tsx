"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Settings2, RotateCcw, Loader2Icon, CheckIcon, AlertTriangleIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
    RERANKER_MODELS,
    isValidRerankerModel,
    formatDimensionLabel,
    type RerankerModelInfo,
} from "@/lib/config/embedding-models";

// Optimal defaults from testing (93% retrieval accuracy)
const OPTIMAL_DEFAULTS = {
    vectorSearchHybridEnabled: true,
    vectorSearchTokenChunkingEnabled: false,
    vectorSearchRerankingEnabled: false,
    vectorSearchQueryExpansionEnabled: false,
    vectorSearchDenseWeight: 1.0,
    vectorSearchLexicalWeight: 2.0,
    vectorSearchRrfK: 50,
    vectorSearchTokenChunkSize: 96,
    vectorSearchTokenChunkStride: 48,
    vectorSearchRerankTopK: 20,
    vectorSearchRerankModel: "cross-encoder/ms-marco-MiniLM-L-6-v2",
    vectorSearchMaxFileLines: 3000,
    vectorSearchMaxLineLength: 1000,
};

// Use shared reranker model registry (source of truth: lib/config/embedding-models.ts)
const LOCAL_RERANK_MODELS = RERANKER_MODELS.map((m: RerankerModelInfo) => ({
    id: m.id,
    name: m.description ? `${m.name} (${m.description})` : m.name,
}));

interface AdvancedVectorSettingsProps {
    // Hybrid Search
    hybridEnabled: boolean;
    onHybridEnabledChange: (value: boolean) => void;
    denseWeight: number;
    onDenseWeightChange: (value: number) => void;
    lexicalWeight: number;
    onLexicalWeightChange: (value: number) => void;
    rrfK: number;
    onRrfKChange: (value: number) => void;
    // Token Chunking
    tokenChunkingEnabled: boolean;
    onTokenChunkingEnabledChange: (value: boolean) => void;
    chunkSize: number;
    onChunkSizeChange: (value: number) => void;
    chunkStride: number;
    onChunkStrideChange: (value: number) => void;
    // Reranking
    rerankingEnabled: boolean;
    onRerankingEnabledChange: (value: boolean) => void;
    rerankTopK: number;
    onRerankTopKChange: (value: number) => void;
    rerankModel: string;
    onRerankModelChange: (value: string) => void;
    // Query Processing
    queryExpansionEnabled: boolean;
    onQueryExpansionEnabledChange: (value: boolean) => void;
    // File Limits
    maxFileLines: number;
    onMaxFileLinesChange: (value: number) => void;
    maxLineLength: number;
    onMaxLineLengthChange: (value: number) => void;
    // Embedding model context (for dimension display)
    embeddingModel?: string;
    embeddingProvider?: string;
}

export function AdvancedVectorSettings(props: AdvancedVectorSettingsProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const t = useTranslations("settings.vector.advanced");

    const handleResetToDefaults = () => {
        props.onHybridEnabledChange(OPTIMAL_DEFAULTS.vectorSearchHybridEnabled);
        props.onTokenChunkingEnabledChange(OPTIMAL_DEFAULTS.vectorSearchTokenChunkingEnabled);
        props.onRerankingEnabledChange(OPTIMAL_DEFAULTS.vectorSearchRerankingEnabled);
        props.onQueryExpansionEnabledChange(OPTIMAL_DEFAULTS.vectorSearchQueryExpansionEnabled);
        props.onDenseWeightChange(OPTIMAL_DEFAULTS.vectorSearchDenseWeight);
        props.onLexicalWeightChange(OPTIMAL_DEFAULTS.vectorSearchLexicalWeight);
        props.onRrfKChange(OPTIMAL_DEFAULTS.vectorSearchRrfK);
        props.onChunkSizeChange(OPTIMAL_DEFAULTS.vectorSearchTokenChunkSize);
        props.onChunkStrideChange(OPTIMAL_DEFAULTS.vectorSearchTokenChunkStride);
        props.onRerankTopKChange(OPTIMAL_DEFAULTS.vectorSearchRerankTopK);
        props.onRerankModelChange(OPTIMAL_DEFAULTS.vectorSearchRerankModel);
        props.onMaxFileLinesChange(OPTIMAL_DEFAULTS.vectorSearchMaxFileLines);
        props.onMaxLineLengthChange(OPTIMAL_DEFAULTS.vectorSearchMaxLineLength);
    };

    return (
        <div className="rounded-lg border border-terminal-border overflow-hidden">
            {/* Accordion Header */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 p-4 transition-colors hover:bg-terminal-cream dark:hover:bg-terminal-cream-dark/70"
                aria-expanded={isExpanded}
                aria-label={isExpanded ? t("collapse") : t("expand")}
            >
                <div className="flex items-center gap-2">
                    <Settings2 className="w-4 h-4 text-terminal-muted" />
                    <span className="font-mono text-sm text-terminal-dark">
                        {t("title")}
                    </span>
                </div>
                {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-terminal-muted" />
                ) : (
                    <ChevronRight className="w-4 h-4 text-terminal-muted" />
                )}
            </button>

            {/* Accordion Content */}
            {isExpanded && (
                <div className="p-4 space-y-6 border-t border-terminal-border/50 bg-terminal-cream/95 dark:bg-terminal-cream-dark/50">
                    {/* Description */}
                    <p className="font-mono text-xs text-terminal-muted">
                        {t("description")}
                    </p>

                    {/* Reset to Defaults Button */}
                    <div className="flex justify-end">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleResetToDefaults}
                            className="gap-2 font-mono text-xs"
                        >
                            <RotateCcw className="w-3 h-3" />
                            {t("resetToDefaults")}
                        </Button>
                    </div>

                    {/* Hybrid Search Section */}
                    <SettingsSection title={t("hybridSearch.title")} description={t("hybridSearch.description")}>
                        <label className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                checked={props.hybridEnabled}
                                onChange={(e) => props.onHybridEnabledChange(e.target.checked)}
                                className="size-4 accent-terminal-green"
                            />
                            <span className="font-mono text-sm text-terminal-dark">
                                {t("hybridSearch.enable")}
                            </span>
                        </label>
                        {props.hybridEnabled && (
                            <div className="mt-3 grid gap-4 md:grid-cols-3">
                                <NumberInput
                                    label={t("hybridSearch.denseWeight")}
                                    value={props.denseWeight}
                                    onChange={props.onDenseWeightChange}
                                    step={0.1}
                                />
                                <NumberInput
                                    label={t("hybridSearch.lexicalWeight")}
                                    value={props.lexicalWeight}
                                    onChange={props.onLexicalWeightChange}
                                    step={0.1}
                                />
                                <NumberInput
                                    label={t("hybridSearch.rrfK")}
                                    value={props.rrfK}
                                    onChange={props.onRrfKChange}
                                    min={1}
                                />
                            </div>
                        )}
                    </SettingsSection>

                    {/* Chunking Section */}
                    <SettingsSection title={t("chunking.title")} description={t("chunking.description")}>
                        <label className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                checked={props.tokenChunkingEnabled}
                                onChange={(e) => props.onTokenChunkingEnabledChange(e.target.checked)}
                                className="size-4 accent-terminal-green"
                            />
                            <span className="font-mono text-sm text-terminal-dark">
                                {t("chunking.enable")}
                            </span>
                        </label>
                        {props.tokenChunkingEnabled && (
                            <div className="mt-3 grid gap-4 md:grid-cols-2">
                                <NumberInput
                                    label={t("chunking.size")}
                                    value={props.chunkSize}
                                    onChange={props.onChunkSizeChange}
                                    min={1}
                                />
                                <NumberInput
                                    label={t("chunking.stride")}
                                    value={props.chunkStride}
                                    onChange={props.onChunkStrideChange}
                                    min={1}
                                />
                            </div>
                        )}
                    </SettingsSection>

                    {/* Reranking Section */}
                    <SettingsSection title={t("reranking.title")} description={t("reranking.description")}>
                        <label className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                checked={props.rerankingEnabled}
                                onChange={(e) => props.onRerankingEnabledChange(e.target.checked)}
                                className="size-4 accent-terminal-green"
                            />
                            <span className="font-mono text-sm text-terminal-dark">
                                {t("reranking.enable")}
                            </span>
                        </label>
                        {props.rerankingEnabled && (
                            <div className="mt-3 space-y-3">
                                <NumberInput
                                    label={t("reranking.topK")}
                                    value={props.rerankTopK}
                                    onChange={props.onRerankTopKChange}
                                    min={1}
                                />
                                <RerankerModelField
                                    modelId={props.rerankModel}
                                    onModelIdChange={props.onRerankModelChange}
                                    label={t("reranking.modelPath")}
                                />
                            </div>
                        )}
                    </SettingsSection>

                    {/* Query Processing Section */}
                    <SettingsSection title={t("queryProcessing.title")} description={t("queryProcessing.description")}>
                        <label className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                checked={props.queryExpansionEnabled}
                                onChange={(e) => props.onQueryExpansionEnabledChange(e.target.checked)}
                                className="size-4 accent-terminal-green"
                            />
                            <span className="font-mono text-sm text-terminal-dark">
                                {t("queryProcessing.enable")}
                            </span>
                        </label>
                    </SettingsSection>

                    {/* File Limits Section */}
                    <SettingsSection title={t("fileLimits.title")} description={t("fileLimits.description")}>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div>
                                <NumberInput
                                    label={t("fileLimits.maxLines")}
                                    value={props.maxFileLines}
                                    onChange={props.onMaxFileLinesChange}
                                    min={100}
                                />
                                <p className="mt-1 font-mono text-xs text-terminal-muted">
                                    {t("fileLimits.maxLinesHelper")}
                                </p>
                            </div>
                            <div>
                                <NumberInput
                                    label={t("fileLimits.maxLineLength")}
                                    value={props.maxLineLength}
                                    onChange={props.onMaxLineLengthChange}
                                    min={100}
                                />
                                <p className="mt-1 font-mono text-xs text-terminal-muted">
                                    {t("fileLimits.maxLineLengthHelper")}
                                </p>
                            </div>
                        </div>
                    </SettingsSection>
                </div>
            )}
        </div>
    );
}

function RerankerModelField({
    modelId,
    onModelIdChange,
    label,
}: {
    modelId: string;
    onModelIdChange: (value: string) => void;
    label: string;
}) {
    const [modelStatus, setModelStatus] = useState<Record<string, boolean>>({});
    const [downloading, setDownloading] = useState<string | null>(null);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [downloadError, setDownloadError] = useState<string | null>(null);

    const isElectronEnv = typeof window !== "undefined" && !!(window as unknown as {
        electronAPI?: unknown;
    }).electronAPI;

    useEffect(() => {
        if (!isElectronEnv) return;

        const checkStatus = async () => {
            const electronAPI = (window as unknown as {
                electronAPI?: { model?: { checkExists?: (id: string) => Promise<boolean> } };
            }).electronAPI;

            if (!electronAPI?.model?.checkExists) return;

            const status: Record<string, boolean> = {};
            for (const model of LOCAL_RERANK_MODELS) {
                try {
                    status[model.id] = await electronAPI.model.checkExists(model.id);
                } catch {
                    status[model.id] = false;
                }
            }

            const trimmedModelId = modelId.trim();
            if (trimmedModelId && !status.hasOwnProperty(trimmedModelId)) {
                try {
                    status[trimmedModelId] = await electronAPI.model.checkExists(trimmedModelId);
                } catch {
                    status[trimmedModelId] = false;
                }
            }

            setModelStatus(status);
        };

        checkStatus();
    }, [isElectronEnv, modelId]);

    const selectedPreset = LOCAL_RERANK_MODELS.find((m) => m.id === modelId);
    const selectedModelId = selectedPreset?.id || modelId.trim() || LOCAL_RERANK_MODELS[0].id;

    const handleDownload = async (targetModelId: string) => {
        if (!targetModelId) return;

        setDownloading(targetModelId);
        setDownloadProgress(0);
        setDownloadError(null);

        const electronAPI = (window as unknown as {
            electronAPI?: {
                model?: {
                    download?: (id: string) => Promise<{ success: boolean; error?: string }>;
                    onProgress?: (
                        cb: (data: { modelId: string; status: string; progress?: number; error?: string }) => void
                    ) => void;
                    removeProgressListener?: () => void;
                };
            };
        }).electronAPI;

        if (!electronAPI?.model?.download) {
            setDownloadError("Model download API not available. Please restart the app.");
            setDownloading(null);
            return;
        }

        if (electronAPI.model.onProgress) {
            electronAPI.model.onProgress((data) => {
                if (data.modelId === targetModelId) {
                    if (data.progress !== undefined) setDownloadProgress(data.progress);
                    if (data.status === "completed") {
                        setDownloading(null);
                        setModelStatus((prev) => ({ ...prev, [targetModelId]: true }));
                    }
                    if (data.status === "error") {
                        setDownloading(null);
                        setDownloadError(data.error || "Download failed");
                    }
                }
            });
        }

        try {
            const result = await electronAPI.model.download(targetModelId);
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

    return (
        <div className="space-y-3">
            <div>
                <label className="mb-1 block font-mono text-xs text-terminal-muted">{label}</label>
                <div className="flex gap-2">
                    <select
                        value={selectedPreset?.id ?? "__custom__"}
                        onChange={(e) => {
                            if (e.target.value === "__custom__") return;
                            onModelIdChange(e.target.value);
                        }}
                        className="flex-1 rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
                    >
                        {LOCAL_RERANK_MODELS.map((model) => (
                            <option key={model.id} value={model.id}>
                                {model.name} {modelStatus[model.id] ? "✓" : ""}
                            </option>
                        ))}
                        <option value="__custom__">Custom model ID</option>
                    </select>

                    {isElectronEnv && (
                        <Button
                            type="button"
                            onClick={() => handleDownload(selectedModelId)}
                            disabled={
                                !selectedModelId ||
                                downloading !== null ||
                                modelStatus[selectedModelId]
                            }
                            className="gap-2 bg-terminal-green text-white hover:bg-terminal-green/90 disabled:opacity-50"
                        >
                            {downloading === selectedModelId ? (
                                <>
                                    <Loader2Icon className="size-4 animate-spin" />
                                    {downloadProgress}%
                                </>
                            ) : modelStatus[selectedModelId] ? (
                                <>
                                    <CheckIcon className="size-4" />
                                    Ready
                                </>
                            ) : (
                                "Download"
                            )}
                        </Button>
                    )}
                </div>
            </div>

            <div>
                <label className="mb-1 block font-mono text-xs text-terminal-muted">
                    Custom model ID
                </label>
                <input
                    type="text"
                    value={modelId}
                    onChange={(e) => onModelIdChange(e.target.value)}
                    placeholder="cross-encoder/ms-marco-MiniLM-L-6-v2"
                    className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
                />
                <p className="mt-1 font-mono text-xs text-terminal-muted">
                    Pick a preset or enter any Hugging Face cross-encoder reranker model ID.
                </p>
            </div>

            {/* Model type validation warning */}
            {(() => {
                const validity = modelId.trim() ? isValidRerankerModel(modelId) : null;
                if (validity === false) {
                    return (
                        <div className="flex items-start gap-2 rounded border border-red-200 bg-red-50 p-2">
                            <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0 text-red-600" />
                            <p className="font-mono text-xs text-red-700">
                                <strong>Wrong model type:</strong> This appears to be an embedding model, not a cross-encoder reranker.
                                Rerankers score (query, text) pairs — they don&apos;t produce vectors.
                                Select a cross-encoder model like &quot;cross-encoder/ms-marco-MiniLM-L-6-v2&quot;.
                            </p>
                        </div>
                    );
                }
                if (validity === null && modelId.trim()) {
                    return (
                        <div className="flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-2">
                            <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                            <p className="font-mono text-xs text-amber-700">
                                <strong>Unrecognized model:</strong> Ensure this is a cross-encoder model (not an embedding model).
                                Cross-encoders output relevance scores, not vectors.
                            </p>
                        </div>
                    );
                }
                return null;
            })()}

            {downloadError && (
                <p className="font-mono text-xs text-red-600">{downloadError}</p>
            )}
        </div>
    );
}

function SettingsSection({
    title,
    description,
    children,
}: {
    title: string;
    description?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="space-y-3 p-3 rounded-lg bg-terminal-cream/50">
            <div>
                <h4 className="font-mono text-xs text-terminal-amber uppercase tracking-wide font-semibold">
                    {title}
                </h4>
                {description && (
                    <p className="mt-0.5 font-mono text-xs text-terminal-muted">{description}</p>
                )}
            </div>
            <div>{children}</div>
        </div>
    );
}

function NumberInput({
    label,
    value,
    onChange,
    min,
    max,
    step,
}: {
    label: string;
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
}) {
    return (
        <div>
            <label className="mb-1 block font-mono text-xs text-terminal-muted">
                {label}
            </label>
            <input
                type="number"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(Number(e.target.value) || 0)}
                className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
            />
        </div>
    );
}
