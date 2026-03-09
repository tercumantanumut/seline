/**
 * MCP Template Environment Dialog
 *
 * Shown when a user clicks a template that requires env vars.
 * Collects all required values inline before installing the server,
 * so users never see empty vars dumped at the bottom of the page.
 */

"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Key, ExternalLink, Check, Circle, Loader2 } from "lucide-react";
import type { MCPTemplate } from "@/components/settings/mcp-settings-constants";

interface MCPTemplateEnvDialogProps {
    template: MCPTemplate | null;
    existingEnv: Record<string, string>;
    onInstall: (template: MCPTemplate, envValues: Record<string, string>) => Promise<void>;
    onCancel: () => void;
}

/** Human-friendly labels for well-known env var names */
const ENV_KEY_LABELS: Record<string, string> = {
    CODA_API_KEY: "Coda API Key",
    GITHUB_PERSONAL_ACCESS_TOKEN: "GitHub Personal Access Token",
    COMPOSIO_API_KEY: "Composio API Key",
    COMPOSIO_CONNECTION_ID: "Composio Connection ID",
    SUPABASE_PROJECT_REF: "Supabase Project Ref",
    SUPABASE_ACCESS_TOKEN: "Supabase Access Token",
};

/** Well-known placeholder hints */
const ENV_KEY_PLACEHOLDERS: Record<string, string> = {
    CODA_API_KEY: "e.g. a1b2c3d4-e5f6-...",
    GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_...",
    COMPOSIO_API_KEY: "Your Composio API key",
    COMPOSIO_CONNECTION_ID: "Connection ID from Composio dashboard",
    SUPABASE_PROJECT_REF: "e.g. abcdefghijklmnop",
    SUPABASE_ACCESS_TOKEN: "sbp_...",
};

/** Links where users can get their credentials */
const ENV_KEY_HELP_URLS: Record<string, string> = {
    CODA_API_KEY: "https://coda.io/account",
    GITHUB_PERSONAL_ACCESS_TOKEN: "https://github.com/settings/tokens",
    COMPOSIO_API_KEY: "https://app.composio.dev/settings",
    SUPABASE_ACCESS_TOKEN: "https://supabase.com/dashboard/account/tokens",
};

/** Check if a value is a masked placeholder (contains bullet chars from the API) */
function isMaskedValue(value: string): boolean {
    return value.includes("\u2022");
}

