"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { FolderIcon, Loader2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { resilientFetch, resilientPost, resilientDelete } from "@/lib/utils/resilient-fetch";
import type {
  SyncFolder,
  FolderAnalysis,
  FolderSyncManagerProps,
  IndexingMode,
  SyncMode,
  ChunkPreset,
  ReindexPolicy,
} from "./folder-sync-types";
import {
  RECOMMENDED_EXCLUDES,
  DEFAULT_EXTENSIONS,
  DEFAULT_EXCLUDE_PATTERNS,
} from "./folder-sync-types";
import { FolderItem } from "./folder-item";
import { FolderSyncAddForm } from "./folder-sync-add-form";

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

  // New folder form state
  const [newFolderPath, setNewFolderPath] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newRecursive, setNewRecursive] = useState(true);
  const [newExtensions, setNewExtensions] = useState(DEFAULT_EXTENSIONS);
  const [newExcludePatterns, setNewExcludePatterns] = useState(DEFAULT_EXCLUDE_PATTERNS);
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

  // Poll every 2 seconds while any folder is actively syncing
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
      setTimeout(loadFolders, 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errorCancelSync"));
    }
  };

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
        if (data.mergedPatterns && data.mergedPatterns.length > 0) {
          const merged = data.mergedPatterns.join(",");
          if (merged !== newExcludePatterns) {
            setNewExcludePatterns(merged);
          }
        }
        if (!newDisplayName && data.folderName) {
          setNewDisplayName(data.folderName);
        }
        setError(null);
      } else {
        setFolderAnalysis(null);
        setAnalysisError(error || "Could not verify folder");
      }
    } catch {
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
    setNewExcludePatterns(DEFAULT_EXCLUDE_PATTERNS);
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
          {folders.map((folder) => (
            <FolderItem
              key={folder.id}
              folder={folder}
              compact={compact}
              expandedFolderId={expandedFolderId}
              syncingFolderId={syncingFolderId}
              removingFolderId={removingFolderId}
              updatingFolderId={updatingFolderId}
              onToggleExpand={(id) => setExpandedFolderId(expandedFolderId === id ? null : id)}
              onSync={handleSyncFolder}
              onCancelSync={handleCancelSync}
              onRemove={handleRemoveFolder}
              onSetPrimary={handleSetPrimary}
              onToggleAutoUpdates={handleToggleAutoUpdates}
              onApplySimpleDefaults={handleApplySimpleDefaults}
            />
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

      {/* Add Folder Form / Add Button */}
      {showAddForm ? (
        <FolderSyncAddForm
          isElectron={isElectron}
          newFolderPath={newFolderPath}
          setNewFolderPath={setNewFolderPath}
          newDisplayName={newDisplayName}
          setNewDisplayName={setNewDisplayName}
          newRecursive={newRecursive}
          setNewRecursive={setNewRecursive}
          newExtensions={newExtensions}
          setNewExtensions={setNewExtensions}
          newExcludePatterns={newExcludePatterns}
          setNewExcludePatterns={setNewExcludePatterns}
          newFolderMode={newFolderMode}
          setNewFolderMode={setNewFolderMode}
          newIndexingMode={newIndexingMode}
          setNewIndexingMode={setNewIndexingMode}
          newSyncMode={newSyncMode}
          setNewSyncMode={setNewSyncMode}
          newSyncCadenceMinutes={newSyncCadenceMinutes}
          setNewSyncCadenceMinutes={setNewSyncCadenceMinutes}
          newFileTypeFilters={newFileTypeFilters}
          setNewFileTypeFilters={setNewFileTypeFilters}
          newMaxFileSizeMB={newMaxFileSizeMB}
          setNewMaxFileSizeMB={setNewMaxFileSizeMB}
          newChunkPreset={newChunkPreset}
          setNewChunkPreset={setNewChunkPreset}
          newChunkSizeOverride={newChunkSizeOverride}
          setNewChunkSizeOverride={setNewChunkSizeOverride}
          newChunkOverlapOverride={newChunkOverlapOverride}
          setNewChunkOverlapOverride={setNewChunkOverlapOverride}
          newReindexPolicy={newReindexPolicy}
          setNewReindexPolicy={setNewReindexPolicy}
          useRecommendedExcludes={useRecommendedExcludes}
          onToggleRecommendedExcludes={toggleRecommendedExcludes}
          showAdvancedOptions={showAdvancedOptions}
          setShowAdvancedOptions={setShowAdvancedOptions}
          isAdding={isAdding}
          isAnalyzing={isAnalyzing}
          folderAnalysis={folderAnalysis}
          analysisError={analysisError}
          onAddFolder={handleAddFolder}
          onCancel={resetForm}
          onOpenFolderPicker={handleOpenFolderPicker}
        />
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
