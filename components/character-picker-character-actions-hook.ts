"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { resilientFetch, resilientPatch, resilientDelete, resilientPost } from "@/lib/utils/resilient-fetch";
import type { CharacterSummary } from "@/components/character-picker-types";

export function useCharacterActions(
  t: ReturnType<typeof useTranslations>,
  loadCharacters: () => Promise<void>,
  hasActiveSession: (charId: string, initialStatus?: boolean) => boolean
) {
  // Identity editor state
  const [identityEditorOpen, setIdentityEditorOpen] = useState(false);
  const [identityEditingCharacter, setIdentityEditingCharacter] = useState<CharacterSummary | null>(null);
  const [identityForm, setIdentityForm] = useState({
    name: "",
    displayName: "",
    tagline: "",
    purpose: "",
    systemPromptOverride: "",
  });
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [isSavingIdentity, setIsSavingIdentity] = useState(false);

  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [characterToDelete, setCharacterToDelete] = useState<CharacterSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Folder manager state
  const [folderManagerOpen, setFolderManagerOpen] = useState(false);
  const [folderManagerCharacter, setFolderManagerCharacter] = useState<CharacterSummary | null>(null);

  // MCP tools editor state
  const [mcpToolEditorOpen, setMcpToolEditorOpen] = useState(false);
  const [mcpEditingCharacter, setMcpEditingCharacter] = useState<CharacterSummary | null>(null);
  const [mcpToolPreferences, setMcpToolPreferences] = useState<Record<string, { enabled: boolean; loadingMode: "always" | "deferred" }>>({});
  const [mcpServers, setMcpServers] = useState<string[]>([]);
  const [mcpTools, setMcpTools] = useState<string[]>([]);
  const [mcpRemovalWarningOpen, setMcpRemovalWarningOpen] = useState(false);
  const [mcpToolsBeingRemoved, setMcpToolsBeingRemoved] = useState<string[]>([]);
  const [isSavingMcp, setIsSavingMcp] = useState(false);

  // Plugin assignment editor state
  const [pluginEditorOpen, setPluginEditorOpen] = useState(false);
  const [pluginEditingCharacter, setPluginEditingCharacter] = useState<CharacterSummary | null>(null);
  const [agentPlugins, setAgentPlugins] = useState<Array<{
    id: string;
    name: string;
    description: string;
    version: string;
    enabledForAgent: boolean;
  }>>([]);
  const [loadingAgentPlugins, setLoadingAgentPlugins] = useState(false);
  const [savingPluginId, setSavingPluginId] = useState<string | null>(null);

  // Identity actions
  const openIdentityEditor = async (character: CharacterSummary) => {
    setIdentityEditingCharacter(character);
    const metadata = character.metadata as any;
    setIdentityForm({
      name: character.name,
      displayName: character.displayName || "",
      tagline: character.tagline || "",
      purpose: character.metadata?.purpose || "",
      systemPromptOverride: metadata?.systemPromptOverride || "",
    });

    const { data: promptData } = await resilientFetch<{ prompt?: string }>(
      `/api/characters/${character.id}/prompt-preview`
    );
    setGeneratedPrompt(promptData?.prompt || "");
    setIdentityEditorOpen(true);
  };

  const saveIdentity = async () => {
    if (!identityEditingCharacter) return;
    setIsSavingIdentity(true);
    try {
      const { error } = await resilientPatch(`/api/characters/${identityEditingCharacter.id}`, {
        character: {
          name: identityForm.name,
          displayName: identityForm.displayName || undefined,
          tagline: identityForm.tagline || undefined,
        },
        metadata: {
          purpose: identityForm.purpose || undefined,
          systemPromptOverride: identityForm.systemPromptOverride || undefined,
        },
      });
      if (!error) {
        setIdentityEditorOpen(false);
        loadCharacters();
      }
    } catch (error) {
      console.error("Failed to save identity:", error);
      toast.error(t("saveIdentityFailed"));
    } finally {
      setIsSavingIdentity(false);
    }
  };

  // Delete actions
  const openDeleteDialog = (character: CharacterSummary) => {
    setCharacterToDelete(character);
    setDeleteDialogOpen(true);
  };

  const deleteCharacter = async () => {
    if (!characterToDelete) return;
    setIsDeleting(true);
    try {
      const { error } = await resilientDelete(`/api/characters/${characterToDelete.id}`);
      if (!error) {
        setDeleteDialogOpen(false);
        setCharacterToDelete(null);
        loadCharacters();
      }
    } catch (error) {
      console.error("Failed to delete character:", error);
      toast.error(t("deleteFailed"));
    } finally {
      setIsDeleting(false);
    }
  };

  // Folder manager actions
  const openFolderManager = (character: CharacterSummary) => {
    setFolderManagerCharacter(character);
    setFolderManagerOpen(true);
  };

  // MCP tools actions
  const openMcpToolEditor = async (character: CharacterSummary) => {
    setMcpEditingCharacter(character);
    const metadata = character.metadata as any;
    setMcpServers(metadata?.enabledMcpServers || []);
    setMcpTools(metadata?.enabledMcpTools || []);
    setMcpToolPreferences(metadata?.mcpToolPreferences || {});
    setMcpToolEditorOpen(true);
  };

  const getMcpToolsBeingRemoved = useCallback((): string[] => {
    if (!mcpEditingCharacter) return [];
    const existingMetadata = mcpEditingCharacter.metadata as any;
    const previousTools: string[] = existingMetadata?.enabledMcpTools || [];
    return previousTools.filter((t: string) => !mcpTools.includes(t));
  }, [mcpEditingCharacter, mcpTools]);

  const performMcpToolSave = async () => {
    if (!mcpEditingCharacter) return;
    setIsSavingMcp(true);
    try {
      const { error } = await resilientPatch(`/api/characters/${mcpEditingCharacter.id}`, {
        metadata: {
          enabledMcpServers: mcpServers,
          enabledMcpTools: mcpTools,
          mcpToolPreferences: mcpToolPreferences,
          mcpUserConfigured: true,
        },
      });
      if (!error) {
        setMcpToolEditorOpen(false);
        setMcpRemovalWarningOpen(false);
        loadCharacters();
      }
    } catch (error) {
      console.error("Failed to save MCP tools:", error);
      toast.error(t("saveMcpFailed"));
    } finally {
      setIsSavingMcp(false);
    }
  };

  const saveMcpTools = async () => {
    if (!mcpEditingCharacter) return;
    const removedTools = getMcpToolsBeingRemoved();
    if (removedTools.length > 0 && hasActiveSession(mcpEditingCharacter.id, mcpEditingCharacter.hasActiveSession)) {
      setMcpToolsBeingRemoved(removedTools);
      setMcpRemovalWarningOpen(true);
      return;
    }
    await performMcpToolSave();
  };

  // Plugin actions
  const openPluginEditor = async (character: CharacterSummary) => {
    setPluginEditingCharacter(character);
    setPluginEditorOpen(true);
    setLoadingAgentPlugins(true);

    try {
      const { data, error } = await resilientFetch<{
        plugins?: Array<{
          id: string;
          name: string;
          description: string;
          version: string;
          enabledForAgent: boolean;
        }>;
      }>(`/api/characters/${character.id}/plugins`);

      if (error || !data) throw new Error(error || "Failed to load plugins");
      setAgentPlugins(
        (data.plugins || []).sort((a, b) => {
          const aEnabled = a.enabledForAgent ? 1 : 0;
          const bEnabled = b.enabledForAgent ? 1 : 0;
          if (aEnabled !== bEnabled) return bEnabled - aEnabled;
          return a.name.localeCompare(b.name);
        })
      );
    } catch (error) {
      console.error("Failed to load agent plugins:", error);
      toast.error(t("plugins.loadFailed"));
      setAgentPlugins([]);
    } finally {
      setLoadingAgentPlugins(false);
    }
  };

  const toggleAgentPlugin = async (pluginId: string, enabled: boolean) => {
    if (!pluginEditingCharacter) return;
    setSavingPluginId(pluginId);
    try {
      const { error } = await resilientPost(`/api/characters/${pluginEditingCharacter.id}/plugins`, {
        pluginId,
        enabled,
      });
      if (error) throw new Error(error);

      let nextPlugins = agentPlugins;
      setAgentPlugins((prev) => {
        nextPlugins = prev.map((plugin) =>
          plugin.id === pluginId ? { ...plugin, enabledForAgent: enabled } : plugin
        );
        return nextPlugins;
      });

      const enabledPlugins = nextPlugins
        .filter((plugin) => plugin.enabledForAgent)
        .map((plugin) => plugin.id);

      await resilientPatch(`/api/characters/${pluginEditingCharacter.id}`, {
        metadata: { enabledPlugins },
      });
    } catch (error) {
      console.error("Failed to update agent plugin:", error);
      toast.error(t("plugins.updateFailed"));
    } finally {
      setSavingPluginId(null);
    }
  };

  // Duplicate action
  const handleDuplicate = async (characterId: string) => {
    try {
      const { data, error } = await resilientPost<{ character: { id: string } }>(
        `/api/characters/${characterId}/duplicate`,
        {},
        // Duplication can copy folders, plugins, and images; default 10s may be too short.
        { retries: 0, timeout: 60000 }
      );
      if (error || !data?.character) throw new Error(error || "Unknown error");
      await loadCharacters();
      toast.success(t("workflows.duplicateSuccess"));
    } catch (error) {
      console.error("Failed to duplicate agent:", error);
      toast.error(t("workflows.duplicateFailed"));
    }
  };

  return {
    // Identity
    identityEditorOpen,
    setIdentityEditorOpen,
    editingCharacter: identityEditingCharacter,
    identityForm,
    setIdentityForm,
    generatedPrompt,
    isSavingIdentity,
    openIdentityEditor,
    saveIdentity,

    // Delete
    deleteDialogOpen,
    setDeleteDialogOpen,
    characterToDelete,
    isDeleting,
    openDeleteDialog,
    deleteCharacter,

    // Folder manager
    folderManagerOpen,
    setFolderManagerOpen,
    folderManagerCharacter,
    openFolderManager,

    // MCP
    mcpToolEditorOpen,
    setMcpToolEditorOpen,
    mcpEditingCharacter,
    mcpServers,
    mcpTools,
    mcpToolPreferences,
    mcpRemovalWarningOpen,
    setMcpRemovalWarningOpen,
    mcpToolsBeingRemoved,
    isSavingMcp,
    openMcpToolEditor,
    saveMcpTools,
    performMcpToolSave,
    onUpdateMcp: (servers: string[], tools: string[], prefs: Record<string, { enabled: boolean; loadingMode: "always" | "deferred" }>) => {
      setMcpServers(servers);
      setMcpTools(tools);
      setMcpToolPreferences(prefs);
    },

    // Plugins
    pluginEditorOpen,
    setPluginEditorOpen,
    pluginEditingCharacter,
    agentPlugins,
    loadingAgentPlugins,
    savingPluginId,
    openPluginEditor,
    toggleAgentPlugin,

    // Duplicate
    handleDuplicate,
  };
}
