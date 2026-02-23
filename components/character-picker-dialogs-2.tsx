"use client";

import { Loader2, Check, X, GitBranchPlus, User } from "lucide-react";
import {
  Plug as PhosphorPlug,
  Trash,
} from "@phosphor-icons/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { AnimatedButton } from "@/components/ui/animated-button";
import { useTranslations } from "next-intl";
import type { CharacterSummary, WorkflowGroup } from "@/components/character-picker-types";

const Plug = PhosphorPlug;
const Trash2 = Trash;

// ==========================================================================
// AddToWorkflowDialog
// ==========================================================================

export function AddToWorkflowDialog({
  open,
  onOpenChange,
  addToWorkflowCharacter,
  availableWorkflowsByAgentId,
  selectedWorkflowId,
  setSelectedWorkflowId,
  isAddingToWorkflow,
  onConfirm,
  onClose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  addToWorkflowCharacter: CharacterSummary | null;
  availableWorkflowsByAgentId: Map<string, WorkflowGroup[]>;
  selectedWorkflowId: string;
  setSelectedWorkflowId: (v: string) => void;
  isAddingToWorkflow: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("picker");
  const tc = useTranslations("common");

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) {
        onClose();
        return;
      }
      onOpenChange(true);
    }}>
      <DialogContent className="sm:max-w-md bg-terminal-cream border border-terminal-border/60 shadow-[0_18px_48px_rgba(23,33,17,0.14)]">
        <DialogHeader>
          <DialogTitle className="font-mono text-terminal-dark flex items-center gap-2">
            <GitBranchPlus className="w-5 h-5 text-terminal-green" />
            {t("workflows.addToWorkflowDialogTitle", {
              name: addToWorkflowCharacter?.displayName || addToWorkflowCharacter?.name || "Agent",
            })}
          </DialogTitle>
          <DialogDescription className="font-mono text-terminal-muted">
            {t("workflows.addToWorkflowDialogDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 rounded-lg border border-terminal-border/50 bg-[linear-gradient(160deg,rgba(255,255,255,0.82),rgba(236,242,226,0.62))] p-3">
          <Label className="font-mono text-xs text-terminal-dark mb-1.5 block">
            {t("workflows.addToWorkflowSelectLabel")}
          </Label>
          <select
            value={selectedWorkflowId}
            onChange={(event) => setSelectedWorkflowId(event.target.value)}
            className="h-9 w-full rounded border border-terminal-border bg-white px-2 font-mono text-xs text-terminal-dark focus:border-terminal-green focus:outline-none"
            disabled={isAddingToWorkflow}
          >
            {(availableWorkflowsByAgentId.get(addToWorkflowCharacter?.id || "") || []).map((workflow) => (
              <option key={workflow.id} value={workflow.id}>
                {workflow.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <AnimatedButton
            variant="outline"
            className="font-mono"
            onClick={onClose}
            disabled={isAddingToWorkflow}
          >
            {tc("cancel")}
          </AnimatedButton>
          <AnimatedButton
            className="gap-2 bg-terminal-green hover:bg-terminal-green/90 text-white font-mono"
            onClick={onConfirm}
            disabled={isAddingToWorkflow || !selectedWorkflowId}
          >
            {isAddingToWorkflow ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("workflows.addToWorkflowAdding")}
              </>
            ) : (
              <>
                <GitBranchPlus className="w-4 h-4" />
                {t("workflows.addToWorkflowCta")}
              </>
            )}
          </AnimatedButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ==========================================================================
// IdentityEditorDialog
// ==========================================================================

export function IdentityEditorDialog({
  open,
  onOpenChange,
  identityForm,
  setIdentityForm,
  generatedPrompt,
  isSaving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  identityForm: {
    name: string;
    displayName: string;
    tagline: string;
    purpose: string;
    systemPromptOverride: string;
  };
  setIdentityForm: (form: {
    name: string;
    displayName: string;
    tagline: string;
    purpose: string;
    systemPromptOverride: string;
  }) => void;
  generatedPrompt: string;
  isSaving: boolean;
  onSave: () => void;
}) {
  const t = useTranslations("picker");
  const tc = useTranslations("common");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl bg-terminal-cream max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-terminal-border/20">
          <DialogTitle className="font-mono text-terminal-dark flex items-center gap-2">
            <User className="w-5 h-5 text-terminal-green" />
            {t("identityEditor.title")}
          </DialogTitle>
          <DialogDescription className="font-mono text-terminal-muted">
            {t("identityEditor.subtitle")}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="basic" className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-6 mt-4 grid w-auto grid-cols-2 bg-terminal-bg/20">
            <TabsTrigger value="basic" className="font-mono text-sm">
              {t("identityEditor.tabs.basic")}
            </TabsTrigger>
            <TabsTrigger value="advanced" className="font-mono text-sm">
              {t("identityEditor.tabs.advanced")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
            <div>
              <Label className="font-mono text-sm text-terminal-dark mb-1 block">
                {t("identityEditor.fields.name.label")} <span className="text-red-500">*</span>
              </Label>
              <input
                type="text"
                value={identityForm.name}
                onChange={(e) => setIdentityForm({ ...identityForm, name: e.target.value })}
                placeholder={t("identityEditor.fields.name.placeholder")}
                maxLength={100}
                className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
              />
              <p className="mt-1 font-mono text-xs text-terminal-muted">
                {t("identityEditor.fields.name.helper")}
              </p>
            </div>

            <div>
              <Label className="font-mono text-sm text-terminal-dark mb-1 block">
                {t("identityEditor.fields.displayName.label")}
              </Label>
              <input
                type="text"
                value={identityForm.displayName}
                onChange={(e) => setIdentityForm({ ...identityForm, displayName: e.target.value })}
                placeholder={t("identityEditor.fields.displayName.placeholder")}
                maxLength={100}
                className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
              />
              <p className="mt-1 font-mono text-xs text-terminal-muted">
                {t("identityEditor.fields.displayName.helper")}
              </p>
            </div>

            <div>
              <Label className="font-mono text-sm text-terminal-dark mb-1 block">
                {t("identityEditor.fields.tagline.label")}
              </Label>
              <input
                type="text"
                value={identityForm.tagline}
                onChange={(e) => setIdentityForm({ ...identityForm, tagline: e.target.value })}
                placeholder={t("identityEditor.fields.tagline.placeholder")}
                maxLength={200}
                className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
              />
              <p className="mt-1 font-mono text-xs text-terminal-muted">
                {t("identityEditor.fields.tagline.helper")}
              </p>
            </div>

            <div>
              <Label className="font-mono text-sm text-terminal-dark mb-1 block">
                {t("identityEditor.fields.purpose.label")}
              </Label>
              <textarea
                value={identityForm.purpose}
                onChange={(e) => setIdentityForm({ ...identityForm, purpose: e.target.value })}
                placeholder={t("identityEditor.fields.purpose.placeholder")}
                maxLength={2000}
                rows={6}
                className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green resize-none"
              />
              <p className="mt-1 font-mono text-xs text-terminal-muted">
                {t("identityEditor.fields.purpose.helper")} ({identityForm.purpose.length}/2000)
              </p>
            </div>
          </TabsContent>

          <TabsContent value="advanced" className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
            <div className="rounded border border-amber-200 bg-amber-50 p-3">
              <p className="font-mono text-xs text-amber-800">
                {t("identityEditor.fields.customPrompt.warning")}
              </p>
            </div>

            {generatedPrompt && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="font-mono text-sm text-terminal-dark">
                    {t("identityEditor.fields.customPrompt.currentPrompt")}
                  </Label>
                  <button
                    type="button"
                    onClick={() => setIdentityForm({ ...identityForm, systemPromptOverride: generatedPrompt })}
                    className="text-xs font-mono text-terminal-green hover:text-terminal-green/80 transition-colors flex items-center gap-1 px-2 py-1 rounded hover:bg-terminal-green/10"
                  >
                    <span>{t("identityEditor.fields.customPrompt.copyToOverride")}</span>
                  </button>
                </div>
                <div className="rounded border border-terminal-border bg-terminal-bg/10 p-3 max-h-48 overflow-y-auto">
                  <pre className="font-mono text-xs text-terminal-dark whitespace-pre-wrap break-words">
                    {generatedPrompt}
                  </pre>
                </div>
                <p className="font-mono text-xs text-terminal-muted">
                  {t("identityEditor.fields.customPrompt.currentPromptHelper")}
                </p>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="font-mono text-sm text-terminal-dark">
                  {t("identityEditor.fields.customPrompt.label")}
                </Label>
                {identityForm.systemPromptOverride.trim() && (
                  <button
                    type="button"
                    onClick={() => setIdentityForm({ ...identityForm, systemPromptOverride: "" })}
                    className="text-xs font-mono text-red-500 hover:text-red-600 transition-colors"
                  >
                    {t("identityEditor.fields.customPrompt.clear")}
                  </button>
                )}
              </div>
              <textarea
                value={identityForm.systemPromptOverride}
                onChange={(e) => setIdentityForm({ ...identityForm, systemPromptOverride: e.target.value })}
                placeholder={t("identityEditor.fields.customPrompt.placeholder")}
                maxLength={10000}
                rows={12}
                className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-xs text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green resize-none"
              />
              <div className="mt-1 flex items-center justify-between">
                <p className="font-mono text-xs text-terminal-muted">
                  {t("identityEditor.fields.customPrompt.helper")}
                </p>
                <p className="font-mono text-xs text-terminal-muted">
                  {identityForm.systemPromptOverride.length}/10000
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-terminal-border/20 bg-terminal-cream">
          <AnimatedButton
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="font-mono"
          >
            {tc("cancel")}
          </AnimatedButton>
          <AnimatedButton
            onClick={onSave}
            disabled={isSaving || !identityForm.name.trim()}
            className="gap-2 bg-terminal-green hover:bg-terminal-green/90 text-white font-mono"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            {tc("save")}
          </AnimatedButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ==========================================================================
// McpRemovalWarningDialog
// ==========================================================================

export function McpRemovalWarningDialog({
  open,
  onOpenChange,
  mcpToolsBeingRemoved,
  isSaving,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mcpToolsBeingRemoved: string[];
  isSaving: boolean;
  onConfirm: (e: React.MouseEvent) => void;
}) {
  const t = useTranslations("picker");
  const tc = useTranslations("common");

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-terminal-cream">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-mono text-terminal-dark flex items-center gap-2">
            <Plug className="w-5 h-5 text-amber-500" />
            {t("mcpRemovalWarning.title")}
          </AlertDialogTitle>
          <AlertDialogDescription className="font-mono text-terminal-muted">
            {t("mcpRemovalWarning.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="rounded border border-amber-200 bg-amber-50 p-3 my-4">
          <p className="font-mono text-xs text-amber-800 mb-2">
            {t("mcpRemovalWarning.toolsBeingRemoved")}
          </p>
          <ul className="list-disc list-inside font-mono text-xs text-amber-900">
            {mcpToolsBeingRemoved.map((toolKey) => (
              <li key={toolKey}>{toolKey}</li>
            ))}
          </ul>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel className="font-mono" disabled={isSaving}>
            {tc("cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isSaving}
            className="bg-amber-500 hover:bg-amber-600 text-white font-mono"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                {tc("save")}
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                {t("mcpRemovalWarning.confirm")}
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ==========================================================================
// DeleteAgentDialog
// ==========================================================================

export function DeleteAgentDialog({
  open,
  onOpenChange,
  characterToDelete,
  isDeleting,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  characterToDelete: CharacterSummary | null;
  isDeleting: boolean;
  onConfirm: (e: React.MouseEvent) => void;
}) {
  const t = useTranslations("picker");
  const tc = useTranslations("common");

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-terminal-cream">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-mono text-terminal-dark flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-red-500" />
            {t("deleteDialog.title")}
          </AlertDialogTitle>
          <AlertDialogDescription className="font-mono text-terminal-muted">
            {t("deleteDialog.description", {
              name: characterToDelete?.displayName || characterToDelete?.name || ""
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="rounded border border-amber-200 bg-amber-50 p-3 my-4">
          <p className="font-mono text-xs text-amber-800">
            {t("deleteDialog.warning")}
          </p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel className="font-mono" disabled={isDeleting}>
            {tc("cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isDeleting}
            className="bg-red-500 hover:bg-red-600 text-white font-mono"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                {t("deleteDialog.deleting")}
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4 mr-2" />
                {t("deleteDialog.confirm")}
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ==========================================================================
// WorkflowActionDialog (remove subagent / delete workflow confirmation)
// ==========================================================================

export function WorkflowActionDialog({
  open,
  onOpenChange,
  pendingWorkflowMemberRemoval,
  pendingWorkflowDeletion,
  workflowMutationBusy,
  onConfirmRemoveSubagent,
  onConfirmDeleteWorkflow,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingWorkflowMemberRemoval: { workflowId: string; agentId: string } | null;
  pendingWorkflowDeletion: { workflowId: string; workflowName: string } | null;
  workflowMutationBusy: string | null;
  onConfirmRemoveSubagent: (e: React.MouseEvent) => void;
  onConfirmDeleteWorkflow: (e: React.MouseEvent) => void;
}) {
  const t = useTranslations("picker");
  const tc = useTranslations("common");

  const removeSubagentConfirmDisabled =
    !pendingWorkflowMemberRemoval || workflowMutationBusy === pendingWorkflowMemberRemoval.workflowId;
  const deleteWorkflowConfirmDisabled =
    !pendingWorkflowDeletion || workflowMutationBusy === pendingWorkflowDeletion.workflowId;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-terminal-cream">
        {pendingWorkflowMemberRemoval && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="font-mono text-terminal-dark">
                {t("workflows.confirmRemoveSubagentTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription className="font-mono text-terminal-muted">
                {t("workflows.confirmRemoveSubagentDescription")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="font-mono" disabled={removeSubagentConfirmDisabled}>
                {tc("cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700 text-white font-mono"
                disabled={removeSubagentConfirmDisabled}
                onClick={onConfirmRemoveSubagent}
              >
                {t("workflows.confirmAction")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}

        {pendingWorkflowDeletion && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="font-mono text-terminal-dark">
                {t("workflows.confirmDeleteTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription className="font-mono text-terminal-muted">
                {t("workflows.confirmDeleteDescription")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="font-mono" disabled={deleteWorkflowConfirmDisabled}>
                {tc("cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700 text-white font-mono"
                disabled={deleteWorkflowConfirmDisabled}
                onClick={onConfirmDeleteWorkflow}
              >
                {t("workflows.confirmAction")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
