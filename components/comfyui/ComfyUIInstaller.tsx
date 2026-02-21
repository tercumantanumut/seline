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
    Cpu, Rocket, FolderOpen, ChevronDown, ChevronUp
} from "lucide-react";
import { useTranslations } from "next-intl";

interface ComfyUIStatus {
    dockerInstalled: boolean;
    imageBuilt: boolean;
    containerRunning: boolean;
    apiHealthy: boolean;
    modelsDownloaded: boolean;
    checkpointExists: boolean;
    loraExists: boolean;
}

interface InstallProgress {
    stage: string;
    progress: number;
    message: string;
    error?: string;
}

interface ComfyUIInstallerProps {
    backendPath: string;
    onBackendPathChange: (path: string) => void;
    enabled: boolean;
    onEnabledChange: (enabled: boolean) => void;
}

// Define the electron API types
interface ComfyUIElectronAPI {
    checkStatus: (path?: string) => Promise<ComfyUIStatus>;
    start: (path?: string) => Promise<{ success: boolean; error?: string }>;
    stop: (path?: string) => Promise<{ success: boolean; error?: string }>;
    getDefaultPath: () => Promise<{ success: boolean; path?: string; error?: string }>;
    fullSetup: () => Promise<{ success: boolean; backendPath?: string; error?: string }>;
    onInstallProgress: (callback: (data: InstallProgress) => void) => void;
    removeProgressListener: () => void;
}

export function ComfyUIInstaller({
    backendPath,
    onBackendPathChange,
    enabled,
    onEnabledChange,
}: ComfyUIInstallerProps) {
    const t = useTranslations("comfyui.installer");
    const [status, setStatus] = useState<ComfyUIStatus | null>(null);
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState<InstallProgress | null>(null);
    const [isElectron, setIsElectron] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);

    // Get the electron API
    const getElectronAPI = useCallback((): ComfyUIElectronAPI | null => {
        if (typeof window !== "undefined" && "electronAPI" in window) {
            return (window as { electronAPI?: { comfyui?: ComfyUIElectronAPI } }).electronAPI?.comfyui || null;
        }
        return null;
    }, []);

    // Check if running in Electron and get default path
    useEffect(() => {
        const api = getElectronAPI();
        if (api) {
            setIsElectron(true);
            // Get default path if not already set (only if the method exists)
            if (!backendPath && typeof api.getDefaultPath === 'function') {
                api.getDefaultPath().then((result) => {
                    if (result.success && result.path) {
                        onBackendPathChange(result.path);
                    }
                }).catch((err) => {
                    console.error("Failed to get default path:", err);
                });
            }
        }
    }, [getElectronAPI, backendPath, onBackendPathChange]);

    // Check status on mount
    const checkStatus = useCallback(async () => {
        const api = getElectronAPI();
        if (!api) return;

        try {
            const newStatus = await api.checkStatus(backendPath || undefined);
            setStatus(newStatus);
        } catch (error) {
            console.error("Failed to check ComfyUI status:", error);
        }
    }, [getElectronAPI, backendPath]);

    useEffect(() => {
        if (isElectron) {
            checkStatus();
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

    // One-click full setup
    async function handleFullSetup() {
        const api = getElectronAPI();
        if (!api) return;

        setLoading(true);
        setProgress({ stage: "checking", progress: 0, message: "Starting ComfyUI setup..." });

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
        setProgress({ stage: "starting", progress: 50, message: "Starting ComfyUI..." });
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

    // Check if setup is complete (image built + models downloaded)
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

    if (!isElectron) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Cpu className="h-5 w-5" />
                        {t("titleSimple")}
                    </CardTitle>
                    <CardDescription>
                        {t("webOnlyNote")}
                    </CardDescription>
                </CardHeader>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Cpu className="h-5 w-5" />
                    {t("title")}
                </CardTitle>
                <CardDescription>
                    {t("description")}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Enable Toggle - only show when setup is complete */}
                {isSetupComplete && (
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label>{t("enableLabel")}</Label>
                            <p className="text-sm text-muted-foreground">
                                {t("enableDesc")}
                            </p>
                        </div>
                        <Switch
                            checked={enabled}
                            onCheckedChange={onEnabledChange}
                            disabled={!status?.apiHealthy}
                        />
                    </div>
                )}

                {/* Status Display */}
                {status && (
                    <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                        <StatusIndicator ok={status.dockerInstalled} label={t("dockerInstalled")} />
                        <StatusIndicator ok={status.imageBuilt} label={t("imageBuilt")} />
                        <StatusIndicator ok={status.modelsDownloaded} label={t("modelsDownloaded")} />
                        <StatusIndicator ok={status.containerRunning} label={t("containerRunning")} />
                        <StatusIndicator ok={status.apiHealthy} label={t("apiHealthy")} />
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" onClick={checkStatus} disabled={loading}>
                                <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
                            </Button>
                            <span className="text-xs text-muted-foreground">{t("refreshStatus")}</span>
                        </div>
                    </div>
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
                        <AlertDescription>{progress.error}</AlertDescription>
                    </Alert>
                )}

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2">
                    {/* One-Click Setup - show when Docker is installed but setup not complete */}
                    {needsSetup && status?.dockerInstalled && (
                        <Button onClick={handleFullSetup} disabled={loading} size="lg" className="w-full">
                            {loading ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                                <Rocket className="h-4 w-4 mr-2" />
                            )}
                            {t("setupButton")}
                        </Button>
                    )}

                    {/* Docker not installed warning */}
                    {status && !status.dockerInstalled && (
                        <Alert>
                            <AlertDescription>
                                {t("dockerRequired")}
                            </AlertDescription>
                        </Alert>
                    )}

                    {/* Start/Stop Container - show when setup is complete */}
                    {isSetupComplete && (
                        <>
                            {status?.containerRunning ? (
                                <Button onClick={handleStop} disabled={loading} variant="destructive">
                                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <StopCircle className="h-4 w-4 mr-2" />}
                                    {t("stopComfyUI")}
                                </Button>
                            ) : (
                                <Button onClick={handleStart} disabled={loading}>
                                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                                    {t("startComfyUI")}
                                </Button>
                            )}
                        </>
                    )}
                </div>

                {/* Setup Info - only show when not yet set up */}
                {needsSetup && (
                    <div className="text-xs text-muted-foreground space-y-1">
                        <p><strong>{t("setupWillTitle")}</strong></p>
                        <ul className="list-disc list-inside ml-2">
                            <li>{t("setupStep1")}</li>
                            <li>{t("setupStep2")}</li>
                            <li>{t("setupStep3")}</li>
                            <li>{t("setupStep4")}</li>
                        </ul>
                    </div>
                )}

                {/* Advanced Settings */}
                <div className="border-t pt-4">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="text-muted-foreground hover:text-foreground"
                    >
                        {showAdvanced ? <ChevronUp className="h-4 w-4 mr-2" /> : <ChevronDown className="h-4 w-4 mr-2" />}
                        {t("advancedSettings")}
                    </Button>

                    {showAdvanced && (
                        <div className="mt-4 space-y-4">
                            <div className="space-y-2">
                                <Label>{t("backendPath")}</Label>
                                <div className="flex gap-2">
                                    <Input
                                        value={backendPath}
                                        onChange={(e) => onBackendPathChange(e.target.value)}
                                        placeholder={t("backendPathPlaceholder")}
                                        className="flex-1 text-xs"
                                    />
                                    <Button variant="outline" size="sm" onClick={checkStatus} disabled={loading}>
                                        <FolderOpen className="h-4 w-4" />
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {t("backendPathDesc")}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
