"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FolderIcon,
  PlusIcon,
  TrashIcon,
  RefreshCwIcon,
  Loader2Icon,
  CheckCircleIcon,
  AlertCircleIcon,
  FileIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  StarIcon,
  XCircleIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { resilientFetch, resilientPost, resilientDelete } from "@/lib/utils/resilient-fetch";

type IndexingMode = "auto" | "full" | "files-only";
type SyncMode = "auto" | "manual" | "scheduled" | "triggered";
type ChunkPreset = "balanced" | "small" | "large" | "custom";
type ReindexPolicy = "smart" | "always" | "never";

interface SyncFolder {
  id: string;
  folderPath: string;
  displayName: string | null;
  recursive: boolean;
  includeExtensions: string | string[];
  excludePatterns: string | string[];
  fileTypeFilters?: string | string[];
  status: "pending" | "syncing" | "synced" | "error" | "paused";
  lastSyncedAt: string | null;
  lastError: string | null;
  fileCount: number | null;
  chunkCount: number | null;
  skippedCount?: number | null;
  skipReasons?: Record<string, number> | string | null;
  lastRunMetadata?: Record<string, unknown> | string | null;
  lastRunTrigger?: "manual" | "scheduled" | "triggered" | "auto" | null;
  embeddingModel: string | null;
  indexingMode: "files-only" | "full" | "auto";
  syncMode?: SyncMode;
  syncCadenceMinutes?: number;
  maxFileSizeBytes?: number;
  chunkPreset?: ChunkPreset;
  chunkSizeOverride?: number | null;
  chunkOverlapOverride?: number | null;
  reindexPolicy?: ReindexPolicy;
  isPrimary: boolean;
  inheritedFromWorkflowId?: string | null;
  inheritedFromAgentId?: string | null;
}

interface FolderAnalysis {
  folderPath: string;
  folderName: string;
  detectedPatterns: string[];
  mergedPatterns: string[];
  fileCountPreview: number;
  fileCountLimited: boolean;
  maxFileLines?: number;
  largeFileCount?: number;
  largeFileExamples?: string[];
  exists: boolean;
}

interface FolderSyncManagerProps {
  characterId: string;
  className?: string;
  compact?: boolean;
}

function parseStringArray(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseObject(value: Record<string, unknown> | string | null | undefined): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
    } catch {
      return {};
    }
  }
  return {};
}

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}

