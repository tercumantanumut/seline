"use client";

import { useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Copy, Check } from "lucide-react";

interface PromptEditorProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    minLines?: number;
    maxHeight?: string;
}

export interface PromptEditorRef {
    insertAtCursor: (text: string) => void;
}

export const PromptEditor = forwardRef<PromptEditorRef, PromptEditorProps>(
    function PromptEditor({
        value,
        onChange,
        placeholder,
        minLines = 12,
        maxHeight = "350px",
    }, ref) {
        const t = useTranslations("schedules.newForm.editor");
        const textareaRef = useRef<HTMLTextAreaElement>(null);
        const lineNumbersRef = useRef<HTMLDivElement>(null);
        const [copied, setCopied] = useState(false);

        // Sync scroll between textarea and line numbers
        const handleScroll = useCallback(() => {
            if (textareaRef.current && lineNumbersRef.current) {
                lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
            }
        }, []);

        const lines = value.split("\n");
        const lineCount = Math.max(lines.length, minLines);

        const copyToClipboard = async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        };

        // Insert text at cursor position
        const insertAtCursor = useCallback((text: string) => {
            const textarea = textareaRef.current;
            if (!textarea) return;

            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const newValue = value.slice(0, start) + text + value.slice(end);

            onChange(newValue);

            // Restore cursor position after the inserted text
            requestAnimationFrame(() => {
                textarea.selectionStart = textarea.selectionEnd = start + text.length;
                textarea.focus();
            });
        }, [value, onChange]);

        // Expose insertAtCursor method via ref
        useImperativeHandle(ref, () => ({
            insertAtCursor,
        }), [insertAtCursor]);

        return (
            <div className="rounded-lg border border-terminal-border overflow-hidden bg-terminal-dark/5">
                {/* Toolbar */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-terminal-border bg-terminal-cream/50">
                    <span className="text-xs font-mono text-terminal-muted uppercase tracking-wider">
                        {t("prompt")}
                    </span>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={copyToClipboard}
                            className="p-1.5 rounded hover:bg-terminal-dark/10 text-terminal-muted transition-colors"
                            title={t("copy")}
                        >
                            {copied ? (
                                <Check className="w-4 h-4 text-green-500" />
                            ) : (
                                <Copy className="w-4 h-4" />
                            )}
                        </button>
                    </div>
                </div>

                {/* Editor Area */}
                <div className="flex overflow-hidden" style={{ maxHeight }}>
                    {/* Line Numbers */}
                    <div
                        ref={lineNumbersRef}
                        className="select-none overflow-hidden bg-terminal-dark/5 border-r border-terminal-border shrink-0"
                        style={{ minWidth: "3rem" }}
                    >
                        <div className="py-3 px-2 text-right">
                            {Array.from({ length: lineCount }, (_, i) => (
                                <div
                                    key={i}
                                    className="text-xs font-mono text-terminal-muted/50 leading-relaxed h-[1.625rem]"
                                >
                                    {i + 1}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Textarea */}
                    <textarea
                        ref={textareaRef}
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        onScroll={handleScroll}
                        placeholder={placeholder}
                        spellCheck={false}
                        className={cn(
                            "flex-1 p-3 bg-transparent resize-none outline-none overflow-y-auto",
                            "font-mono text-sm leading-relaxed",
                            "placeholder:text-terminal-muted/50",
                            "custom-scrollbar"
                        )}
                        style={{
                            minHeight: `${minLines * 1.625}rem`,
                            lineHeight: "1.625rem",
                        }}
                    />
                </div>

                {/* Status Bar */}
                <div className="flex items-center justify-between px-3 py-1.5 border-t border-terminal-border bg-terminal-cream/50 text-xs font-mono text-terminal-muted">
                    <span>{t("markdown")}</span>
                    <div className="flex items-center gap-4">
                        <span>{lines.length} {t("lines")}</span>
                        <span className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                            {t("validSyntax")}
                        </span>
                    </div>
                </div>
            </div>
        );
    }
);
