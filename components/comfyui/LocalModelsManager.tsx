"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import {
    Loader2, Check, X,
    Play, StopCircle, RefreshCw,
    Cpu, Rocket, FolderOpen, ChevronDown, ChevronUp,
    Download, HardDrive
} from "lucide-react";
import { useTranslations } from "next-intl";

// ============================================================================
// Types and Interfaces
// ============================================================================

interface ModelStatus {
    dockerInstalled: boolean;
    imageBuilt: boolean;
    containerRunning: boolean;
    apiHealthy: boolean;
    modelsDownloaded: boolean;
    checkpointExists?: boolean;
    loraExists?: boolean;
}

interface InstallProgress {
    stage: string;
    progress: number;
    message: string;
    error?: string;
}

interface ModelElectronAPI {
    checkStatus: (path?: string) => Promise<ModelStatus>;
    start: (path?: string) => Promise<{ success: boolean; error?: string }>;
    stop: (path?: string) => Promise<{ success: boolean; error?: string }>;
    getDefaultPath: () => Promise<{ success: boolean; path?: string; error?: string }>;
    fullSetup: () => Promise<{ success: boolean; backendPath?: string; error?: string }>;
    onInstallProgress: (callback: (data: InstallProgress) => void) => void;
    removeProgressListener: () => void;
}

export interface LocalModelConfig {
    id: string;
    name: string;
    description: string;
    requirements: string;
    modelSize: string;
    vramRequired: string;
    apiKey: "comfyui" | "flux2Klein4b" | "flux2Klein9b";
    setupSteps: string[];
}

export interface LocalModelState {
    enabled: boolean;
    backendPath: string;
}

export interface LocalModelsManagerProps {
    // Z-Image (ComfyUI) state
    zImageEnabled: boolean;
    zImageBackendPath: string;
    onZImageEnabledChange: (enabled: boolean) => void;
    onZImageBackendPathChange: (path: string) => void;
    // FLUX.2 Klein 4B state
    flux4bEnabled: boolean;
    flux4bBackendPath: string;
    onFlux4bEnabledChange: (enabled: boolean) => void;
    onFlux4bBackendPathChange: (path: string) => void;
    // FLUX.2 Klein 9B state
    flux9bEnabled: boolean;
    flux9bBackendPath: string;
    onFlux9bEnabledChange: (enabled: boolean) => void;
    onFlux9bBackendPathChange: (path: string) => void;
}

// Model configurations
const LOCAL_MODELS: LocalModelConfig[] = [
    {
        id: "z-image",
        name: "Z-Image Turbo FP8",
        description: "Z-Image Turbo FP8 (6B params): fast photorealistic generation with strong instruction following.",
        requirements: "Docker Desktop + NVIDIA GPU",
        modelSize: "~12GB download",
        vramRequired: "~12GB VRAM",
        apiKey: "comfyui",
        setupSteps: [
            "Build Docker images (~10-20 min first time)",
            "Download z-image-turbo-fp8-aio.safetensors (~11GB)",
            "Download z-image-detailer.safetensors (~1.2GB)",
            "Start ComfyUI containers",
        ],
    },
    {
        id: "flux-klein-4b",
        name: "FLUX.2 Klein 4B",
        description: "Compact FLUX model with 4B parameters. Good balance of quality and speed.",
        requirements: "Docker Desktop + NVIDIA GPU",
        modelSize: "~8GB download",
        vramRequired: "~10GB VRAM",
        apiKey: "flux2Klein4b",
        setupSteps: [
            "Build Docker images (~10-15 min first time)",
            "Download FLUX.2 Klein 4B checkpoint (~8GB)",
            "Start FLUX containers",
        ],
    },
    {
        id: "flux-klein-9b",
        name: "FLUX.2 Klein 9B",
        description: "Full FLUX.2 Klein model with 9B parameters. Best quality but requires more VRAM.",
        requirements: "Docker Desktop + NVIDIA GPU",
        modelSize: "~17GB download",
        vramRequired: "~20GB VRAM",
        apiKey: "flux2Klein9b",
        setupSteps: [
            "Build Docker images (~10-15 min first time)",
            "Download FLUX.2 Klein 9B checkpoint (~17GB)",
            "Start FLUX containers",
        ],
    },
];

