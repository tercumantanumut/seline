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

interface SyncFolder {
  id: string;
  folderPath: string;
  displayName: string | null;
  recursive: boolean;
  includeExtensions: string;
  excludePatterns: string;
  status: "pending" | "syncing" | "synced" | "error" | "paused";
  lastSyncedAt: string | null;
  lastError: string | null;
  fileCount: number | null;
  chunkCount: number | null;
  embeddingModel: string | null;
  indexingMode: "files-only" | "full" | "auto";
  isPrimary: boolean;
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

export function FolderSyncManager({ characterId, className, compact = false }: FolderSyncManagerProps) {
  const t = useTranslations("folderSync");
  const [folders, setFolders] = useState<SyncFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [syncingFolderId, setSyncingFolderId] = useState<string | null>(null);
  const [removingFolderId, setRemovingFolderId] = useState<string | null>(null);
  const [expandedFolderId, setExpandedFolderId] = useState<string | null>(null);
  const [reindexing, setReindexing] = useState(false);

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
      const response = await fetch(`/api/vector-sync?characterId=${characterId}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to load folders");
      }
      const data = await response.json();
      setFolders(data.folders || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load folders");
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
      await fetch("/api/vector-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", folderId }),
      });
      // Give the server a moment to propagate, then reload
      setTimeout(loadFolders, 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel sync");
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
      const response = await fetch("/api/folder-picker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folderPath: path.trim(),
          includeExtensions: newExtensions.split(",").map((e) => e.trim()).filter(Boolean),
          excludePatterns: newExcludePatterns.split(",").map((p) => p.trim()).filter(Boolean),
          recursive: newRecursive,
        }),
      });

      if (response.ok) {
        const data = await response.json();
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
        const data = await response.json();
        setFolderAnalysis(null);
        // Set analysis error but don't block adding - user might know the path is correct
        setAnalysisError(data.error || "Could not verify folder");
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

  const handleAddFolder = async () => {
    if (!newFolderPath.trim()) return;

    setIsAdding(true);
    try {
      const response = await fetch("/api/vector-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          characterId,
          folderPath: newFolderPath.trim(),
          displayName: newDisplayName.trim() || undefined,
          recursive: newRecursive,
          includeExtensions: newExtensions.split(",").map((e) => e.trim()).filter(Boolean),
          excludePatterns: newExcludePatterns.split(",").map((p) => p.trim()).filter(Boolean),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to add folder");
      }

      // Reset form and reload folders
      resetForm();
      await loadFolders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add folder");
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
      const response = await fetch(`/api/vector-sync?folderId=${folderId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to remove folder");
      }

      await loadFolders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove folder");
    } finally {
      setRemovingFolderId(null);
    }
  };

  const handleSyncFolder = async (folderId: string) => {
    setSyncingFolderId(folderId);
    try {
      const response = await fetch("/api/vector-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync", folderId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to sync folder");
      }

      await loadFolders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync folder");
    } finally {
      setSyncingFolderId(null);
    }
  };

  const handleSetPrimary = async (folderId: string) => {
    try {
      const response = await fetch("/api/vector-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set-primary", folderId, characterId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to set primary folder");
      }

      await loadFolders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set primary folder");
    }
  };

  const handleReindexAll = async () => {
    if (!window.confirm(t("reindexConfirm"))) {
      return;
    }

    setReindexing(true);
    try {
      const response = await fetch("/api/vector-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reindex", characterId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to reindex folders");
      }

      await loadFolders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reindex folders");
    } finally {
      setReindexing(false);
    }
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
    <div className={cn("space-y-4", className)}>
      {error && (
        <div className="rounded border border-destructive/30 bg-destructive/10 p-3 font-mono text-sm text-destructive">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">{t("dismiss")}</button>
        </div>
      )}

      {!compact && folders.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded border border-terminal-border bg-terminal-cream/30 p-3">
          <Button
            variant="outline"
            onClick={handleReindexAll}
            disabled={reindexing}
            className="gap-2 font-mono"
          >
            {reindexing ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <RefreshCwIcon className="w-4 h-4" />}
            {reindexing ? t("reindexing") : t("reindexAll")}
          </Button>
          <span className="font-mono text-xs text-terminal-muted">
            {t("reindexHint")}
          </span>
        </div>
      )}

