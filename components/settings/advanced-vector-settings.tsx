"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Settings2, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

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
    vectorSearchRerankModel: "models/ms-marco-MiniLM-L-6-v2.onnx",
    vectorSearchMaxFileLines: 3000,
    vectorSearchMaxLineLength: 1000,
};

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
                className="w-full flex items-center justify-between p-4 bg-terminal-bg/20 hover:bg-terminal-bg/30 transition-colors"
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
                <div className="p-4 space-y-6 border-t border-terminal-border/50 bg-white">
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
                                <div>
                                    <label className="mb-1 block font-mono text-xs text-terminal-muted">
                                        {t("reranking.modelPath")}
                                    </label>
                                    <input
                                        type="text"
                                        value={props.rerankModel}
                                        onChange={(e) => props.onRerankModelChange(e.target.value)}
                                        className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
                                    />
                                </div>
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
                className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
            />
        </div>
    );
}
