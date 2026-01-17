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
        description: "Fast SDXL-based image generation with FP8 quantization for efficient VRAM usage.",
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
    const [status, setStatus] = useState<ModelStatus | null>(null);
    const [loading, setLoading] = useState(false);
    const [checking, setChecking] = useState(true); // Track initial status check
    const [progress, setProgress] = useState<InstallProgress | null>(null);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [apiAvailable, setApiAvailable] = useState<boolean | null>(null);

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

    // Status indicator component
    function StatusIndicator({ ok, label }: { ok: boolean; label: string }) {
        return (
            <div className="flex items-center gap-2 text-sm">
                {ok ? (
                    <Check className="h-4 w-4 text-green-500" />
                ) : (
                    <X className="h-4 w-4 text-red-500" />
                )}
                <span className={ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}>
                    {label}
                </span>
            </div>
        );
    }

    return (
        <Card className="border-border/50">
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                    <div>
                        <CardTitle className="text-base flex items-center gap-2">
                            <HardDrive className="h-4 w-4" />
                            {config.name}
                        </CardTitle>
                        <CardDescription className="mt-1.5 text-sm">
                            {config.description}
                        </CardDescription>
                    </div>
                    {isSetupComplete && (
                        <Switch
                            checked={enabled}
                            onCheckedChange={onEnabledChange}
                            disabled={!status?.apiHealthy}
                        />
                    )}
                </div>
                <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                        <Download className="h-3 w-3" /> {config.modelSize}
                    </span>
                    <span className="flex items-center gap-1">
                        <Cpu className="h-3 w-3" /> {config.vramRequired}
                    </span>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Loading State */}
                {checking && (
                    <div className="flex items-center justify-center p-4">
                        <Loader2 className="h-5 w-5 animate-spin mr-2" />
                        <span className="text-sm text-muted-foreground">Checking status...</span>
                    </div>
                )}

                {/* Status Display - always show after checking */}
                {!checking && status && (
                    <div className="grid grid-cols-2 gap-2 p-3 bg-muted/50 rounded-lg text-sm">
                        <StatusIndicator ok={status.dockerInstalled} label="Docker" />
                        <StatusIndicator ok={status.imageBuilt} label="Image Built" />
                        <StatusIndicator ok={status.modelsDownloaded} label="Models" />
                        <StatusIndicator ok={status.containerRunning} label="Running" />
                        <StatusIndicator ok={status.apiHealthy} label="API Ready" />
                        <Button variant="ghost" size="sm" onClick={checkStatus} disabled={loading || checking} className="h-6 px-2">
                            <RefreshCw className={`h-3 w-3 ${loading || checking ? "animate-spin" : ""}`} />
                        </Button>
                    </div>
                )}

                {/* API Not Available Warning */}
                {!checking && apiAvailable === false && (
                    <Alert>
                        <AlertDescription className="text-sm">
                            Backend IPC handlers not yet implemented. The Electron main process needs to handle <code className="bg-muted px-1 rounded">{config.apiKey}</code> operations.
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
                        <p className="text-xs text-muted-foreground truncate">{progress.message}</p>
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
                                Setup ({config.modelSize})
                            </Button>
                        )}

                        {/* Docker not installed warning */}
                        {status && !status.dockerInstalled && (
                            <Alert className="w-full">
                                <AlertDescription className="text-sm">
                                    Docker required. Install <a href="https://www.docker.com/products/docker-desktop/" target="_blank" rel="noopener noreferrer" className="underline text-blue-500">Docker Desktop</a>.
                                </AlertDescription>
                            </Alert>
                        )}

                        {/* Start/Stop buttons - show when setup is complete */}
                        {isSetupComplete && apiAvailable && (
                            <>
                                {status?.containerRunning ? (
                                    <Button onClick={handleStop} disabled={loading} variant="destructive" size="sm">
                                        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <StopCircle className="h-4 w-4 mr-2" />}
                                        Stop
                                    </Button>
                                ) : (
                                    <Button onClick={handleStart} disabled={loading} size="sm">
                                        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                                        Start
                                    </Button>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* Setup Steps - show when not yet set up */}
                {!checking && needsSetup && (
                    <div className="text-xs text-muted-foreground space-y-1">
                        <p><strong>Setup will:</strong></p>
                        <ul className="list-disc list-inside ml-2 space-y-0.5">
                            {config.setupSteps.map((step, i) => (
                                <li key={i}>{step}</li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Advanced Settings */}
                <div className="border-t pt-3">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="text-muted-foreground hover:text-foreground h-7 px-2"
                    >
                        {showAdvanced ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
                        <span className="text-xs">Advanced</span>
                    </Button>

                    {showAdvanced && (
                        <div className="mt-3 space-y-2">
                            <Label className="text-xs">Backend Path</Label>
                            <div className="flex gap-2">
                                <Input
                                    value={backendPath}
                                    onChange={(e) => onBackendPathChange(e.target.value)}
                                    placeholder="Auto-detected path"
                                    className="flex-1 text-xs h-8"
                                />
                                <Button variant="outline" size="sm" onClick={checkStatus} disabled={loading} className="h-8 px-2">
                                    <FolderOpen className="h-3 w-3" />
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
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
                        Local Image Generation
                    </CardTitle>
                    <CardDescription>
                        Local image generation models are only available in the desktop app.
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