      {/* Folder List */}
      {folders.length > 0 && (
        <div className="space-y-2">
          {folders.map((folder) => (
            <div
              key={folder.id}
              className="rounded border border-terminal-border bg-terminal-cream/50 p-3"
            >
              <div className="flex items-center gap-3">
                <FolderIcon className="w-5 h-5 text-terminal-green flex-shrink-0" />
                <div className="flex-1 min-w-0 overflow-hidden">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-mono text-sm text-terminal-dark truncate">
                      {folder.displayName || folder.folderPath.split(/[/\\]/).pop()}
                    </p>
                    {folder.isPrimary && (
                      <span className="text-[10px] bg-terminal-green/10 text-terminal-green border border-terminal-green/20 px-1.5 py-0 rounded font-mono uppercase font-bold tracking-wider">
                        Primary
                      </span>
                    )}
                  </div>
                  <p className="font-mono text-xs text-terminal-muted truncate" title={folder.folderPath}>
                    {folder.folderPath}
                  </p>
                </div>
                <div className="flex items-center gap-2">
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
                  {!folder.isPrimary && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleSetPrimary(folder.id)}
                      title="Set as primary folder"
                      className="h-8 w-8 text-terminal-muted hover:text-terminal-amber hover:bg-terminal-amber/10"
                    >
                      <StarIcon className="w-4 h-4" />
                    </Button>
                  )}
                  {folder.status === "syncing" ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleCancelSync(folder.id)}
                      title="Cancel sync"
                      className="h-8 w-8 text-destructive hover:text-destructive/80 hover:bg-destructive/10"
                    >
                      <XCircleIcon className="w-4 h-4" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleSyncFolder(folder.id)}
                      disabled={syncingFolderId === folder.id}
                      className="h-8 w-8"
                    >
                      <RefreshCwIcon className={cn("w-4 h-4", syncingFolderId === folder.id && "animate-spin")} />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveFolder(folder.id)}
                    disabled={removingFolderId === folder.id}
                    className="h-8 w-8 text-destructive hover:text-destructive/80 hover:bg-destructive/10"
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
                      <span className="text-terminal-muted">Mode:</span>{" "}
                      <span className={cn(
                        "text-xs font-mono px-2 py-0.5 rounded",
                        folder.indexingMode === "full" && "bg-terminal-green/20 text-terminal-green",
                        folder.indexingMode === "files-only" && "bg-terminal-blue/20 text-terminal-blue",
                        folder.indexingMode === "auto" && "bg-terminal-muted/20 text-terminal-muted"
                      )}>
                        {folder.indexingMode === "full" ? "Full (with embeddings)" : folder.indexingMode === "files-only" ? "Files Only" : "Auto"}
                      </span>
                    </div>
                    {folder.embeddingModel && (
                      <div className="col-span-2">
                        <span className="text-terminal-muted">Model:</span>{" "}
                        <span className="text-terminal-dark">{folder.embeddingModel}</span>
                      </div>
                    )}
                  </div>
                  {folder.lastError && (
                    <p className="text-xs font-mono text-destructive">{t("error")} {folder.lastError}</p>
                  )}
                </div>
              )}
            </div>
          ))}
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

      {/* Add Folder Form */}
      {showAddForm ? (
        <div className="rounded border border-terminal-border bg-terminal-cream/30 p-4 space-y-4">
          {/* Form Header with Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PlusIcon className="w-4 h-4 text-terminal-green" />
              <span className="font-mono text-sm font-semibold text-terminal-dark">
                {t("formTitle")}
              </span>
            </div>
            {newFolderPath.trim() && !isAdding && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-terminal-amber/10 border border-terminal-amber/30">
                <AlertCircleIcon className="w-3 h-3 text-terminal-amber" />
                <span className="font-mono text-[10px] text-terminal-amber font-medium">
                  {t("notYetAdded")}
                </span>
              </div>
            )}
          </div>

          {/* Step Indicator */}
          <div className="flex items-center gap-2 text-xs font-mono text-terminal-muted">
            <span className={cn(
              "flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold",
              newFolderPath.trim()
                ? "bg-terminal-green text-white"
                : "bg-terminal-dark/20 text-terminal-dark"
            )}>1</span>
            <span className={newFolderPath.trim() ? "text-terminal-green" : ""}>
              {t("stepEnterPath")}
            </span>
            <span className="text-terminal-muted/50">→</span>
            <span className={cn(
              "flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold",
              "bg-terminal-dark/20 text-terminal-dark"
            )}>2</span>
            <span>{t("stepClickAdd")}</span>
          </div>

          {/* Folder Path Input */}
          <div className="space-y-2">
            <Label className="font-mono text-sm text-terminal-dark">{t("folderPath")}</Label>
            <Input
              value={newFolderPath}
              onChange={(e) => setNewFolderPath(e.target.value)}
              placeholder={t("folderPathPlaceholder")}
              className="font-mono text-sm break-all [word-break:break-all]"
              style={{ wordBreak: 'break-all' }}
            />
            <p className="text-xs font-mono text-terminal-muted">
              {t("folderPathTip")}
            </p>

            {/* Folder analysis feedback */}
            {isAnalyzing && (
              <div className="flex items-center gap-2 text-xs font-mono text-terminal-muted">
                <Loader2Icon className="w-3 h-3 animate-spin" />
                {t("analyzing")}
              </div>
            )}
            {folderAnalysis && !isAnalyzing && (
              <div className="rounded bg-terminal-green/10 border border-terminal-green/30 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircleIcon className="w-4 h-4 text-terminal-green" />
                  <span className="font-mono text-sm text-terminal-dark font-semibold">
                    {folderAnalysis.folderName}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono text-terminal-muted">
                  <div>
                    <span className="text-terminal-green">
                      {folderAnalysis.fileCountLimited ? "1000+" : folderAnalysis.fileCountPreview}
                    </span>{" "}
                    {t("filesToIndex")}
                  </div>
                  {folderAnalysis.detectedPatterns.length > 0 && (
                    <div>
                      <span className="text-terminal-green">{folderAnalysis.detectedPatterns.length}</span>{" "}
                      {t("ignorePatternsDetected")}
                    </div>
                  )}
                </div>
                {/* Warning for large files */}
                {(folderAnalysis.largeFileCount ?? 0) > 0 && (
                  <div className="rounded bg-terminal-amber/10 border border-terminal-amber/30 p-2 mt-2">
                    <div className="flex items-start gap-2">
                      <AlertCircleIcon className="w-4 h-4 text-terminal-amber flex-shrink-0 mt-0.5" />
                      <div className="text-xs font-mono">
                        <span className="text-terminal-amber font-semibold">
                          {folderAnalysis.largeFileCount}{" "}
                          {t("largeFilesWillBeSkipped", {
                            maxLines: folderAnalysis.maxFileLines ?? 3000,
                          })}
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
                  <span className="font-mono text-xs text-terminal-dark">
                    {analysisError}
                  </span>
                </div>
                <p className="font-mono text-xs text-terminal-muted mt-1">
                  {t("verifyLater")}
                </p>
              </div>
            )}
          </div>

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
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={resetForm}
              className="font-mono"
            >
              {t("cancel")}
            </Button>
            <Button
              onClick={handleAddFolder}
              disabled={isAdding || !newFolderPath.trim() || isAnalyzing}
              className={cn(
                "gap-2 bg-terminal-green hover:bg-terminal-green/90 text-white font-mono transition-all",
                // Pulse effect when path is valid and ready to add
                newFolderPath.trim() && !isAdding && !isAnalyzing && folderAnalysis &&
                "ring-2 ring-terminal-green/50 ring-offset-2 ring-offset-terminal-cream shadow-lg shadow-terminal-green/20"
              )}
            >
              {isAdding ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <PlusIcon className="w-4 h-4" />}
              {t("addFolder")}
            </Button>
          </div>

          {/* Reminder text when path is entered */}
          {newFolderPath.trim() && !isAdding && (
            <p className="text-xs font-mono text-terminal-amber text-center pt-1">
              ⚠️ {t("clickAddReminder")}
            </p>
          )}
        </div>
      ) : (
        <Button
          variant="outline"
          onClick={() => setShowAddForm(true)}
          className="w-full gap-2 font-mono border-dashed"
        >
          <FolderIcon className="w-4 h-4" />
          {t("addFolderToIndex")}
        </Button>
      )}
    </div>
  );
}
