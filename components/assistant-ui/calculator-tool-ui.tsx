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
    info?: string;
}

/** Input args type */
interface CalculatorArgs {
    expression: string;
    precision?: number;
}

function parseNestedJson(text: string, maxDepth: number = 3): unknown | undefined {
    let current: unknown = text;
    for (let i = 0; i < maxDepth; i += 1) {
        if (typeof current !== "string") return current;
        const trimmed = current.trim();
        if (!trimmed) return undefined;
        try {
            current = JSON.parse(trimmed);
        } catch {
            return i === 0 ? undefined : current;
        }
    }
    return current;
}

function normalizeCalculatorResult(
    rawResult: CalculatorResult | Record<string, unknown> | string | undefined,
): CalculatorResult | undefined {
    if (!rawResult) return undefined;

    if (typeof rawResult === "string") {
        const parsed = parseNestedJson(rawResult);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return normalizeCalculatorResult(parsed as Record<string, unknown>);
        }
        return {
            success: true,
            expression: "",
            info: String(parsed ?? rawResult),
        };
    }

    if (typeof rawResult !== "object") return undefined;

    const direct = rawResult as Partial<CalculatorResult> & Record<string, unknown>;

    if (direct.result && typeof direct.result === "object" && !Array.isArray(direct.result)) {
        const nested = normalizeCalculatorResult(direct.result as Record<string, unknown>);
        if (nested) return nested;
    }
    if (direct.output && typeof direct.output === "object" && !Array.isArray(direct.output)) {
        const nested = normalizeCalculatorResult(direct.output as Record<string, unknown>);
        if (nested) return nested;
    }

    if (typeof direct.success === "boolean") {
        return {
            success: direct.success,
            expression: String(direct.expression ?? ""),
            ...(direct.result !== undefined ? { result: direct.result as string | number } : {}),
            ...(typeof direct.type === "string" ? { type: direct.type } : {}),
            ...(typeof direct.error === "string" ? { error: direct.error } : {}),
            ...(typeof direct.details === "string" ? { details: direct.details } : {}),
        };
    }

    const status = typeof direct.status === "string" ? direct.status : undefined;
    const summary = typeof direct.summary === "string" ? direct.summary : undefined;
    const message = typeof direct.message === "string" ? direct.message : undefined;

    if (direct._sdkPassthrough === true) {
        return {
            success: true,
            expression: String(direct.expression ?? ""),
            info: summary || message || "Tool executed via SDK passthrough. Structured output was not captured.",
        };
    }

    const directContent = typeof direct.content === "string" ? direct.content : undefined;
    if (directContent && directContent.trim().length > 0) {
        const parsed = parseNestedJson(directContent);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return normalizeCalculatorResult(parsed as Record<string, unknown>);
        }
        if (status === "error") {
            return {
                success: false,
                expression: String(direct.expression ?? ""),
                error: String(parsed ?? directContent),
            };
        }
        if (status === "success") {
            return {
                success: true,
                expression: String(direct.expression ?? ""),
                info: String(parsed ?? directContent),
                ...(typeof direct.type === "string" ? { type: direct.type } : {}),
                ...(typeof direct.details === "string" ? { details: direct.details } : {}),
            };
        }
    }

    const content = Array.isArray(direct.content) ? direct.content : undefined;
    if (content && content.length > 0) {
        const textItem = content.find(
            (item): item is { type?: string; text?: string } =>
                !!item &&
                typeof item === "object" &&
                (item as { type?: unknown }).type === "text" &&
                typeof (item as { text?: unknown }).text === "string",
        );

        if (textItem?.text) {
            const parsed = parseNestedJson(textItem.text);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                return normalizeCalculatorResult(parsed as Record<string, unknown>);
            }

            if (status === "error") {
                return {
                    success: false,
                    expression: String(direct.expression ?? ""),
                    error: String(parsed ?? textItem.text),
                };
            }
            if (status === "success") {
                return {
                    success: true,
                    expression: String(direct.expression ?? ""),
                    info: String(parsed ?? textItem.text),
                    ...(typeof direct.type === "string" ? { type: direct.type } : {}),
                    ...(typeof direct.details === "string" ? { details: direct.details } : {}),
                };
            }
        }
    }

    if (status === "error") {
        return {
            success: false,
            expression: String(direct.expression ?? ""),
            error: typeof direct.error === "string" ? direct.error : "Calculation failed",
        };
    }

    if (status === "success" && direct.result !== undefined) {
        return {
            success: true,
            expression: String(direct.expression ?? ""),
            result: direct.result as string | number,
            ...(typeof direct.type === "string" ? { type: direct.type } : {}),
            ...(typeof direct.details === "string" ? { details: direct.details } : {}),
        };
    }

    if (status === "success") {
        return {
            success: true,
            expression: String(direct.expression ?? ""),
            info: summary || message || "Calculation completed.",
        };
    }

    return undefined;
}

type ToolCallContentPartComponent = FC<{
    toolName: string;
    argsText?: string;
    args: CalculatorArgs;
    result?: CalculatorResult | Record<string, unknown>;
    output?: CalculatorResult | Record<string, unknown> | string;
    state?: "input-streaming" | "input-available" | "output-available" | "output-error" | "output-denied";
    errorText?: string;
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
    output,
    state,
    errorText,
}) => {
    const t = useTranslations("assistantUi.calculator");
    const [copied, setCopied] = useState(false);
    const [expanded, setExpanded] = useState(false);

    // Guard against missing args
    if (!args) return null;

    const resolvedResult = result ?? output;
    const normalizedResult = normalizeCalculatorResult(resolvedResult);

    const expression = args.expression;
    const resultValue = normalizedResult?.result;
    const isOutputError = state === "output-error" || state === "output-denied";
    const hasSuccessfulPayload = Boolean(
        normalizedResult?.success ||
        normalizedResult?.result !== undefined ||
        (typeof normalizedResult?.info === "string" && normalizedResult.info.trim().length > 0),
    );
    const error = hasSuccessfulPayload ? normalizedResult?.error : (errorText || normalizedResult?.error);
    const resultType = normalizedResult?.type;
    const details = normalizedResult?.details;
    const info = normalizedResult?.info;

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
    const isInputState = state === "input-streaming" || state === "input-available";
    if (!resolvedResult && isInputState) {
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

    const hasResultValue = resultValue !== undefined && resultValue !== null && String(resultValue).length > 0;

    // Error state
    if (!hasSuccessfulPayload && isOutputError) {
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
                        <p className="mt-2 text-sm text-red-600/90">{error || "Calculation failed"}</p>
                    </div>
                </div>
            </div>
        );
    }

    if (!hasResultValue) {
        const infoLabel = isInputState ? t("calculating") : "completed";
        const infoText = info || details || (isInputState
            ? t("calculating")
            : "Result returned without numeric calculator output.");
        return (
            <div className="my-2 rounded-lg border border-terminal-border/60 bg-terminal-cream/70 overflow-hidden">
                <div className="flex items-start gap-3 p-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-terminal-bg/40 text-terminal-dark flex-shrink-0">
                        <Calculator className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-terminal-muted uppercase tracking-wider">{infoLabel}</span>
                        </div>
                        <code className="block mt-1 font-mono text-sm text-terminal-dark">
                            {expression}
                        </code>
                        <p className="mt-2 text-sm text-terminal-muted">
                            {infoText}
                        </p>
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
