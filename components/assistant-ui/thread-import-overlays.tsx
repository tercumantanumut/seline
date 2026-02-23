"use client";

import type { FC } from "react";
import {
  PaperclipIcon,
  CheckCircleIcon,
  XCircleIcon,
  Loader2Icon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useTranslations } from "next-intl";
import type { CustomComfyUIInput } from "@/lib/comfyui/custom/types";
import type { ComfyWorkflowImportPreview } from "./thread-drop-utils";
import {
  getDisplayFileName,
  isCheckedValue,
  getInputCategory,
  isCriticalInput,
} from "./thread-drop-utils";

// ── Drag overlay ──────────────────────────────────────────────────────────────

interface DragOverlayProps {
  isDragging: boolean;
  isImportingSkill: boolean;
}

export const DragOverlay: FC<DragOverlayProps> = ({ isDragging, isImportingSkill }) => {
  const t = useTranslations("assistantUi");
  if (!isDragging || isImportingSkill) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-terminal-dark/40 backdrop-blur-sm pointer-events-none"
      onDragEnter={(e) => e.stopPropagation()}
      onDragLeave={(e) => e.stopPropagation()}
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-terminal-green bg-terminal-cream/95 px-12 py-10 shadow-2xl">
        <PaperclipIcon className="size-10 text-terminal-green animate-bounce" />
        <span className="text-lg font-semibold font-mono text-terminal-dark">
          {t("composer.dropHint")}
        </span>
        <span className="text-sm font-mono text-terminal-muted">
          {t("composer.dropHintSubtext")}
        </span>
      </div>
    </div>
  );
};

// ── Skill import progress overlay ─────────────────────────────────────────────

interface SkillImportOverlayProps {
  isImportingSkill: boolean;
  skillImportPhase: "idle" | "uploading" | "parsing" | "importing" | "success" | "error";
  skillImportProgress: number;
  skillImportName: string | null;
  skillImportError: string | null;
  importResultDetail: string | null;
}

export const SkillImportOverlay: FC<SkillImportOverlayProps> = ({
  isImportingSkill,
  skillImportPhase,
  skillImportProgress,
  skillImportName,
  skillImportError,
  importResultDetail,
}) => {
  const t = useTranslations("assistantUi");
  if (!isImportingSkill || skillImportPhase === "idle") return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-terminal-dark/40 backdrop-blur-sm pointer-events-none">
      <div className={cn(
        "flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed px-12 py-10 shadow-2xl min-w-[320px] bg-terminal-cream/95",
        skillImportPhase === "success"
          ? "border-terminal-green"
          : skillImportPhase === "error"
            ? "border-red-400"
            : "border-terminal-green"
      )}>
        {/* Phase icon */}
        {(skillImportPhase === "uploading" || skillImportPhase === "parsing" || skillImportPhase === "importing") && (
          <Loader2Icon className="size-10 text-terminal-green animate-spin" />
        )}
        {skillImportPhase === "success" && (
          <CheckCircleIcon className="size-10 text-terminal-green" />
        )}
        {skillImportPhase === "error" && (
          <XCircleIcon className="size-10 text-red-500" />
        )}

        {/* Phase label */}
        <span className="text-lg font-semibold font-mono text-terminal-dark">
          {skillImportPhase === "uploading" && t("skillImportOverlay.uploading")}
          {skillImportPhase === "parsing" && t("skillImportOverlay.parsing")}
          {skillImportPhase === "importing" && t("skillImportOverlay.importing")}
          {skillImportPhase === "success" && t("skillImportOverlay.success")}
          {skillImportPhase === "error" && t("skillImportOverlay.error")}
        </span>

        {/* File name */}
        {skillImportName && (
          <span className="text-sm font-mono text-terminal-muted truncate max-w-[280px]">
            {skillImportName}
          </span>
        )}

        {/* Progress bar */}
        {(skillImportPhase === "uploading" || skillImportPhase === "parsing" || skillImportPhase === "importing") && (
          <div className="w-full max-w-xs space-y-1.5">
            <Progress value={skillImportProgress} className="h-2" />
            <p className="text-xs text-terminal-muted font-mono text-center">{skillImportProgress}%</p>
          </div>
        )}

        {/* Error detail */}
        {skillImportPhase === "error" && skillImportError && (
          <p className="text-sm text-red-500 font-mono max-w-md text-center">{skillImportError}</p>
        )}

        {/* Success subtitle */}
        {skillImportPhase === "success" && skillImportName && (
          <p className="text-sm font-mono text-terminal-muted">{t("skillImportOverlay.readyToUse", { name: skillImportName })}</p>
        )}

        {/* Plugin component detail */}
        {skillImportPhase === "success" && importResultDetail && (
          <p className="text-xs font-mono text-terminal-green/80">{importResultDetail}</p>
        )}
      </div>
    </div>
  );
};