export function FolderSyncManager({ characterId, className, compact = false }: FolderSyncManagerProps) {
  const t = useTranslations("folderSync");
  const [folders, setFolders] = useState<SyncFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [syncingFolderId, setSyncingFolderId] = useState<string | null>(null);
  const [removingFolderId, setRemovingFolderId] = useState<string | null>(null);
  const [updatingFolderId, setUpdatingFolderId] = useState<string | null>(null);
  const [expandedFolderId, setExpandedFolderId] = useState<string | null>(null);

  // Comprehensive default file extensions for vector search
  const DEFAULT_EXTENSIONS = [
    // Documents
    ".pdf", ".doc", ".docx", ".odt", ".rtf",
    // Spreadsheets
    ".xls", ".xlsx", ".ods", ".csv",
    // Presentations
    ".ppt", ".pptx", ".odp",
    // Text/Markup
    ".txt", ".md", ".markdown", ".rst", ".tex",
    // Code
    ".js", ".jsx", ".ts", ".tsx", ".py", ".java", ".cpp", ".c", ".h", ".go", ".rs", ".rb", ".php",
    // Web
    ".html", ".htm", ".css", ".xml", ".json", ".yaml", ".yml",
    // Other
    ".log", ".sql", ".sh", ".bat",
  ].join(",");

  // New folder form state
  const [newFolderPath, setNewFolderPath] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newRecursive, setNewRecursive] = useState(true);
  const [newExtensions, setNewExtensions] = useState(DEFAULT_EXTENSIONS);
  const [newExcludePatterns, setNewExcludePatterns] = useState("node_modules,.git,dist,build,.next,__pycache__,.venv,venv,package-lock.json,pnpm-lock.yaml,yarn.lock");
  const [isAdding, setIsAdding] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [folderAnalysis, setFolderAnalysis] = useState<FolderAnalysis | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [useRecommendedExcludes, setUseRecommendedExcludes] = useState(true);
  const [isPickingFolder, setIsPickingFolder] = useState(false);

  const isElectron =
    typeof window !== "undefined" &&
    !!(window as Window & { electronAPI?: { isElectron?: boolean } }).electronAPI?.isElectron;

  const [newIndexingMode, setNewIndexingMode] = useState<IndexingMode>("auto");
  const [newSyncMode, setNewSyncMode] = useState<SyncMode>("triggered");
  const [newSyncCadenceMinutes, setNewSyncCadenceMinutes] = useState("60");
  const [newFolderMode, setNewFolderMode] = useState<"simple" | "advanced">("simple");
  const [newFileTypeFilters, setNewFileTypeFilters] = useState("");
  const [newMaxFileSizeMB, setNewMaxFileSizeMB] = useState("10");
  const [newChunkPreset, setNewChunkPreset] = useState<ChunkPreset>("balanced");
  const [newChunkSizeOverride, setNewChunkSizeOverride] = useState("");
  const [newChunkOverlapOverride, setNewChunkOverlapOverride] = useState("");
  const [newReindexPolicy, setNewReindexPolicy] = useState<ReindexPolicy>("never");

  const RECOMMENDED_EXCLUDES = [
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    "__pycache__",
    ".venv",
    "venv",
    "coverage",
    ".local-data",
    "dist-electron",
    "comfyui_backend",
    ".vscode",
    ".idea",
    "tmp",
    "temp",
    ".DS_Store",
    "Thumbs.db",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "*.tsbuildinfo",
    "*.log",
    "*.lock",
    "**/node_modules/**",
    "**/.git/**",
    "**/.next/**",
    "**/dist/**",
    "**/build/**",
    "**/coverage/**",
    "**/.local-data/**",
    "**/dist-electron/**",
    "**/comfyui_backend/**",
    "**/.vscode/**",
    "**/.idea/**",
    "**/tmp/**",
    "**/temp/**",
  ];



  const loadFolders = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await resilientFetch<{ folders?: SyncFolder[]; error?: string }>(
        `/api/vector-sync?characterId=${characterId}`
      );
      if (error || !data) throw new Error(error || t("errorLoadFolders"));
      setFolders(data.folders || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errorLoadFolders"));
    } finally {
      setLoading(false);
    }
  }, [characterId]);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  // Poll every 2 seconds while any folder is actively syncing so the UI
  // reflects real progress / completion without waiting for the user to act.
  useEffect(() => {
    const hasSyncing = folders.some((f) => f.status === "syncing");
    if (!hasSyncing) return;

    const interval = setInterval(() => {
      loadFolders();
    }, 2000);
    return () => clearInterval(interval);
  }, [folders, loadFolders]);

  const handleCancelSync = async (folderId: string) => {
    try {
      await resilientPost("/api/vector-sync", { action: "cancel", folderId });
      // Give the server a moment to propagate, then reload
      setTimeout(loadFolders, 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errorCancelSync"));
    }
  };

  // Analyze folder path to detect ignore patterns and file count
  const analyzeFolder = async (path: string) => {
    if (!path.trim()) {
      setFolderAnalysis(null);
      setAnalysisError(null);
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      const { data, error } = await resilientPost<FolderAnalysis & { error?: string }>("/api/folder-picker", {
        folderPath: path.trim(),
        includeExtensions: newExtensions.split(",").map((e) => e.trim()).filter(Boolean),
        excludePatterns: newExcludePatterns.split(",").map((p) => p.trim()).filter(Boolean),
        recursive: newRecursive,
      });

      if (data && !error) {
        setFolderAnalysis(data);
        setAnalysisError(null);
        // Auto-populate exclude patterns from detected patterns
        if (data.mergedPatterns && data.mergedPatterns.length > 0) {
          const merged = data.mergedPatterns.join(",");
          if (merged !== newExcludePatterns) {
            setNewExcludePatterns(merged);
          }
        }
        // Set display name from folder name
        if (!newDisplayName && data.folderName) {
          setNewDisplayName(data.folderName);
        }
        // Clear any previous error messages
        setError(null);
      } else {
        setFolderAnalysis(null);
        // Set analysis error but don't block adding - user might know the path is correct
        setAnalysisError(error || "Could not verify folder");
      }
    } catch (err) {
      setFolderAnalysis(null);
      setAnalysisError("Could not connect to server to verify folder");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Debounce folder path analysis
  useEffect(() => {
    const timer = setTimeout(() => {
      if (newFolderPath) {
        analyzeFolder(newFolderPath);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [newFolderPath, newExtensions, newRecursive, newExcludePatterns]);

  const handleOpenFolderPicker = async () => {
    if (isElectron) {
      setIsPickingFolder(true);
      try {
        const selectedPath = await window.electronAPI!.dialog.selectFolder();
        if (selectedPath) {
          setNewFolderPath(selectedPath);
          setShowAddForm(true);
        }
      } catch {
        // Native picker failed — fall back to manual text input
        setShowAddForm(true);
      } finally {
        setIsPickingFolder(false);
      }
    } else {
      setShowAddForm(true);
    }
  };

  const handleAddFolder = async () => {
    if (!newFolderPath.trim()) return;

    const syncCadenceMinutes = Number(newSyncCadenceMinutes);
    const maxFileSizeMB = Number(newMaxFileSizeMB);
    const chunkSizeOverride = newChunkSizeOverride ? Number(newChunkSizeOverride) : undefined;
    const chunkOverlapOverride = newChunkOverlapOverride ? Number(newChunkOverlapOverride) : undefined;

    const effectiveIndexingMode: IndexingMode = newFolderMode === "simple" ? "auto" : newIndexingMode;
    // Simple mode now behaves like the classic flow: watcher-driven updates only.
    const effectiveSyncMode: SyncMode = newFolderMode === "simple" ? "triggered" : newSyncMode;
    const effectiveCadence = newFolderMode === "simple" ? 60 : syncCadenceMinutes;
    const effectiveMaxFileSizeMB = newFolderMode === "simple" ? 10 : maxFileSizeMB;
    const effectiveChunkPreset: ChunkPreset = newFolderMode === "simple" ? "balanced" : newChunkPreset;
    const effectiveChunkSizeOverride = newFolderMode === "simple" ? undefined : chunkSizeOverride;
    const effectiveChunkOverlapOverride = newFolderMode === "simple" ? undefined : chunkOverlapOverride;
    const effectiveReindexPolicy: ReindexPolicy = newFolderMode === "simple" ? "never" : newReindexPolicy;

    if (!Number.isFinite(effectiveCadence) || effectiveCadence < 5) {
      setError(t("cadenceValidation"));
      return;
    }
    if (!Number.isFinite(effectiveMaxFileSizeMB) || effectiveMaxFileSizeMB <= 0 || effectiveMaxFileSizeMB > 512) {
      setError(t("maxFileSizeValidation"));
      return;
    }
    if (effectiveChunkPreset === "custom") {
      if (!effectiveChunkSizeOverride || effectiveChunkSizeOverride < 100) {
        setError(t("chunkSizeValidation"));
        return;
      }
      if (effectiveChunkOverlapOverride === undefined || effectiveChunkOverlapOverride < 0 || effectiveChunkOverlapOverride >= effectiveChunkSizeOverride) {
        setError(t("chunkOverlapValidation"));
        return;
      }
    }

    setIsAdding(true);
    try {
      const { error } = await resilientPost<{ error?: string }>("/api/vector-sync", {
        action: "add",
        characterId,
        folderPath: newFolderPath.trim(),
        displayName: newDisplayName.trim() || undefined,
        recursive: newRecursive,
        includeExtensions: newExtensions.split(",").map((e) => e.trim()).filter(Boolean),
        excludePatterns: newExcludePatterns.split(",").map((p) => p.trim()).filter(Boolean),
        indexingMode: effectiveIndexingMode,
        syncMode: effectiveSyncMode,
        syncCadenceMinutes: effectiveCadence,
        fileTypeFilters: newFileTypeFilters
          .split(",")
          .map((e) => e.trim())
          .filter(Boolean),
        maxFileSizeBytes: Math.round(effectiveMaxFileSizeMB * 1024 * 1024),
        chunkPreset: effectiveChunkPreset,
        chunkSizeOverride: effectiveChunkSizeOverride,
        chunkOverlapOverride: effectiveChunkOverlapOverride,
        reindexPolicy: effectiveReindexPolicy,
      }, { timeout: 30_000 });

      if (error) {
        throw new Error(error);
      }

      // Reset form and reload folders
      resetForm();
      await loadFolders();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errorAddFolder"));
    } finally {
      setIsAdding(false);
    }
  };

  const resetForm = () => {
    setNewFolderPath("");
    setNewDisplayName("");
    setNewRecursive(true);
    setNewExtensions(DEFAULT_EXTENSIONS);
    setNewExcludePatterns("node_modules,.git,dist,build,.next,__pycache__,.venv,venv,package-lock.json,pnpm-lock.yaml,yarn.lock");
    setNewFolderMode("simple");
    setNewIndexingMode("auto");
    setNewSyncMode("triggered");
    setNewSyncCadenceMinutes("60");
    setNewFileTypeFilters("");
    setNewMaxFileSizeMB("10");
    setNewChunkPreset("balanced");
    setNewChunkSizeOverride("");
    setNewChunkOverlapOverride("");
    setNewReindexPolicy("never");
    setShowAddForm(false);
    setFolderAnalysis(null);
    setAnalysisError(null);
    setShowAdvancedOptions(false);
  };

  const toggleRecommendedExcludes = (checked: boolean) => {
    setUseRecommendedExcludes(checked);
    const current = newExcludePatterns.split(",").map((p) => p.trim()).filter(Boolean);
    if (checked) {
      const merged = Array.from(new Set([...current, ...RECOMMENDED_EXCLUDES]));
      setNewExcludePatterns(merged.join(","));
    } else {
      const filtered = current.filter((p) => !RECOMMENDED_EXCLUDES.includes(p));
      setNewExcludePatterns(filtered.join(","));
    }
  };

  const handleRemoveFolder = async (folderId: string) => {
    setRemovingFolderId(folderId);
    try {
      const { error } = await resilientDelete<{ error?: string }>(
        `/api/vector-sync?folderId=${folderId}`
      );
      if (error) throw new Error(error);

      await loadFolders();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errorRemoveFolder"));
    } finally {
      setRemovingFolderId(null);
    }
  };

  const handleSyncFolder = async (folderId: string) => {
    setSyncingFolderId(folderId);
    try {
      const { error } = await resilientPost<{ error?: string }>("/api/vector-sync", {
        action: "sync", folderId,
      });
      if (error) throw new Error(error);

      await loadFolders();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errorSyncFolder"));
    } finally {
      setSyncingFolderId(null);
    }
  };

  const handleSetPrimary = async (folderId: string) => {
    try {
      const { error } = await resilientPost<{ error?: string }>("/api/vector-sync", {
        action: "set-primary", folderId, characterId,
      });
      if (error) throw new Error(error);

      await loadFolders();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errorSetPrimary"));
    }
  };

  const handleUpdateFolder = async (folderId: string, updates: Record<string, unknown>) => {
    setUpdatingFolderId(folderId);
    try {
      const { error } = await resilientPost<{ error?: string }>("/api/vector-sync", {
        action: "update",
        folderId,
        ...updates,
      });
      if (error) throw new Error(error);
      await loadFolders();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errorUpdateSettings"));
    } finally {
      setUpdatingFolderId(null);
    }
  };

  const handleApplySimpleDefaults = async (folder: SyncFolder) => {
    await handleUpdateFolder(folder.id, {
      indexingMode: "auto",
      syncMode: "triggered",
      syncCadenceMinutes: 60,
      maxFileSizeBytes: 10 * 1024 * 1024,
      chunkPreset: "balanced",
      chunkSizeOverride: null,
      chunkOverlapOverride: null,
      reindexPolicy: "never",
    });
  };

  const handleToggleAutoUpdates = async (folder: SyncFolder) => {
    const currentSyncMode = folder.syncMode ?? "auto";
    const nextSyncMode: SyncMode = currentSyncMode === "manual" ? "triggered" : "manual";
    await handleUpdateFolder(folder.id, { syncMode: nextSyncMode });
  };

  const getStatusIcon = (status: SyncFolder["status"]) => {
    switch (status) {
      case "synced": return <CheckCircleIcon className="w-4 h-4 text-terminal-green" />;
      case "syncing": return <Loader2Icon className="w-4 h-4 text-terminal-green animate-spin" />;
      case "error": return <AlertCircleIcon className="w-4 h-4 text-destructive" />;
      case "paused": return <AlertCircleIcon className="w-4 h-4 text-terminal-amber" />;
      case "pending": return <FileIcon className="w-4 h-4 text-terminal-muted" />;
      default: return <FileIcon className="w-4 h-4 text-terminal-muted" />;
    }
  };

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center p-4", className)}>
        <Loader2Icon className="w-5 h-5 animate-spin text-terminal-green" />
        <span className="ml-2 font-mono text-sm text-terminal-muted">{t("loading")}</span>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4 min-w-0 overflow-x-hidden", className)}>
      {!compact && folders.length > 0 && (
        <div className="rounded border border-terminal-border bg-terminal-cream/30 p-3">
          <p className="font-mono text-xs text-terminal-muted">
            {t("statusSummary", {
              syncing: folders.filter((folder) => folder.status === "syncing").length,
              synced: folders.filter((folder) => folder.status === "synced").length,
              paused: folders.filter((folder) => folder.status === "paused").length,
            })}
          </p>
        </div>
      )}
      {error && (
        <div className="rounded border border-destructive/30 bg-destructive/10 p-3 font-mono text-sm text-destructive">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">{t("dismiss")}</button>
        </div>
      )}

      {!compact && folders.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded border border-terminal-border bg-terminal-cream/30 p-3">
          <span className="font-mono text-xs text-terminal-muted">
            {t("transparencyHint")}
          </span>
        </div>
      )}

      {/* Folder List */}
      {folders.length > 0 && (
        <div className="space-y-2">
          {folders.map((folder) => {
            const syncMode = folder.syncMode ?? "auto";
            const includeExts = parseStringArray(folder.includeExtensions);
            const excludeGlobs = parseStringArray(folder.excludePatterns);
            const typeFilters = parseStringArray(folder.fileTypeFilters);
            const skipReasons = parseObject(folder.skipReasons) as Record<string, number>;
            const runMetadata = parseObject(folder.lastRunMetadata);

            const behaviorSummary = syncMode === "auto"
              ? t("behaviorHybrid")
              : syncMode === "triggered"
                ? t("behaviorEventDriven")
                : syncMode === "scheduled"
                  ? t("behaviorScheduled")
                  : t("behaviorManual");
            const indexingModeLabel = folder.indexingMode === "full"
              ? t("modeFull")
              : folder.indexingMode === "files-only"
                ? t("modeFilesOnly")
                : t("modeAuto");
            const syncModeLabel = syncMode === "manual"
              ? t("modeManual")
              : syncMode === "scheduled"
                ? t("modeScheduled")
                : syncMode === "triggered"
                  ? t("modeTriggered")
                  : t("modeAuto");
            const chunkPresetLabel = folder.chunkPreset === "small"
              ? t("chunkSmall")
              : folder.chunkPreset === "large"
                ? t("chunkLarge")
                : folder.chunkPreset === "custom"
                  ? t("chunkCustom")
                  : t("chunkBalanced");
            const reindexPolicyLabel = (folder.reindexPolicy ?? "smart") === "always"
              ? t("reindexAlways")
              : (folder.reindexPolicy ?? "smart") === "never"
                ? t("reindexNever")
                : t("reindexSmart");
            const isSimpleDefaults =
              folder.indexingMode === "auto" &&
              syncMode === "triggered" &&
              (folder.reindexPolicy ?? "smart") === "never" &&
              (folder.chunkPreset ?? "balanced") === "balanced" &&
              (folder.maxFileSizeBytes ?? 10 * 1024 * 1024) === 10 * 1024 * 1024;
            const forceReindex = runMetadata.forceReindex === true;
            const lastRunReason = folder.lastRunTrigger === "triggered"
              ? t("lastRunReasonFileChange")
              : folder.lastRunTrigger === "manual"
                ? t("lastRunReasonManual")
                : folder.lastRunTrigger === "auto"
                  ? t("lastRunReasonInitial")
                  : folder.lastRunTrigger === "scheduled" && forceReindex
                    ? t("lastRunReasonScheduledFull")
                    : folder.lastRunTrigger === "scheduled"
                      ? t("lastRunReasonScheduledCheck")
                      : null;

            return (
            <div
              key={folder.id}
              className="rounded border border-terminal-border bg-terminal-cream/50 p-3"
            >
              <div className="flex flex-wrap items-start gap-2 md:flex-nowrap md:items-center md:gap-3">
                <FolderIcon className="w-5 h-5 text-terminal-green flex-shrink-0" />
                <div className="flex-1 min-w-0 overflow-hidden">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-mono text-sm text-terminal-dark truncate">
                      {folder.displayName || folder.folderPath.split(/[/\\]/).pop()}
                    </p>
                    {folder.isPrimary && (
                      <span className="text-[10px] bg-terminal-green/10 text-terminal-green border border-terminal-green/20 px-1.5 py-0 rounded font-mono uppercase font-bold tracking-wider">
                        {t("primaryBadge")}
                      </span>
                    )}
                    {folder.inheritedFromWorkflowId && (
                      <span
                        className="text-[10px] bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0 rounded font-mono uppercase font-bold tracking-wider"
                        title={t("sharedFromWorkflow")}
                        aria-label={t("sharedFromWorkflow")}
                      >
                        {t("workflowBadge")}
                      </span>
                    )}
                  </div>
                  <p className="font-mono text-xs text-terminal-muted truncate" title={folder.folderPath}>
                    {folder.folderPath}
                  </p>
                  <p className="font-mono text-[10px] text-terminal-muted mt-1">
                    {behaviorSummary}
                  </p>
                </div>
                <div className="w-full md:w-auto flex flex-wrap justify-end items-center gap-1.5">
                  {getStatusIcon(folder.status)}
                  {!compact && (
                    <button
                      onClick={() => setExpandedFolderId(expandedFolderId === folder.id ? null : folder.id)}
                      className="p-1 hover:bg-terminal-dark/10 rounded"
                    >
                      {expandedFolderId === folder.id ? (
                        <ChevronUpIcon className="w-4 h-4 text-terminal-muted" />
                      ) : (
                        <ChevronDownIcon className="w-4 h-4 text-terminal-muted" />
                      )}
                    </button>
                  )}
                  {!folder.isPrimary && !folder.inheritedFromWorkflowId && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleSetPrimary(folder.id)}
                      title={t("setPrimaryFolder")}
                      aria-label={t("setPrimaryFolder")}
                      className="h-8 w-8 shrink-0 text-terminal-muted hover:text-terminal-amber hover:bg-terminal-amber/10"
                    >
                      <StarIcon className="w-4 h-4" />
                    </Button>
                  )}
                  {folder.status === "syncing" ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleCancelSync(folder.id)}
                      title={t("cancelSync")}
                      aria-label={t("cancelSync")}
                      className="h-8 w-8 shrink-0 text-destructive hover:text-destructive/80 hover:bg-destructive/10"
                    >
                      <XCircleIcon className="w-4 h-4" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleSyncFolder(folder.id)}
                      disabled={syncingFolderId === folder.id}
                      className="h-8 w-8 shrink-0"
                    >
                      <RefreshCwIcon className={cn("w-4 h-4", syncingFolderId === folder.id && "animate-spin")} />
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggleAutoUpdates(folder)}
                    disabled={updatingFolderId === folder.id}
                    className="h-8 px-2 font-mono text-[10px] whitespace-nowrap"
                  >
                    {updatingFolderId === folder.id ? <Loader2Icon className="w-3 h-3 animate-spin" /> : (syncMode === "manual" ? t("resumeUpdatesShort") : t("pauseUpdatesShort"))}
                  </Button>
                  {!isSimpleDefaults && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleApplySimpleDefaults(folder)}
                      disabled={updatingFolderId === folder.id}
                      className="h-8 px-2 font-mono text-[10px] whitespace-nowrap"
                    >
                      {updatingFolderId === folder.id ? <Loader2Icon className="w-3 h-3 animate-spin" /> : t("applySimpleDefaultsShort")}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveFolder(folder.id)}
                    disabled={removingFolderId === folder.id}
                    className="h-8 w-8 shrink-0 text-destructive hover:text-destructive/80 hover:bg-destructive/10"
                  >
                    {removingFolderId === folder.id ? (
                      <Loader2Icon className="w-4 h-4 animate-spin" />
                    ) : (
                      <TrashIcon className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Expanded Details */}
              {expandedFolderId === folder.id && !compact && (
                <div className="mt-3 pt-3 border-t border-terminal-border space-y-2">
                  <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                    <div>
                      <span className="text-terminal-muted">{t("files")}</span>{" "}
                      <span className="text-terminal-dark">{folder.fileCount ?? 0}</span>
                    </div>
                    <div>
                      <span className="text-terminal-muted">{t("chunks")}</span>{" "}
                      <span className="text-terminal-dark">{folder.chunkCount ?? 0}</span>
                    </div>
                    <div>
                      <span className="text-terminal-muted">{t("recursive")}</span>{" "}
                      <span className="text-terminal-dark">{folder.recursive ? t("yes") : t("no")}</span>
                    </div>
                    <div>
                      <span className="text-terminal-muted">{t("lastSynced")}</span>{" "}
                      <span className="text-terminal-dark">
                        {folder.lastSyncedAt ? new Date(folder.lastSyncedAt).toLocaleString() : t("never")}
                      </span>
                    </div>
                    <div>
                      <span className="text-terminal-muted">{t("indexingBehavior")}</span>{" "}
                      <span className={cn(
                        "text-xs font-mono px-2 py-0.5 rounded",
                        folder.indexingMode === "full" && "bg-terminal-green/20 text-terminal-green",
                        folder.indexingMode === "files-only" && "bg-terminal-blue/20 text-terminal-blue",
                        folder.indexingMode === "auto" && "bg-terminal-muted/20 text-terminal-muted"
                      )}>
                        {indexingModeLabel}
                      </span>
                    </div>
                    <div>
                      <span className="text-terminal-muted">{t("updatesMode")}</span>{" "}
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {syncModeLabel}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-terminal-muted">{t("checkEveryMinutes")}</span>{" "}
                      <span className="text-terminal-dark">{folder.syncCadenceMinutes ?? 60}</span>
                    </div>
                    <div>
                      <span className="text-terminal-muted">{t("largestFileSize")}</span>{" "}
                      <span className="text-terminal-dark">{formatBytes(folder.maxFileSizeBytes ?? 10 * 1024 * 1024)}</span>
                    </div>
                    <div>
                      <span className="text-terminal-muted">{t("searchDetailLevel")}</span>{" "}
                      <span className="text-terminal-dark">{chunkPresetLabel}</span>
                    </div>
                    <div>
                      <span className="text-terminal-muted">{t("fullRescanPolicy")}</span>{" "}
                      <span className="text-terminal-dark">{reindexPolicyLabel}</span>
                    </div>
                    <div>
                      <span className="text-terminal-muted">{t("skipped")}</span>{" "}
                      <span className="text-terminal-dark">{folder.skippedCount ?? 0}</span>
                    </div>
                    {folder.lastRunTrigger && (
                      <div className="col-span-2">
                        <span className="text-terminal-muted">{t("lastRunReason")}</span>{" "}
                        <span className="text-terminal-dark">{lastRunReason ?? folder.lastRunTrigger}</span>
                      </div>
                    )}
                    {folder.embeddingModel && (
                      <div className="col-span-2">
                        <span className="text-terminal-muted">Model:</span>{" "}
                        <span className="text-terminal-dark">{folder.embeddingModel}</span>
                      </div>
                    )}
                    {typeFilters.length > 0 && (
                      <div className="col-span-2">
                        <span className="text-terminal-muted">{t("fileTypeFilters")}</span>{" "}
                        <span className="text-terminal-dark">{typeFilters.join(", ")}</span>
                      </div>
                    )}
                    {includeExts.length > 0 && (
                      <div className="col-span-2">
                        <span className="text-terminal-muted">{t("fileExtensions")}</span>{" "}
                        <span className="text-terminal-dark">{includeExts.join(", ")}</span>
                      </div>
                    )}
                    {excludeGlobs.length > 0 && (
                      <div className="col-span-2">
                        <span className="text-terminal-muted">{t("excludePatterns")}</span>{" "}
                        <span className="text-terminal-dark">{excludeGlobs.join(", ")}</span>
                      </div>
                    )}
                    {Object.keys(skipReasons).length > 0 && (
                      <div className="col-span-2">
                        <span className="text-terminal-muted">{t("skipReasons")}</span>{" "}
                        <span className="text-terminal-dark">
                          {Object.entries(skipReasons).map(([reason, count]) => `${reason}: ${count}`).join(", ")}
                        </span>
                      </div>
                    )}
                    {Object.keys(runMetadata).length > 0 && (
                      <div className="col-span-2">
                        <span className="text-terminal-muted">{t("lastRunMetadata")}</span>{" "}
                        <span className="text-terminal-dark">{JSON.stringify(runMetadata)}</span>
                      </div>
                    )}
                    {syncMode === "auto" && (
                      <div className="col-span-2 rounded border border-terminal-amber/30 bg-terminal-amber/10 px-2 py-1 text-[10px] font-mono text-terminal-amber">
                        {t("autoModeWarning")}
                      </div>
                    )}
                  </div>
                  {folder.lastError && (
                    <p className="text-xs font-mono text-destructive">{t("error")} {folder.lastError}</p>
                  )}
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}

      {folders.length === 0 && !showAddForm && (
        <div className="text-center py-6">
          <FolderIcon className="w-12 h-12 mx-auto text-terminal-muted/50 mb-2" />
          <p className="font-mono text-sm text-terminal-muted">{t("noFolders")}</p>
          <p className="font-mono text-xs text-terminal-muted mt-1">
            {t("noFoldersDescription")}
          </p>
        </div>
      )}

      {/* Add Folder Review Page */}
      {showAddForm ? (
        <div className="rounded border border-terminal-border bg-terminal-cream/30 p-4 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h3 className="font-mono text-sm font-semibold text-terminal-dark flex items-center gap-2">
              <FolderIcon className="w-4 h-4 text-terminal-green" />
              {t("reviewSetup")}
            </h3>
            <button
              onClick={resetForm}
              className="p-1 hover:bg-terminal-dark/10 rounded text-terminal-muted hover:text-terminal-dark transition-colors"
            >
              <XCircleIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Folder path: display card (Electron) or text input (web) */}
          {isElectron && newFolderPath ? (
            <div className="rounded border border-terminal-border bg-background p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-semibold text-terminal-dark truncate">
                    {newFolderPath.split(/[/\\]/).pop()}
                  </p>
                  <p className="font-mono text-xs text-terminal-muted truncate" title={newFolderPath}>
                    {newFolderPath}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleOpenFolderPicker}
                  className="shrink-0 font-mono text-xs text-terminal-muted hover:text-terminal-dark"
                >
                  {t("changeFolder")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="font-mono text-sm text-terminal-dark">{t("folderPath")}</Label>
              <Input
                value={newFolderPath}
                onChange={(e) => setNewFolderPath(e.target.value)}
                placeholder={t("folderPathPlaceholder")}
                className="font-mono text-sm"
                autoFocus
              />
              <p className="text-xs font-mono text-terminal-muted">{t("folderPathTip")}</p>
            </div>
          )}

          {/* Folder analysis */}
          {isAnalyzing && (
            <div className="flex items-center gap-2 py-1 text-sm font-mono text-terminal-muted">
              <Loader2Icon className="w-4 h-4 animate-spin" />
              {t("analyzing")}
            </div>
          )}
          {folderAnalysis && !isAnalyzing && (
            <div className="rounded bg-terminal-green/10 border border-terminal-green/30 p-3">
              <div className="flex items-center gap-3">
                <CheckCircleIcon className="w-5 h-5 text-terminal-green shrink-0" />
                <div>
                  <p className="font-mono text-sm font-semibold text-terminal-dark">
                    {folderAnalysis.fileCountLimited ? "1000+" : folderAnalysis.fileCountPreview}{" "}
                    {t("filesToIndex")}
                  </p>
                  {folderAnalysis.detectedPatterns.length > 0 && (
                    <p className="font-mono text-xs text-terminal-muted">
                      {folderAnalysis.detectedPatterns.length} {t("ignorePatternsDetected")}
                    </p>
                  )}
                </div>
              </div>
              {(folderAnalysis.largeFileCount ?? 0) > 0 && (
                <div className="mt-2 rounded bg-terminal-amber/10 border border-terminal-amber/30 p-2">
                  <div className="flex items-start gap-2">
                    <AlertCircleIcon className="w-4 h-4 text-terminal-amber shrink-0 mt-0.5" />
                    <div className="text-xs font-mono">
                      <span className="text-terminal-amber font-semibold">
                        {folderAnalysis.largeFileCount}{" "}
                        {t("largeFilesWillBeSkipped", { maxLines: folderAnalysis.maxFileLines ?? 3000 })}
                      </span>
                      {folderAnalysis.largeFileExamples && folderAnalysis.largeFileExamples.length > 0 && (
                        <div className="text-terminal-muted mt-1">
                          {folderAnalysis.largeFileExamples.join(", ")}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          {analysisError && !isAnalyzing && !folderAnalysis && newFolderPath.trim() && (
            <div className="rounded bg-terminal-amber/10 border border-terminal-amber/30 p-3">
              <div className="flex items-center gap-2">
                <AlertCircleIcon className="w-4 h-4 text-terminal-amber" />
                <span className="font-mono text-xs text-terminal-dark">{analysisError}</span>
              </div>
              <p className="font-mono text-xs text-terminal-muted mt-1">{t("verifyLater")}</p>
            </div>
          )}

          {/* Display Name */}
          <div>
            <Label className="font-mono text-sm text-terminal-dark">{t("displayName")}</Label>
            <Input
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
              placeholder={t("displayNamePlaceholder")}
              className="mt-1 font-mono"
            />
          </div>

          {/* Recursive checkbox */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="recursive"
              checked={newRecursive}
              onCheckedChange={(checked) => setNewRecursive(checked === true)}
            />
            <Label htmlFor="recursive" className="font-mono text-sm text-terminal-dark cursor-pointer">
              {t("includeSubfolders")}
            </Label>
          </div>

          {/* Indexing setup */}
          <div className="rounded border border-terminal-border bg-terminal-cream/40 p-3 space-y-2">
            <div className="font-mono text-xs text-terminal-muted">{t("indexingControls")}</div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={newFolderMode === "simple" ? "default" : "outline"}
                className="font-mono text-xs"
                onClick={() => setNewFolderMode("simple")}
              >
                {t("simpleMode")}
              </Button>
              <Button
                type="button"
                variant={newFolderMode === "advanced" ? "default" : "outline"}
                className="font-mono text-xs"
                onClick={() => setNewFolderMode("advanced")}
              >
                {t("advancedMode")}
              </Button>
            </div>
            <p className="font-mono text-xs text-terminal-muted">
              {newFolderMode === "simple" ? t("simpleModeHint") : t("advancedModeHint")}
            </p>
            {newFolderMode === "simple" && (
              <div className="rounded border border-terminal-green/30 bg-terminal-green/10 px-2 py-1">
                <p className="font-mono text-[10px] text-terminal-green">{t("simpleModeBehavior")}</p>
              </div>
            )}
          </div>

          {/* Advanced Options Toggle */}
          <button
            type="button"
            onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
            className="flex items-center gap-1 font-mono text-xs text-terminal-muted hover:text-terminal-dark transition-colors"
          >
            {showAdvancedOptions ? (
              <ChevronUpIcon className="w-3 h-3" />
            ) : (
              <ChevronDownIcon className="w-3 h-3" />
            )}
            {t("advancedOptions")}
          </button>

          {/* Advanced Options */}
          {showAdvancedOptions && (
            <div className="space-y-3 pl-4 border-l-2 border-terminal-border">
              {newFolderMode === "advanced" && (
                <>
                  <div>
                    <Label className="font-mono text-xs text-terminal-muted">{t("indexingMode")}</Label>
                    <select
                      value={newIndexingMode}
                      onChange={(e) => setNewIndexingMode(e.target.value as IndexingMode)}
                      className="mt-1 w-full rounded border border-terminal-border bg-background px-2 py-1 font-mono text-xs"
                    >
                      <option value="auto">{t("modeAuto")}</option>
                      <option value="full">{t("modeFull")}</option>
                      <option value="files-only">{t("modeFilesOnly")}</option>
                    </select>
                  </div>
                  <div>
                    <Label className="font-mono text-xs text-terminal-muted">{t("syncMode")}</Label>
                    <select
                      value={newSyncMode}
                      onChange={(e) => setNewSyncMode(e.target.value as SyncMode)}
                      className="mt-1 w-full rounded border border-terminal-border bg-background px-2 py-1 font-mono text-xs"
                    >
                      <option value="auto">{t("modeAuto")}</option>
                      <option value="manual">{t("modeManual")}</option>
                      <option value="scheduled">{t("modeScheduled")}</option>
                      <option value="triggered">{t("modeTriggered")}</option>
                    </select>
                  </div>
                  <div>
                    <Label className="font-mono text-xs text-terminal-muted">{t("syncCadenceMinutes")}</Label>
                    <Input
                      value={newSyncCadenceMinutes}
                      onChange={(e) => setNewSyncCadenceMinutes(e.target.value)}
                      placeholder="60"
                      className="mt-1 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <Label className="font-mono text-xs text-terminal-muted">{t("maxFileSizeMb")}</Label>
                    <Input
                      value={newMaxFileSizeMB}
                      onChange={(e) => setNewMaxFileSizeMB(e.target.value)}
                      placeholder="10"
                      className="mt-1 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <Label className="font-mono text-xs text-terminal-muted">{t("fileTypeFilters")}</Label>
                    <Input
                      value={newFileTypeFilters}
                      onChange={(e) => setNewFileTypeFilters(e.target.value)}
                      placeholder=".md,.ts,.tsx"
                      className="mt-1 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <Label className="font-mono text-xs text-terminal-muted">{t("chunkPreset")}</Label>
                    <select
                      value={newChunkPreset}
                      onChange={(e) => setNewChunkPreset(e.target.value as ChunkPreset)}
                      className="mt-1 w-full rounded border border-terminal-border bg-background px-2 py-1 font-mono text-xs"
                    >
                      <option value="balanced">{t("chunkBalanced")}</option>
                      <option value="small">{t("chunkSmall")}</option>
                      <option value="large">{t("chunkLarge")}</option>
                      <option value="custom">{t("chunkCustom")}</option>
                    </select>
                  </div>
                  {newChunkPreset === "custom" && (
                    <>
                      <div>
                        <Label className="font-mono text-xs text-terminal-muted">{t("chunkSizeOverride")}</Label>
                        <Input
                          value={newChunkSizeOverride}
                          onChange={(e) => setNewChunkSizeOverride(e.target.value)}
                          placeholder="1200"
                          className="mt-1 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <Label className="font-mono text-xs text-terminal-muted">{t("chunkOverlapOverride")}</Label>
                        <Input
                          value={newChunkOverlapOverride}
                          onChange={(e) => setNewChunkOverlapOverride(e.target.value)}
                          placeholder="200"
                          className="mt-1 font-mono text-xs"
                        />
                      </div>
                    </>
                  )}
                  <div>
                    <Label className="font-mono text-xs text-terminal-muted">{t("reindexPolicy")}</Label>
                    <select
                      value={newReindexPolicy}
                      onChange={(e) => setNewReindexPolicy(e.target.value as ReindexPolicy)}
                      className="mt-1 w-full rounded border border-terminal-border bg-background px-2 py-1 font-mono text-xs"
                    >
                      <option value="smart">{t("reindexSmart")}</option>
                      <option value="always">{t("reindexAlways")}</option>
                      <option value="never">{t("reindexNever")}</option>
                    </select>
                    {newReindexPolicy === "smart" && (
                      <p className="mt-1 font-mono text-[10px] text-terminal-muted">{t("reindexSmartDescription")}</p>
                    )}
                  </div>
                </>
              )}
              <div className="flex items-center gap-2">
                <Checkbox
                  id="recommended-excludes"
                  checked={useRecommendedExcludes}
                  onCheckedChange={(checked) => toggleRecommendedExcludes(checked === true)}
                />
                <Label htmlFor="recommended-excludes" className="font-mono text-xs text-terminal-dark cursor-pointer">
                  {t("recommendedExcludes")}
                </Label>
              </div>
              <div>
                <Label className="font-mono text-xs text-terminal-muted">{t("fileExtensions")}</Label>
                <Input
                  value={newExtensions}
                  onChange={(e) => setNewExtensions(e.target.value)}
                  placeholder=".txt,.md,.json"
                  className="mt-1 font-mono text-xs"
                />
              </div>
              <div>
                <Label className="font-mono text-xs text-terminal-muted">
                  {t("excludePatterns")}
                </Label>
                <Input
                  value={newExcludePatterns}
                  onChange={(e) => setNewExcludePatterns(e.target.value)}
                  placeholder="node_modules,.git"
                  className="mt-1 font-mono text-xs"
                />
                {folderAnalysis?.detectedPatterns && folderAnalysis.detectedPatterns.length > 0 && (
                  <p className="text-xs font-mono text-terminal-muted mt-1">
                    {t("patternsIncluded")}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2 border-t border-terminal-border">
            <Button variant="outline" onClick={resetForm} className="font-mono">
              {t("cancel")}
            </Button>
            <Button
              onClick={handleAddFolder}
              disabled={isAdding || !newFolderPath.trim() || isAnalyzing}
              className={cn(
                "ml-auto gap-2 bg-terminal-green hover:bg-terminal-green/90 text-white font-mono transition-all",
                newFolderPath.trim() && !isAdding && !isAnalyzing && folderAnalysis &&
                  "ring-2 ring-terminal-green/50 ring-offset-2 ring-offset-terminal-cream shadow-lg shadow-terminal-green/20"
              )}
            >
              {isAdding ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <PlusIcon className="w-4 h-4" />}
              {t("addFolder")}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          onClick={handleOpenFolderPicker}
          disabled={isPickingFolder}
          className="w-full gap-2 font-mono border-dashed"
        >
          {isPickingFolder ? (
            <Loader2Icon className="w-4 h-4 animate-spin" />
          ) : (
            <FolderIcon className="w-4 h-4" />
          )}
          {t("addFolderToIndex")}
        </Button>
      )}
    </div>
  );
}
