"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { resilientFetch, resilientPatch } from "@/lib/utils/resilient-fetch";
import {
  CHARACTER_TOOL_CATALOG,
  mergeCharacterToolCatalog,
  type CharacterToolCatalogItem,
} from "@/lib/characters/tool-catalog";
import type { CharacterSummary } from "@/components/character-picker-types";

type ToolDefinition = CharacterToolCatalogItem;

type DependencyStatus = {
  syncedFolders: boolean;
  embeddings: boolean;
  vectorDbEnabled: boolean;
  webScraper: boolean;
  openrouterKey: boolean;
  comfyuiEnabled: boolean;
  flux2Klein4bEnabled: boolean;
  flux2Klein9bEnabled: boolean;
  localGrepEnabled: boolean;
  devWorkspaceEnabled: boolean;
};

const DEFAULT_DEPENDENCY_STATUS: DependencyStatus = {
  syncedFolders: false,
  embeddings: false,
  vectorDbEnabled: false,
  webScraper: false,
  openrouterKey: false,
  comfyuiEnabled: false,
  flux2Klein4bEnabled: false,
  flux2Klein9bEnabled: false,
  localGrepEnabled: true,
  devWorkspaceEnabled: false,
};

export function useToolEditor(
  t: ReturnType<typeof useTranslations>,
  tDeps: ReturnType<typeof useTranslations>,
  loadCharacters: () => Promise<void>
) {
  const [toolEditorOpen, setToolEditorOpen] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<CharacterSummary | null>(null);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [toolSearchQuery, setToolSearchQuery] = useState("");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [availableTools, setAvailableTools] = useState<ToolDefinition[]>(CHARACTER_TOOL_CATALOG);
  const [dependencyStatus, setDependencyStatus] = useState<DependencyStatus>(DEFAULT_DEPENDENCY_STATUS);

  const baseTools = useMemo(() => {
    return CHARACTER_TOOL_CATALOG.map((tool) => ({
      ...tool,
      displayName: t.has(`tools.${tool.id}.name`) ? t(`tools.${tool.id}.name`) : tool.id,
      description: t.has(`tools.${tool.id}.description`) ? t(`tools.${tool.id}.description`) : "",
    }));
  }, [t]);

  useEffect(() => {
    setAvailableTools(baseTools);
  }, [baseTools]);

  const toolsByCategory = useMemo(() => {
    return availableTools.reduce((acc, tool) => {
      if (!acc[tool.category]) acc[tool.category] = [];
      acc[tool.category].push(tool);
      return acc;
    }, {} as Record<string, ToolDefinition[]>);
  }, [availableTools]);

  const filteredToolsByCategory = useMemo(() => {
    if (!toolSearchQuery.trim()) return toolsByCategory;
    const query = toolSearchQuery.toLowerCase();
    const filtered: Record<string, ToolDefinition[]> = {};
    for (const [category, tools] of Object.entries(toolsByCategory)) {
      const matchingTools = tools.filter((tool) => {
        const name = (tool.displayName || tool.id).toLowerCase();
        const desc = (tool.description || "").toLowerCase();
        return name.includes(query) || desc.includes(query) || tool.id.toLowerCase().includes(query);
      });
      if (matchingTools.length > 0) {
        filtered[category] = matchingTools;
      }
    }
    return filtered;
  }, [toolsByCategory, toolSearchQuery]);

  useEffect(() => {
    if (!toolEditorOpen) return;
    let cancelled = false;

    const loadTools = async () => {
      try {
        const { data, error } = await resilientFetch<{
          tools?: Array<{ id: string; displayName: string; description: string; category: string }>;
        }>("/api/tools?includeDisabled=true&includeAlwaysLoad=true");
        if (error || !data) throw new Error(error || "Failed to load tools");
        if (cancelled) return;

        const mergedList = mergeCharacterToolCatalog(baseTools, data.tools || []).sort((a, b) => {
          if (a.category !== b.category) return a.category.localeCompare(b.category);
          return (a.displayName || a.id).localeCompare(b.displayName || b.id);
        });
        setAvailableTools(mergedList);
      } catch (error) {
        console.error("Failed to load tools", error);
      }
    };

    loadTools();

    return () => {
      cancelled = true;
    };
  }, [toolEditorOpen, baseTools]);

  useEffect(() => {
    if (!toolEditorOpen) return;
    let cancelled = false;

    const loadDependencyStatus = async () => {
      let foldersCount = 0;
      if (editingCharacter?.id) {
        const { data } = await resilientFetch<{ folders?: unknown[] }>(
          `/api/vector-sync?characterId=${editingCharacter.id}`
        );
        if (data) foldersCount = data.folders?.length ?? 0;
      }

      try {
        const { data: settingsData, error } = await resilientFetch<Record<string, unknown>>("/api/settings");
        if (!settingsData || error) throw new Error(error || "Failed to load settings");
        const webScraperReady = settingsData.webScraperProvider === "local"
          || (typeof settingsData.firecrawlApiKey === "string" && settingsData.firecrawlApiKey.trim().length > 0);
        const hasEmbeddingModel = typeof settingsData.embeddingModel === "string"
          && settingsData.embeddingModel.trim().length > 0;
        const hasOpenRouterKey = typeof settingsData.openrouterApiKey === "string"
          && settingsData.openrouterApiKey.trim().length > 0;
        const embeddingsReady = hasEmbeddingModel || settingsData.embeddingProvider === "local" || hasOpenRouterKey;

        if (cancelled) return;
        setDependencyStatus({
          syncedFolders: foldersCount > 0,
          embeddings: embeddingsReady,
          vectorDbEnabled: settingsData.vectorDBEnabled === true,
          webScraper: webScraperReady,
          openrouterKey: typeof settingsData.openrouterApiKey === "string" && settingsData.openrouterApiKey.trim().length > 0,
          comfyuiEnabled: settingsData.comfyuiEnabled === true,
          flux2Klein4bEnabled: settingsData.flux2Klein4bEnabled === true,
          flux2Klein9bEnabled: settingsData.flux2Klein9bEnabled === true,
          localGrepEnabled: settingsData.localGrepEnabled !== false,
          devWorkspaceEnabled: settingsData.devWorkspaceEnabled === true,
        });
      } catch (error) {
        if (cancelled) return;
        setDependencyStatus({
          ...DEFAULT_DEPENDENCY_STATUS,
          syncedFolders: foldersCount > 0,
          localGrepEnabled: true,
        });
      }
    };

    loadDependencyStatus();

    return () => {
      cancelled = true;
    };
  }, [toolEditorOpen, editingCharacter]);

  const areDependenciesMet = (tool: ToolDefinition): boolean => {
    if (!tool.dependencies || tool.dependencies.length === 0) return true;
    return tool.dependencies.every((dep) => dependencyStatus[dep]);
  };

  const getDependencyWarning = (tool: ToolDefinition): string | null => {
    if (!tool.dependencies || tool.dependencies.length === 0) return null;
    const unmet = tool.dependencies.filter((dep) => !dependencyStatus[dep]);
    if (unmet.length === 0) return null;
    if (unmet.length === 2 && unmet.includes("syncedFolders") && unmet.includes("embeddings")) {
      return tDeps("both");
    }
    return unmet.map((dep) => tDeps(dep)).join(" + ");
  };

  const toggleCategory = (category: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const toggleAllInCategory = (category: string, select: boolean) => {
    const categoryTools = toolsByCategory[category] || [];
    const categoryToolIds = categoryTools.map((t) => t.id);
    const selectableToolIds = categoryTools.filter(areDependenciesMet).map((t) => t.id);
    setSelectedTools((prev) => {
      if (select) {
        return [...new Set([...prev, ...selectableToolIds])];
      } else {
        return prev.filter((id) => !categoryToolIds.includes(id));
      }
    });
  };

  const getSelectedCountInCategory = (category: string) => {
    const categoryTools = toolsByCategory[category] || [];
    return categoryTools.filter((t) => selectedTools.includes(t.id)).length;
  };

  const toggleTool = (toolId: string) => {
    setSelectedTools((prev) =>
      prev.includes(toolId) ? prev.filter((t) => t !== toolId) : [...prev, toolId]
    );
  };

  const openToolEditor = (character: CharacterSummary) => {
    setEditingCharacter(character);
    setSelectedTools(character.metadata?.enabledTools || []);
    setToolSearchQuery("");
    setCollapsedCategories(new Set());
    setToolEditorOpen(true);
  };

  const saveTools = async () => {
    if (!editingCharacter) return;
    setIsSaving(true);
    try {
      const { error } = await resilientPatch(`/api/characters/${editingCharacter.id}`, {
        metadata: { enabledTools: selectedTools },
      });
      if (!error) {
        setToolEditorOpen(false);
        loadCharacters();
      } else {
        toast.error(t("saveToolsFailed"));
      }
    } catch (error) {
      console.error("Failed to save tools:", error);
      toast.error(t("saveToolsFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  return {
    // State
    toolEditorOpen,
    setToolEditorOpen,
    editingCharacter,
    setEditingCharacter,
    selectedTools,
    isSaving,
    setIsSaving,
    toolSearchQuery,
    setToolSearchQuery,
    collapsedCategories,
    availableTools,
    toolsByCategory,
    filteredToolsByCategory,
    // Actions
    openToolEditor,
    saveTools,
    toggleTool,
    toggleCategory,
    toggleAllInCategory,
    getSelectedCountInCategory,
    areDependenciesMet,
    getDependencyWarning,
  };
}