// ── ComfyUI workflow import dialog ────────────────────────────────────────────

interface ComfyImportDialogProps {
  open: boolean;
  previews: ComfyWorkflowImportPreview[];
  loading: boolean;
  selected: Record<string, boolean>;
  nameOverrides: Record<string, string>;
  expanded: Record<string, boolean>;
  submitting: boolean;
  selectedCount: number;
  validCount: number;
  agentName: string;
  onOpenChange: (open: boolean) => void;
  onReset: () => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onToggleSelect: (fileName: string, checked: boolean) => void;
  onNameChange: (fileName: string, name: string) => void;
  onToggleExpand: (fileName: string) => void;
  onSubmit: () => void;
}

export const ComfyImportDialog: FC<ComfyImportDialogProps> = ({
  open,
  previews,
  loading,
  selected,
  nameOverrides,
  expanded,
  submitting,
  selectedCount,
  validCount,
  agentName,
  onOpenChange,
  onReset,
  onSelectAll,
  onClearSelection,
  onToggleSelect,
  onNameChange,
  onToggleExpand,
  onSubmit,
}) => {
  const t = useTranslations("assistantUi");
  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onReset();
          return;
        }
        onOpenChange(true);
      }}
    >
      <DialogContent className="w-[calc(100vw-1rem)] max-w-4xl bg-terminal-cream border-terminal-border p-3 sm:p-6">
        <DialogHeader>
          <DialogTitle className="font-mono text-terminal-dark">{t("comfyuiImport.title")}</DialogTitle>
          <DialogDescription className="font-mono text-terminal-muted">
            {t("comfyuiImport.description", { agent: agentName })}
          </DialogDescription>
        </DialogHeader>

        {!loading && previews.length > 0 && (
          <div className="rounded border border-terminal-border/70 bg-terminal-bg/50 px-3 py-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-mono text-terminal-muted">
                {t("comfyuiImport.selectedCount", { count: selectedCount })}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  disabled={submitting || validCount === 0}
                  onClick={onSelectAll}
                >
                  {t("comfyuiImport.selectAll")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  disabled={submitting}
                  onClick={onClearSelection}
                >
                  {t("comfyuiImport.clearSelection")}
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3 max-h-[62vh] overflow-y-auto pr-1">
          {loading && (
            <div className="flex items-center gap-2 rounded border border-terminal-border/70 bg-terminal-bg/40 p-3 text-sm font-mono text-terminal-muted">
              <Loader2Icon className="size-4 animate-spin" />
              <span>{t("comfyuiImport.analyzing")}</span>
            </div>
          )}

          {!loading && previews.length === 0 && (
            <p className="rounded border border-terminal-border/70 bg-terminal-bg/40 p-3 text-sm font-mono text-terminal-muted">
              {t("comfyuiImport.noWorkflowsFound")}
            </p>
          )}

          {!loading && previews.map((preview) => {
            const isSelected = Boolean(selected[preview.fileName]);
            const hasError = Boolean(preview.error);
            const disableRow = hasError;
            const highlightedInputs = preview.inputs.filter((input) =>
              preview.importantInputIds.includes(input.id)
            );
            const displayInputs = (highlightedInputs.length > 0 ? highlightedInputs : preview.inputs)
              .slice(0, 8);
            const shouldCollapseInputs = displayInputs.length > 6;
            const isExpanded = Boolean(expanded[preview.fileName]);
            const visibleInputs = shouldCollapseInputs && !isExpanded
              ? displayInputs.slice(0, 4)
              : displayInputs;
            const groupedInputs: Record<"prompt" | "media" | "generation" | "advanced", CustomComfyUIInput[]> = {
              prompt: [],
              media: [],
              generation: [],
              advanced: [],
            };
            for (const input of visibleInputs) {
              groupedInputs[getInputCategory(input)].push(input);
            }

            return (
              <div
                key={preview.fileName}
                className={cn(
                  "rounded border p-3 space-y-3",
                  disableRow
                    ? "border-red-300/50 bg-red-50/50"
                    : "border-terminal-border/70 bg-terminal-bg/40"
                )}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-2 min-w-0">
                    <Checkbox
                      checked={isSelected}
                      disabled={disableRow || submitting}
                      onCheckedChange={(checked) => {
                        onToggleSelect(preview.fileName, isCheckedValue(checked));
                      }}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold font-mono text-terminal-dark truncate">
                        {getDisplayFileName(preview.fileName)}
                      </p>
                      <p className="text-xs font-mono text-terminal-muted break-all">{preview.fileName}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1 text-xs font-mono text-terminal-muted">
                    <Badge variant="outline" className="text-[10px] px-2 py-0.5">{t("comfyuiImport.nodeCount", { count: preview.nodeCount })}</Badge>
                    <Badge variant="outline" className="text-[10px] px-2 py-0.5">{t("comfyuiImport.inputCount", { count: preview.inputCount })}</Badge>
                    <Badge variant="outline" className="text-[10px] px-2 py-0.5">{t("comfyuiImport.outputCount", { count: preview.outputCount })}</Badge>
                  </div>
                </div>

                {preview.error ? (
                  <p className="text-xs font-mono text-red-600">{preview.error}</p>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-mono text-terminal-muted">
                        {t("comfyuiImport.workflowNameLabel")}
                      </Label>
                      <Input
                        value={nameOverrides[preview.fileName] || ""}
                        onChange={(event) => {
                          onNameChange(preview.fileName, event.target.value);
                        }}
                        disabled={!isSelected || submitting}
                        className="h-8 font-mono text-sm"
                      />
                    </div>

                    <p className="text-xs font-mono text-terminal-muted">{preview.summary}</p>

                    <div className="space-y-2">
                      {([
                        ["prompt", t("comfyuiImport.groupPrompt")],
                        ["media", t("comfyuiImport.groupMedia")],
                        ["generation", t("comfyuiImport.groupGeneration")],
                        ["advanced", t("comfyuiImport.groupAdvanced")],
                      ] as const)
                        .filter(([group]) => groupedInputs[group].length > 0)
                        .map(([group, label]) => (
                          <div key={`${preview.fileName}-${group}`} className="space-y-1">
                            <p className="text-[11px] uppercase tracking-wide font-mono text-terminal-muted/80">{label}</p>
                            <div className="flex flex-wrap gap-1.5">
                              {groupedInputs[group].map((input) => (
                                <div
                                  key={input.id}
                                  className="inline-flex items-center gap-1 rounded-md border border-terminal-border/70 bg-terminal-cream px-2 py-1"
                                >
                                  <span className="text-[11px] font-mono text-terminal-dark">{input.name}</span>
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">{input.type}</Badge>
                                  {input.required ? (
                                    <Badge className="text-[10px] px-1.5 py-0 bg-red-500 text-white hover:bg-red-500">{t("comfyuiImport.requiredBadge")}</Badge>
                                  ) : isCriticalInput(input) ? (
                                    <Badge className="text-[10px] px-1.5 py-0 bg-amber-500 text-black hover:bg-amber-500">{t("comfyuiImport.criticalBadge")}</Badge>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}

                      {displayInputs.length === 0 && (
                        <p className="text-xs font-mono text-terminal-muted">{t("comfyuiImport.noPreviewInputs")}</p>
                      )}

                      {shouldCollapseInputs && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => onToggleExpand(preview.fileName)}
                        >
                          {isExpanded
                            ? t("comfyuiImport.showLessInputs")
                            : t("comfyuiImport.showMoreInputs", { count: displayInputs.length - 4 })}
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="text-xs font-mono text-terminal-muted mr-auto">
            {t("comfyuiImport.selectedCount", { count: selectedCount })}
          </p>
          <Button
            variant="outline"
            onClick={onReset}
            disabled={submitting}
            className="w-full sm:w-auto"
          >
            {t("comfyuiImport.cancel")}
          </Button>
          <Button
            onClick={onSubmit}
            disabled={submitting || selectedCount === 0}
            className="w-full sm:w-auto"
          >
            {submitting ? t("comfyuiImport.importing") : t("comfyuiImport.importAction")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
