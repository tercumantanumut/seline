"use client";

import { FC, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Calculator, Copy, Check, AlertCircle, Hash, Pi, Sigma, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";

/** Result type from calculator tool */
interface CalculatorResult {
    success: boolean;
    expression: string;
    result?: string | number;
    type?: string;
    error?: string;
    details?: string;
}

/** Input args type */
interface CalculatorArgs {
    expression: string;
    precision?: number;
}

type ToolCallContentPartComponent = FC<{
    toolName: string;
    argsText?: string;
    args: CalculatorArgs;
    result?: CalculatorResult;
}>;

/** Get icon for result type */
function getTypeIcon(type?: string) {
    switch (type) {
        case "number":
            return <Hash className="w-3.5 h-3.5" />;
        case "complex":
            return <span className="text-xs font-bold">i</span>;
        case "matrix":
            return <Sigma className="w-3.5 h-3.5" />;
        case "unit":
            return <span className="text-xs font-bold">u</span>;
        case "constant":
            return <Pi className="w-3.5 h-3.5" />;
        default:
            return <Calculator className="w-3.5 h-3.5" />;
    }
}

/** Format result for display */
function formatResult(result: string | number | undefined, type?: string): string {
    if (result === undefined) return "";
    const str = String(result);

    // For long results, show truncated version
    if (str.length > 100) {
        return str.substring(0, 97) + "...";
    }
    return str;
}

export const CalculatorToolUI: ToolCallContentPartComponent = ({
    args,
    result,
}) => {
    const t = useTranslations("assistantUi.calculator");
    const [copied, setCopied] = useState(false);
    const [expanded, setExpanded] = useState(false);

    // Guard against missing args
    if (!args) return null;

    const expression = args.expression;
    const resultValue = result?.result;
    const isSuccess = result?.success;
    const error = result?.error;
    const resultType = result?.type;
    const details = result?.details;

    // Determine if result is long and needs expansion
    const fullResult = String(resultValue ?? "");
    const isLongResult = fullResult.length > 50;
    const displayResult = expanded ? fullResult : formatResult(resultValue, resultType);

    const handleCopy = async () => {
        if (resultValue !== undefined) {
            await navigator.clipboard.writeText(String(resultValue));
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    // Loading state
    if (!result) {
        return (
            <div className="my-2 rounded-lg border border-terminal-border/60 bg-terminal-cream/70 overflow-hidden">
                <div className="flex items-center gap-3 p-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-terminal-amber/10 text-terminal-amber">
                        <Calculator className="w-4 h-4 animate-pulse" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-terminal-muted uppercase tracking-wider">{t("calculating")}</span>
                        </div>
                        <code className="block mt-1 font-mono text-sm text-terminal-dark truncate">
                            {expression}
                        </code>
                    </div>
                    <div className="w-5 h-5 rounded-full border-2 border-terminal-amber/30 border-t-terminal-amber animate-spin" />
                </div>
            </div>
        );
    }

    // Error state
    if (!isSuccess) {
        return (
            <div className="my-2 rounded-lg border border-red-200/70 bg-terminal-cream/70 overflow-hidden">
                <div className="flex items-start gap-3 p-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-red-100 text-red-600 flex-shrink-0">
                        <AlertCircle className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-red-600 uppercase tracking-wider">{t("calcError")}</span>
                        </div>
                        <code className="block mt-1 font-mono text-sm text-terminal-dark">
                            {expression}
                        </code>
                        <p className="mt-2 text-sm text-red-600/90">{error}</p>
                    </div>
                </div>
            </div>
        );
    }

    // Success state
    return (
        <div className="my-2 rounded-lg border border-terminal-border/60 bg-terminal-cream/70 overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 px-3 py-2 border-b border-terminal-border/40 bg-terminal-cream/90">
                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-terminal-bg/40 text-terminal-dark">
                    {getTypeIcon(resultType)}
                </div>
                <code className="flex-1 font-mono text-sm text-terminal-dark truncate">
                    {expression}
                </code>
                {resultType && (
                    <span className="px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider rounded-full bg-terminal-dark/5 text-terminal-muted">
                        {resultType}
                    </span>
                )}
            </div>

            {/* Result */}
            <div className="p-3">
                <div className="flex items-start gap-3">
                    <span className="text-terminal-muted font-mono text-lg">=</span>
                    <div className="flex-1 min-w-0">
                        <code className={cn(
                            "font-mono text-lg font-medium text-terminal-dark break-all",
                            isLongResult && !expanded && "line-clamp-2"
                        )}>
                            {displayResult}
                        </code>
                        {isLongResult && (
                            <button
                                onClick={() => setExpanded(!expanded)}
                                className="mt-1 flex items-center gap-1 text-xs text-terminal-muted hover:text-terminal-dark transition-colors"
                            >
                                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                {expanded ? t("showLess") : t("showMore")}
                            </button>
                        )}
                    </div>
                    <button
                        onClick={handleCopy}
                        className={cn(
                            "flex items-center justify-center w-7 h-7 rounded-md transition-all flex-shrink-0",
                            copied
                                ? "bg-terminal-green/20 text-terminal-green"
                                : "hover:bg-terminal-dark/5 text-terminal-muted hover:text-terminal-dark"
                        )}
                        title={t("copyResult")}
                        aria-label={t("copyResult")}
                    >
                        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                </div>

                {/* Details (for matrix/complex results) */}
                {details && (
                    <div className="mt-3 p-2 rounded bg-terminal-dark/5 font-mono text-xs text-terminal-muted whitespace-pre-wrap">
                        {details}
                    </div>
                )}
            </div>
        </div>
    );
};
