"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  resilientPatch,
  resilientDelete,
  resilientPost,
} from "@/lib/utils/resilient-fetch";
import type { CharacterSummary, WorkflowGroup } from "@/components/character-picker-types";

export function useWorkflowManager(
  t: ReturnType<typeof useTranslations>,
  loadCharacters: () => Promise<void>
) {
  const [workflowGroups, setWorkflowGroups] = useState<WorkflowGroup[]>([]);
  const [expandedWorkflows, setExpandedWorkflows] = useState<Set<string>>(new Set());
  const [workflowAgentIds, setWorkflowAgentIds] = useState<Set<string>>(new Set());
  const [workflowDrafts, setWorkflowDrafts] = useState<Record<string, { addAgentId?: string; initiatorId?: string }>>({});
  const [workflowCreatorOpen, setWorkflowCreatorOpen] = useState(false);
  const [creatingWorkflow, setCreatingWorkflow] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState("");
  const [newWorkflowInitiatorId, setNewWorkflowInitiatorId] = useState("");
  const [newWorkflowSubagentIds, setNewWorkflowSubagentIds] = useState<Set<string>>(new Set());
  const [workflowMutationBusy, setWorkflowMutationBusy] = useState<string | null>(null);
  const [addToWorkflowDialogOpen, setAddToWorkflowDialogOpen] = useState(false);
  const [addToWorkflowCharacter, setAddToWorkflowCharacter] = useState<CharacterSummary | null>(null);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
  const [isAddingToWorkflow, setIsAddingToWorkflow] = useState(false);
  const [pendingWorkflowMemberRemoval, setPendingWorkflowMemberRemoval] = useState<{
    workflowId: string;
    agentId: string;
  } | null>(null);
  const [pendingWorkflowDeletion, setPendingWorkflowDeletion] = useState<{
    workflowId: string;
    workflowName: string;
  } | null>(null);
  const [workflowActionTrigger, setWorkflowActionTrigger] = useState<HTMLElement | null>(null);

  const getWorkflowErrorMessage = useCallback((error: unknown) => {
    const rawMessage = error instanceof Error ? error.message : "";
    switch (rawMessage) {
      case "Agent already belongs to an active workflow":
        return t("workflows.errors.agentAlreadyActiveWorkflow");
      case "Agent is already in this workflow":
        return t("workflows.errors.agentAlreadyInWorkflow");
      case "Cannot modify archived workflow":
        return t("workflows.errors.archivedWorkflowReadOnly");
      default:
        return rawMessage || t("workflows.updateFailed");
    }
  }, [t]);

  const mutateWorkflow = useCallback(
    async (workflowId: string, payload: Record<string, unknown>) => {
      setWorkflowMutationBusy(workflowId);
      try {
        const { error } = await resilientPatch(`/api/workflows/${workflowId}`, payload);
        if (error) throw new Error(error);
        await loadCharacters();
        toast.success(t("workflows.updated"));
      } catch (error) {
        console.error("Workflow mutation failed:", error);
        toast.error(getWorkflowErrorMessage(error));
      } finally {
        setWorkflowMutationBusy(null);
      }
    },
    [getWorkflowErrorMessage, loadCharacters, t]
  );

  const updateWorkflowDraft = useCallback(
    (workflowId: string, patch: Partial<{ addAgentId: string; initiatorId: string }>) => {
      setWorkflowDrafts((prev) => ({
        ...prev,
        [workflowId]: {
          ...(prev[workflowId] || {}),
          ...patch,
        },
      }));
    },
    []
  );

  const addSubagentToWorkflow = useCallback(
    async (workflowId: string, agentId: string, options?: { silentSuccess?: boolean }) => {
      if (!agentId) return;
      setWorkflowMutationBusy(workflowId);
      try {
        const { error } = await resilientPatch(`/api/workflows/${workflowId}`, {
          action: "addSubagent",
          agentId,
        });
        if (error) throw new Error(error);
        await loadCharacters();
        if (!options?.silentSuccess) {
          toast.success(t("workflows.updated"));
        }
        updateWorkflowDraft(workflowId, { addAgentId: "" });
      } catch (error) {
        console.error("Add sub-agent failed:", error);
        throw error instanceof Error ? error : new Error(t("workflows.updateFailed"));
      } finally {
        setWorkflowMutationBusy(null);
      }
    },
    [loadCharacters, t, updateWorkflowDraft]
  );

  const setWorkflowMainAgent = useCallback(
    async (workflowId: string, initiatorId: string) => {
      if (!initiatorId) return;
      await mutateWorkflow(workflowId, { action: "setInitiator", initiatorId });
    },
    [mutateWorkflow]
  );

  const removeSubagentFromWorkflow = useCallback(
    async (workflowId: string, agentId: string) => {
      await mutateWorkflow(workflowId, { action: "removeMember", agentId });
    },
    [mutateWorkflow]
  );

  const deleteWorkflowGroup = useCallback(
    async (workflowId: string) => {
      setWorkflowMutationBusy(workflowId);
      try {
        const { error } = await resilientDelete(`/api/workflows/${workflowId}`);
        if (error) throw new Error(error);
        await loadCharacters();
        toast.success(t("workflows.deleted"));
      } catch (error) {
        console.error("Workflow deletion failed:", error);
        toast.error(getWorkflowErrorMessage(error));
      } finally {
        setWorkflowMutationBusy(null);
      }
    },
    [getWorkflowErrorMessage, loadCharacters, t]
  );

  const createWorkflowGroup = useCallback(async () => {
    if (!newWorkflowInitiatorId) return;
    setCreatingWorkflow(true);
    try {
      const { error } = await resilientPost("/api/workflows", {
        name: newWorkflowName.trim() || undefined,
        initiatorId: newWorkflowInitiatorId,
        subAgentIds: Array.from(newWorkflowSubagentIds).filter((id) => id !== newWorkflowInitiatorId),
      });
      if (error) throw new Error(error);
      setWorkflowCreatorOpen(false);
      setNewWorkflowName("");
      setNewWorkflowSubagentIds(new Set());
      await loadCharacters();
      toast.success(t("workflows.created"));
    } catch (error) {
      console.error("Create workflow failed:", error);
      toast.error(getWorkflowErrorMessage(error));
    } finally {
      setCreatingWorkflow(false);
    }
  }, [getWorkflowErrorMessage, loadCharacters, newWorkflowInitiatorId, newWorkflowName, newWorkflowSubagentIds, t]);

  const toggleWorkflow = useCallback((workflowId: string) => {
    setExpandedWorkflows((prev) => {
      const next = new Set(prev);
      if (next.has(workflowId)) {
        next.delete(workflowId);
      } else {
        next.add(workflowId);
      }
      return next;
    });
  }, []);

  const openAddToWorkflowDialog = useCallback(
    (character: CharacterSummary, availableWorkflows: WorkflowGroup[]) => {
      if (availableWorkflows.length === 0) {
        toast.error(t("workflows.addToWorkflowNoAvailable"));
        return;
      }
      setAddToWorkflowCharacter(character);
      setSelectedWorkflowId(availableWorkflows[0].id);
      setAddToWorkflowDialogOpen(true);
    },
    [t]
  );

  const closeAddToWorkflowDialog = useCallback(() => {
    setAddToWorkflowDialogOpen(false);
    setAddToWorkflowCharacter(null);
    setSelectedWorkflowId("");
  }, []);

  const confirmAddToWorkflow = useCallback(async () => {
    if (!addToWorkflowCharacter || !selectedWorkflowId) return;
    setIsAddingToWorkflow(true);
    try {
      await addSubagentToWorkflow(selectedWorkflowId, addToWorkflowCharacter.id, { silentSuccess: true });
      toast.success(t("workflows.addToWorkflowSuccess"));
      closeAddToWorkflowDialog();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("workflows.updateFailed"));
    } finally {
      setIsAddingToWorkflow(false);
    }
  }, [addSubagentToWorkflow, addToWorkflowCharacter, closeAddToWorkflowDialog, selectedWorkflowId, t]);

  const setExpandedWorkflowsOnLoad = useCallback((ids: Set<string>) => {
    setExpandedWorkflows(ids);
  }, []);

  const syncDraftsToGroups = useCallback((groups: WorkflowGroup[]) => {
    setWorkflowDrafts((prev) => {
      const next: Record<string, { addAgentId?: string; initiatorId?: string }> = {};
      for (const workflow of groups) {
        const existing = prev[workflow.id] || {};
        next[workflow.id] = {
          addAgentId: existing.addAgentId,
          initiatorId: existing.initiatorId || workflow.initiatorId,
        };
      }
      return next;
    });
  }, []);

  const closeWorkflowActionDialog = useCallback(() => {
    setPendingWorkflowDeletion(null);
    setPendingWorkflowMemberRemoval(null);
    workflowActionTrigger?.focus();
    setWorkflowActionTrigger(null);
  }, [workflowActionTrigger]);

  const handleWorkflowActionDialogOpenChange = useCallback((open: boolean) => {
    if (!open) {
      closeWorkflowActionDialog();
    }
  }, [closeWorkflowActionDialog]);

  return {
    // State
    workflowGroups,
    setWorkflowGroups,
    expandedWorkflows,
    workflowAgentIds,
    setWorkflowAgentIds,
    workflowDrafts,
    workflowCreatorOpen,
    setWorkflowCreatorOpen,
    creatingWorkflow,
    newWorkflowName,
    setNewWorkflowName,
    newWorkflowInitiatorId,
    setNewWorkflowInitiatorId,
    newWorkflowSubagentIds,
    setNewWorkflowSubagentIds,
    workflowMutationBusy,
    addToWorkflowDialogOpen,
    setAddToWorkflowDialogOpen,
    addToWorkflowCharacter,
    selectedWorkflowId,
    setSelectedWorkflowId,
    isAddingToWorkflow,
    pendingWorkflowMemberRemoval,
    setPendingWorkflowMemberRemoval,
    pendingWorkflowDeletion,
    setPendingWorkflowDeletion,
    workflowActionTrigger,
    setWorkflowActionTrigger,
    // Computed
    workflowActionDialogOpen: Boolean(pendingWorkflowMemberRemoval || pendingWorkflowDeletion),
    // Actions
    toggleWorkflow,
    updateWorkflowDraft,
    addSubagentToWorkflow,
    setWorkflowMainAgent,
    removeSubagentFromWorkflow,
    deleteWorkflowGroup,
    createWorkflowGroup,
    openAddToWorkflowDialog,
    closeAddToWorkflowDialog,
    confirmAddToWorkflow,
    closeWorkflowActionDialog,
    handleWorkflowActionDialogOpenChange,
    setExpandedWorkflowsOnLoad,
    syncDraftsToGroups,
  };
}