export function MCPTemplateEnvDialog({
    template,
    existingEnv,
    onInstall,
    onCancel,
}: MCPTemplateEnvDialogProps) {
    const t = useTranslations("settings.mcp");
    const [envValues, setEnvValues] = useState<Record<string, string>>({});
    const [isInstalling, setIsInstalling] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Track which keys already have a stored (masked) value
    const [hasExistingKey, setHasExistingKey] = useState<Record<string, boolean>>({});

    // Ref to capture the existing env at dialog open time (avoids re-seed on parent re-render)
    const capturedEnvRef = useRef<Record<string, string>>({});

    // Seed form when template changes (dialog opens/closes)
    useEffect(() => {
        if (!template) {
            // Dialog closing -- reset all state
            setIsInstalling(false);
            setError(null);
            return;
        }

        // Capture existing env at open time
        capturedEnvRef.current = existingEnv;

        const seeded: Record<string, string> = {};
        const existing: Record<string, boolean> = {};
        for (const key of template.requiredEnv) {
            const val = existingEnv[key] || "";
            if (isMaskedValue(val)) {
                // Don't seed masked values -- they can't be submitted
                seeded[key] = "";
                existing[key] = true;
            } else {
                seeded[key] = val;
                existing[key] = false;
            }
        }
        setEnvValues(seeded);
        setHasExistingKey(existing);
    }, [template]); // intentionally only depend on template, not existingEnv

    const allFilled = template
        ? template.requiredEnv.every(
            (key) => envValues[key]?.trim() || hasExistingKey[key]
        )
        : false;

    const handleInstall = async () => {
        if (!template) return;

        // Recompute readiness inside handler to avoid stale closure
        const ready = template.requiredEnv.every(
            (key) => envValues[key]?.trim() || hasExistingKey[key]
        );
        if (!ready) return;

        setIsInstalling(true);
        setError(null);

        // Trim whitespace from pasted values
        const trimmed: Record<string, string> = {};
        for (const [key, val] of Object.entries(envValues)) {
            const v = val.trim();
            if (v) trimmed[key] = v;
        }

        try {
            await onInstall(template, trimmed);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Installation failed. Check your credentials and try again."
            );
        } finally {
            setIsInstalling(false);
        }
    };

    if (!template) return null;

    return (
        <Dialog
            open={!!template}
            onOpenChange={(open) => {
                // Block close during install
                if (!open && !isInstalling) onCancel();
            }}
        >
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="font-mono flex items-center gap-2">
                        <Key className="h-4 w-4 text-terminal-green" />
                        {t("envDialog.title", { name: template.name })}
                    </DialogTitle>
                    <DialogDescription>
                        {t("envDialog.description")}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Setup instructions if present */}
                    {template.setupInstructions && (
                        <div className="text-xs text-terminal-muted bg-terminal-cream/60 dark:bg-terminal-cream-dark/30 border border-terminal-border rounded-md p-3">
                            <span className="font-semibold">{t("envDialog.setupHint")}</span>{" "}
                            {t(`templates.${template.id}.setup`)}
                        </div>
                    )}

                    {/* Env var inputs */}
                    <div className="space-y-3">
                        {template.requiredEnv.length > 1 && (
                            <Label className="text-xs font-semibold text-terminal-muted uppercase tracking-wide">
                                {t("envDialog.envLabel")}
                            </Label>
                        )}

                        {template.requiredEnv.map((key) => {
                            const label = ENV_KEY_LABELS[key] || key;
                            const placeholder =
                                ENV_KEY_PLACEHOLDERS[key] ||
                                t("envDialog.placeholder", { key: label });
                            const helpUrl = ENV_KEY_HELP_URLS[key];
                            const filled = !!envValues[key]?.trim() || hasExistingKey[key];

                            return (
                                <div key={key} className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <Label
                                            htmlFor={`env-${key}`}
                                            className="text-xs font-mono flex items-center gap-1.5"
                                        >
                                            {filled ? (
                                                <Check className="h-3 w-3 text-terminal-green" />
                                            ) : (
                                                <Circle className="h-3 w-3 text-terminal-muted" />
                                            )}
                                            {label}
                                            {hasExistingKey[key] && !envValues[key]?.trim() && (
                                                <span className="text-[10px] text-terminal-green ml-1">
                                                    ({t("envDialog.alreadyConfigured")})
                                                </span>
                                            )}
                                        </Label>
                                        {helpUrl && (
                                            <a
                                                href={helpUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                aria-label={`${t("envDialog.getKey")} ${label}`}
                                                className="text-[10px] text-terminal-green hover:underline flex items-center gap-1"
                                            >
                                                {t("envDialog.getKey")}
                                                <ExternalLink className="h-3 w-3" />
                                            </a>
                                        )}
                                    </div>
                                    <Input
                                        id={`env-${key}`}
                                        type="password"
                                        value={envValues[key] || ""}
                                        onChange={(e) =>
                                            setEnvValues((prev) => ({
                                                ...prev,
                                                [key]: e.target.value,
                                            }))
                                        }
                                        placeholder={
                                            hasExistingKey[key]
                                                ? t("envDialog.existingPlaceholder")
                                                : placeholder
                                        }
                                        className="font-mono text-xs"
                                        autoFocus={
                                            key === template.requiredEnv[0]
                                        }
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && allFilled && !isInstalling) {
                                                handleInstall();
                                            }
                                        }}
                                    />
                                </div>
                            );
                        })}
                    </div>

                    {/* Error feedback */}
                    {error && (
                        <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-md p-2.5">
                            {error}
                        </div>
                    )}

                    {/* Status hint */}
                    <p className="text-xs text-terminal-muted text-center">
                        {allFilled
                            ? t("envDialog.allFilled")
                            : t("envDialog.missingValues")}
                    </p>
                </div>

                {/* Actions */}
                <DialogFooter className="pt-2 border-t border-terminal-border">
                    <Button variant="ghost" onClick={onCancel} disabled={isInstalling}>
                        {t("envDialog.cancel")}
                    </Button>
                    <Button
                        onClick={handleInstall}
                        disabled={!allFilled || isInstalling}
                    >
                        {isInstalling && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        {isInstalling ? t("saving") : t("envDialog.install")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