// ============================================================================
// Model Card Component
// ============================================================================

interface ModelCardProps {
    config: LocalModelConfig;
    enabled: boolean;
    backendPath: string;
    onEnabledChange: (enabled: boolean) => void;
    onBackendPathChange: (path: string) => void;
    isElectron: boolean;
}

function ModelCard({
    config,
    enabled,
    backendPath,
    onEnabledChange,
    onBackendPathChange,
    isElectron,
}: ModelCardProps) {
    const t = useTranslations("comfyui.localModels");
    const [status, setStatus] = useState<ModelStatus | null>(null);
    const [loading, setLoading] = useState(false);
    const [checking, setChecking] = useState(true); // Track initial status check
    const [progress, setProgress] = useState<InstallProgress | null>(null);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [apiAvailable, setApiAvailable] = useState<boolean | null>(null);
    const [expanded, setExpanded] = useState(false);

    // Get the electron API for this model
    const getElectronAPI = useCallback((): ModelElectronAPI | null => {
        if (typeof window !== "undefined" && "electronAPI" in window) {
            const electronAPI = (window as { electronAPI?: Record<string, ModelElectronAPI> }).electronAPI;
            return electronAPI?.[config.apiKey] || null;
        }
        return null;
    }, [config.apiKey]);

    // Check status on mount
    const checkStatus = useCallback(async () => {
        const api = getElectronAPI();
        setChecking(true);

        if (!api) {
            setApiAvailable(false);
            setChecking(false);
            // Set default status for UI display when API not available
            setStatus({
                dockerInstalled: false,
                imageBuilt: false,
                containerRunning: false,
                apiHealthy: false,
                modelsDownloaded: false,
            });
            return;
        }

        setApiAvailable(true);

        try {
            const newStatus = await api.checkStatus(backendPath || undefined);
            setStatus(newStatus);
        } catch (error) {
            console.error(`Failed to check ${config.name} status:`, error);
            // Set error state but still show UI
            setStatus({
                dockerInstalled: false,
                imageBuilt: false,
                containerRunning: false,
                apiHealthy: false,
                modelsDownloaded: false,
            });
        } finally {
            setChecking(false);
        }
    }, [getElectronAPI, backendPath, config.name]);

    // Get default path on mount
    useEffect(() => {
        const api = getElectronAPI();
        if (api && isElectron && !backendPath && typeof api.getDefaultPath === 'function') {
            api.getDefaultPath().then((result) => {
                if (result.success && result.path) {
                    onBackendPathChange(result.path);
                }
            }).catch((err) => {
                console.error("Failed to get default path:", err);
            });
        }
    }, [getElectronAPI, isElectron, backendPath, onBackendPathChange]);

    useEffect(() => {
        if (isElectron) {
            checkStatus();
        } else {
            setChecking(false);
        }
    }, [isElectron, checkStatus]);

    // Listen for progress updates
    useEffect(() => {
        const api = getElectronAPI();
        if (!api) return;

        api.onInstallProgress((data: InstallProgress) => {
            setProgress(data);
            if (data.stage === "complete" || data.stage === "error") {
                setLoading(false);
                checkStatus();
            }
        });

        return () => {
            api.removeProgressListener();
        };
    }, [getElectronAPI, checkStatus]);

    // Handlers
    async function handleFullSetup() {
        const api = getElectronAPI();
        if (!api) return;

        setLoading(true);
        setProgress({ stage: "checking", progress: 0, message: `Starting ${config.name} setup...` });

        try {
            const result = await api.fullSetup();
            if (result.success && result.backendPath) {
                onBackendPathChange(result.backendPath);
            }
        } catch (error) {
            setProgress({
                stage: "error",
                progress: 0,
                message: "Setup failed",
                error: error instanceof Error ? error.message : "Unknown error"
            });
            setLoading(false);
        }
    }

    async function handleStart() {
        const api = getElectronAPI();
        if (!api) return;

        setLoading(true);
        setProgress({ stage: "starting", progress: 50, message: `Starting ${config.name}...` });
        try {
            const result = await api.start(backendPath || undefined);
            if (!result.success) {
                throw new Error(result.error || "Failed to start");
            }
            await checkStatus();
            setProgress(null);
        } catch (error) {
            setProgress({
                stage: "error",
                progress: 0,
                message: "Start failed",
                error: error instanceof Error ? error.message : "Unknown error"
            });
        } finally {
            setLoading(false);
        }
    }

    async function handleStop() {
        const api = getElectronAPI();
        if (!api) return;

        setLoading(true);
        setProgress(null);
        try {
            const result = await api.stop(backendPath || undefined);
            if (!result.success) {
                throw new Error(result.error || "Failed to stop container");
            }
            await checkStatus();
        } catch (error) {
            setProgress({
                stage: "error",
                progress: 0,
                message: "Stop failed",
                error: error instanceof Error ? error.message : "Unknown error"
            });
            await checkStatus();
        } finally {
            setLoading(false);
        }
    }

    const isSetupComplete = status?.imageBuilt && status?.modelsDownloaded;
    const needsSetup = status && (!status.imageBuilt || !status.modelsDownloaded);
    const statusBadge = (() => {
        if (checking) return { label: t("statusChecking"), tone: "muted" as const };
        if (!status) return { label: t("statusUnknown"), tone: "muted" as const };
        if (!status.dockerInstalled) return { label: t("statusDockerMissing"), tone: "danger" as const };
        if (!status.imageBuilt || !status.modelsDownloaded) return { label: t("statusSetupNeeded"), tone: "warning" as const };
        if (!status.containerRunning) return { label: t("statusStopped"), tone: "muted" as const };
        if (!status.apiHealthy) return { label: t("statusApiDown"), tone: "warning" as const };
        return { label: t("statusReady"), tone: "success" as const };
    })();

    // Status indicator component
    function StatusIndicator({ ok, label }: { ok: boolean; label: string }) {
        return (
            <div className="flex items-center gap-2 text-xs">
                {ok ? (
                    <Check className="h-4 w-4 text-terminal-green" />
                ) : (
                    <X className="h-4 w-4 text-red-500" />
                )}
                <span className={ok ? "text-terminal-text" : "text-terminal-muted"}>
                    {label}
                </span>
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-terminal-border bg-terminal-bg/60">
            <button
                type="button"
                onClick={() => setExpanded((prev) => !prev)}
                className="flex w-full flex-wrap items-center gap-4 p-4 text-left"
                aria-expanded={expanded}
            >
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-terminal-border bg-terminal-bg/70">
                        <HardDrive className="h-4 w-4 text-terminal-green" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-terminal-text">{config.name}</p>
                        <p className="text-xs text-terminal-muted">{config.description}</p>
                    </div>
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-5 text-xs text-terminal-muted">
                    <div className="flex flex-col">
                        <span>{t("vramLabel")}</span>
                        <span className="text-terminal-text">{config.vramRequired}</span>
                    </div>
                    <div className="flex flex-col">
                        <span>{t("diskLabel")}</span>
                        <span className="text-terminal-text">{config.modelSize}</span>
                    </div>
                    <div
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] uppercase tracking-wide ${
                            statusBadge.tone === "success"
                                ? "border-terminal-green/40 text-terminal-green"
                                : statusBadge.tone === "warning"
                                ? "border-terminal-green/40 text-terminal-green"
                                : statusBadge.tone === "danger"
                                ? "border-red-500/40 text-red-400"
                                : "border-terminal-border text-terminal-muted"
                        }`}
                    >
                        <span
                            className={`h-2 w-2 rounded-full ${
                                statusBadge.tone === "success"
                                    ? "bg-terminal-green"
                                    : statusBadge.tone === "warning"
                                    ? "bg-terminal-green"
                                    : statusBadge.tone === "danger"
                                    ? "bg-red-500"
                                    : "bg-terminal-muted"
                            }`}
                        />
                        {statusBadge.label}
                    </div>
                    {expanded ? <ChevronUp className="h-4 w-4 text-terminal-muted" /> : <ChevronDown className="h-4 w-4 text-terminal-muted" />}
                </div>
            </button>

            {expanded && (
                <div className="border-t border-terminal-border/60 p-4 space-y-4">
                {/* Loading State */}
                {checking && (
                    <div className="flex items-center justify-center p-4">
                        <Loader2 className="h-5 w-5 animate-spin mr-2" />
                        <span className="text-sm text-terminal-muted">{t("checkingStatus")}</span>
                    </div>
                )}

                {/* Status Display - always show after checking */}
                {!checking && status && (
                    <div className="grid grid-cols-2 gap-2 rounded-lg border border-terminal-border/60 bg-terminal-bg/40 p-3 text-sm">
                        <StatusIndicator ok={status.dockerInstalled} label={t("dockerLabel")} />
                        <StatusIndicator ok={status.imageBuilt} label={t("imageBuiltLabel")} />
                        <StatusIndicator ok={status.modelsDownloaded} label={t("modelsLabel")} />
                        <StatusIndicator ok={status.containerRunning} label={t("runningLabel")} />
                        <StatusIndicator ok={status.apiHealthy} label={t("apiReadyLabel")} />
                        <Button variant="ghost" size="sm" onClick={checkStatus} disabled={loading || checking} className="h-6 px-2">
                            <RefreshCw className={`h-3 w-3 ${loading || checking ? "animate-spin" : ""}`} />
                        </Button>
                    </div>
                )}

                {/* API Not Available Warning */}
                {!checking && apiAvailable === false && (
                    <Alert>
                        <AlertDescription className="text-sm">
                            {t("ipcNotImplemented", { apiKey: config.apiKey })}
                        </AlertDescription>
                    </Alert>
                )}

                {/* Progress Bar */}
                {progress && loading && (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                            <span className="capitalize">{progress.stage.replace(/-/g, " ")}</span>
                            <span>{progress.progress}%</span>
                        </div>
                        <Progress value={progress.progress} />
                        <p className="text-xs text-terminal-muted truncate">{progress.message}</p>
                    </div>
                )}

                {/* Error Display */}
                {progress?.error && !loading && (
                    <Alert variant="destructive">
                        <AlertDescription className="text-sm">{progress.error}</AlertDescription>
                    </Alert>
                )}

                {/* Action Buttons */}
                {!checking && (
                    <div className="flex flex-wrap gap-2">
                        {/* Setup button - show when Docker is installed but setup not complete */}
                        {needsSetup && status?.dockerInstalled && apiAvailable && (
                            <Button onClick={handleFullSetup} disabled={loading} size="sm" className="flex-1">
                                {loading ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                ) : (
                                    <Rocket className="h-4 w-4 mr-2" />
                                )}
                                {t("setupButton", { modelSize: config.modelSize })}
                            </Button>
                        )}

                        {/* Docker not installed warning */}
                        {status && !status.dockerInstalled && (
                            <Alert className="w-full">
                                <AlertDescription className="text-sm">
                                    {t("dockerRequired")}
                                </AlertDescription>
                            </Alert>
                        )}

                        {/* Start/Stop buttons - show when setup is complete */}
                        {isSetupComplete && apiAvailable && (
                            <>
                                {status?.containerRunning ? (
                                    <Button onClick={handleStop} disabled={loading} variant="destructive" size="sm">
                                        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <StopCircle className="h-4 w-4 mr-2" />}
                                        {t("stop")}
                                    </Button>
                                ) : (
                                    <Button onClick={handleStart} disabled={loading} size="sm">
                                        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                                        {t("start")}
                                    </Button>
                                )}
                            </>
                        )}
                    </div>
                )}

                {isSetupComplete && (
                    <div className="flex items-center gap-2 text-xs text-terminal-text">
                        <Switch
                            checked={enabled}
                            onCheckedChange={onEnabledChange}
                            disabled={!status?.apiHealthy}
                            className="data-[state=checked]:bg-terminal-green"
                        />
                        <span>{t("enabledForToolUsage")}</span>
                    </div>
                )}

                {/* Setup Steps - show when not yet set up */}
                {!checking && needsSetup && (
                    <div className="text-xs text-terminal-muted space-y-1">
                        <p><strong>{t("setupWillTitle")}</strong></p>
                        <ul className="list-disc list-inside ml-2 space-y-0.5">
                            {config.setupSteps.map((step, i) => (
                                <li key={i}>{step}</li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Advanced Settings */}
                <div className="border-t border-terminal-border/60 pt-3">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="text-terminal-muted hover:text-terminal-text h-7 px-2"
                    >
                        {showAdvanced ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
                        <span className="text-xs">{t("advanced")}</span>
                    </Button>

                    {showAdvanced && (
                        <div className="mt-3 space-y-2">
                            <Label className="text-xs text-terminal-muted">{t("backendPathLabel")}</Label>
                            <div className="flex gap-2">
                                <Input
                                    value={backendPath}
                                    onChange={(e) => onBackendPathChange(e.target.value)}
                                    placeholder={t("backendPathPlaceholder")}
                                    className="flex-1 text-xs h-8 bg-terminal-bg/60 border-terminal-border text-terminal-text placeholder:text-terminal-muted/60"
                                />
                                <Button variant="outline" size="sm" onClick={checkStatus} disabled={loading} className="h-8 px-2">
                                    <FolderOpen className="h-3 w-3" />
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
                </div>
            )}
        </div>
    );
}

// ============================================================================
// Main LocalModelsManager Component
// ============================================================================

export function LocalModelsManager({
    zImageEnabled,
    zImageBackendPath,
    onZImageEnabledChange,
    onZImageBackendPathChange,
    flux4bEnabled,
    flux4bBackendPath,
    onFlux4bEnabledChange,
    onFlux4bBackendPathChange,
    flux9bEnabled,
    flux9bBackendPath,
    onFlux9bEnabledChange,
    onFlux9bBackendPathChange,
}: LocalModelsManagerProps) {
    const t = useTranslations("comfyui.localModels");
    const [isElectron, setIsElectron] = useState(false);

    // Check if running in Electron
    useEffect(() => {
        if (typeof window !== "undefined" && "electronAPI" in window) {
            setIsElectron(true);
        }
    }, []);

    if (!isElectron) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Cpu className="h-5 w-5" />
                        {t("title")}
                    </CardTitle>
                    <CardDescription>
                        {t("webOnlyNote")}
                    </CardDescription>
                </CardHeader>
            </Card>
        );
    }

    // Map model configs to their state
    const modelStates: Record<string, { enabled: boolean; backendPath: string; onEnabledChange: (e: boolean) => void; onBackendPathChange: (p: string) => void }> = {
        "z-image": {
            enabled: zImageEnabled,
            backendPath: zImageBackendPath,
            onEnabledChange: onZImageEnabledChange,
            onBackendPathChange: onZImageBackendPathChange,
        },
        "flux-klein-4b": {
            enabled: flux4bEnabled,
            backendPath: flux4bBackendPath,
            onEnabledChange: onFlux4bEnabledChange,
            onBackendPathChange: onFlux4bBackendPathChange,
        },
        "flux-klein-9b": {
            enabled: flux9bEnabled,
            backendPath: flux9bBackendPath,
            onEnabledChange: onFlux9bEnabledChange,
            onBackendPathChange: onFlux9bBackendPathChange,
        },
    };

    return (
        <div className="space-y-4">
            {LOCAL_MODELS.map((config) => {
                const state = modelStates[config.id];
                return (
                    <ModelCard
                        key={config.id}
                        config={config}
                        enabled={state.enabled}
                        backendPath={state.backendPath}
                        onEnabledChange={state.onEnabledChange}
                        onBackendPathChange={state.onBackendPathChange}
                        isElectron={isElectron}
                    />
                );
            })}
        </div>
    );
}

