"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FolderIcon,
  PlusIcon,
  Loader2Icon,
  CheckCircleIcon,
  AlertCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  XCircleIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { IndexingMode, SyncMode, ChunkPreset, ReindexPolicy, FolderAnalysis } from "./folder-sync-types";
import { cn } from "@/lib/utils";

interface FolderSyncAddFormProps {
  isElectron: boolean;
  newFolderPath: string;
  setNewFolderPath: (v: string) => void;
  newDisplayName: string;
  setNewDisplayName: (v: string) => void;
  newRecursive: boolean;
  setNewRecursive: (v: boolean) => void;
  newExtensions: string;
  setNewExtensions: (v: string) => void;
  newExcludePatterns: string;
  setNewExcludePatterns: (v: string) => void;
  newFolderMode: "simple" | "advanced";
  setNewFolderMode: (v: "simple" | "advanced") => void;
  newIndexingMode: IndexingMode;
  setNewIndexingMode: (v: IndexingMode) => void;
  newSyncMode: SyncMode;
  setNewSyncMode: (v: SyncMode) => void;
  newSyncCadenceMinutes: string;
  setNewSyncCadenceMinutes: (v: string) => void;
  newFileTypeFilters: string;
  setNewFileTypeFilters: (v: string) => void;
  newMaxFileSizeMB: string;
  setNewMaxFileSizeMB: (v: string) => void;
  newChunkPreset: ChunkPreset;
  setNewChunkPreset: (v: ChunkPreset) => void;
  newChunkSizeOverride: string;
  setNewChunkSizeOverride: (v: string) => void;
  newChunkOverlapOverride: string;
  setNewChunkOverlapOverride: (v: string) => void;
  newReindexPolicy: ReindexPolicy;
  setNewReindexPolicy: (v: ReindexPolicy) => void;
  useRecommendedExcludes: boolean;
  onToggleRecommendedExcludes: (checked: boolean) => void;
  showAdvancedOptions: boolean;
  setShowAdvancedOptions: (v: boolean) => void;
  isAdding: boolean;
  isAnalyzing: boolean;
  folderAnalysis: FolderAnalysis | null;
  analysisError: string | null;
  onAddFolder: () => void;
  onCancel: () => void;
  onOpenFolderPicker: () => void;
}

export function FolderSyncAddForm({
  isElectron,
  newFolderPath,
  setNewFolderPath,
  newDisplayName,
  setNewDisplayName,
  newRecursive,
  setNewRecursive,
  newExtensions,
  setNewExtensions,
  newExcludePatterns,
  setNewExcludePatterns,
  newFolderMode,
  setNewFolderMode,
  newIndexingMode,
  setNewIndexingMode,
  newSyncMode,
  setNewSyncMode,
  newSyncCadenceMinutes,
  setNewSyncCadenceMinutes,
  newFileTypeFilters,
  setNewFileTypeFilters,
  newMaxFileSizeMB,
  setNewMaxFileSizeMB,
  newChunkPreset,
  setNewChunkPreset,
  newChunkSizeOverride,
  setNewChunkSizeOverride,
  newChunkOverlapOverride,
  setNewChunkOverlapOverride,
  newReindexPolicy,
  setNewReindexPolicy,
  useRecommendedExcludes,
  onToggleRecommendedExcludes,
  showAdvancedOptions,
  setShowAdvancedOptions,
  isAdding,
  isAnalyzing,
  folderAnalysis,
  analysisError,
  onAddFolder,
  onCancel,
  onOpenFolderPicker,
}: FolderSyncAddFormProps) {
  const t = useTranslations("folderSync");

  return (
    <div className="rounded border border-terminal-border bg-terminal-cream/30 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-sm font-semibold text-terminal-dark flex items-center gap-2">
          <FolderIcon className="w-4 h-4 text-terminal-green" />
          {t("reviewSetup")}
        </h3>
        <button
          onClick={onCancel}
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
              onClick={onOpenFolderPicker}
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
              onCheckedChange={(checked) => onToggleRecommendedExcludes(checked === true)}
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
        <Button variant="outline" onClick={onCancel} className="font-mono">
          {t("cancel")}
        </Button>
        <Button
          onClick={onAddFolder}
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
  );
}
