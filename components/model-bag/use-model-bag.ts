"use client";

/**
 * useModelBag — React hook for Model Bag state management.
 *
 * Fetches settings from /api/settings, builds the catalog,
 * and exposes actions to assign models and switch providers.
 * Writes to the same PUT /api/settings endpoint as the Settings page.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { resilientFetch, resilientPut } from "@/lib/utils/resilient-fetch";
import { buildModelCatalog } from "@/lib/config/model-catalog";
import type {
  ModelBagState,
  ModelRole,
  ModelItem,
  ProviderStatus,
  LLMProvider,
} from "./model-bag.types";
import { ROLE_TO_SETTINGS_KEY } from "./model-bag.types";
import { PROVIDER_THEME, PROVIDER_DISPLAY_NAMES } from "./model-bag.constants";

interface SettingsData {
  anthropicApiKey?: string;
  openrouterApiKey?: string;
  antigravityAuth?: { isAuthenticated?: boolean };
  codexAuth?: { isAuthenticated?: boolean };
  claudecodeAuth?: { isAuthenticated?: boolean };
  kimiApiKey?: string;
  llmProvider: LLMProvider;
  chatModel?: string;
  researchModel?: string;
  visionModel?: string;
  utilityModel?: string;
}

const ALL_PROVIDERS: LLMProvider[] = [
  "anthropic",
  "openrouter",
  "antigravity",
  "codex",
  "claudecode",
  "kimi",
  "ollama",
];

export function useModelBag() {
  const t = useTranslations("modelBag");
  const [state, setState] = useState<ModelBagState>({
    models: [],
    providers: [],
    activeProvider: "anthropic",
    roleAssignments: { chat: "", research: "", vision: "", utility: "" },
    filterProvider: "all",
    searchQuery: "",
    hoveredModel: null,
    isLoading: true,
    isSaving: false,
  });

  // -----------------------------------------------------------------------
  // Fetch settings + build catalog
  // -----------------------------------------------------------------------

  const fetchSettings = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true }));
    const { data, error } = await resilientFetch<SettingsData>("/api/settings");
    if (error || !data) {
      toast.error(t("loadFailed"));
      setState((prev) => ({ ...prev, isLoading: false }));
      return;
    }

    const authStatus: Record<LLMProvider, boolean> = {
      anthropic: !!data.anthropicApiKey,
      openrouter: !!data.openrouterApiKey,
      antigravity: !!data.antigravityAuth?.isAuthenticated,
      codex: !!data.codexAuth?.isAuthenticated,
      claudecode: !!data.claudecodeAuth?.isAuthenticated,
      kimi: !!data.kimiApiKey,
      ollama: true,
    };

    const assignments: Record<string, string> = {
      chatModel: data.chatModel || "",
      researchModel: data.researchModel || "",
      visionModel: data.visionModel || "",
      utilityModel: data.utilityModel || "",
    };

    const catalog = buildModelCatalog(
      data.llmProvider,
      authStatus,
      assignments,
    );

    const providers: ProviderStatus[] = ALL_PROVIDERS.map((id) => ({
      id,
      displayName: PROVIDER_DISPLAY_NAMES[id],
      isActive: id === data.llmProvider,
      isAuthenticated: authStatus[id],
      authType: PROVIDER_THEME[id].authType,
      modelCount: catalog.filter((m) => m.provider === id).length,
      accentColor: PROVIDER_THEME[id].accentColor,
      iconEmoji: PROVIDER_THEME[id].iconEmoji,
    }));

    setState((prev) => ({
      ...prev,
      models: catalog,
      providers,
      activeProvider: data.llmProvider,
      roleAssignments: {
        chat: data.chatModel || "",
        research: data.researchModel || "",
        vision: data.visionModel || "",
        utility: data.utilityModel || "",
      },
      isLoading: false,
    }));
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // -----------------------------------------------------------------------
  // Assign a model to a role (persists immediately)
  // -----------------------------------------------------------------------

  const assignModelToRole = useCallback(
    async (modelId: string, role: ModelRole) => {
      setState((prev) => ({ ...prev, isSaving: true }));
      const settingsKey = ROLE_TO_SETTINGS_KEY[role];
      const { error } = await resilientPut("/api/settings", { [settingsKey]: modelId });
      if (error) {
        toast.error(t("updateFailed"));
        setState((prev) => ({ ...prev, isSaving: false }));
        return;
      }

      setState((prev) => ({
        ...prev,
        roleAssignments: { ...prev.roleAssignments, [role]: modelId },
        models: prev.models.map((m) => ({
          ...m,
          assignedRoles:
            m.id === modelId
              ? [...new Set([...m.assignedRoles, role])]
              : m.assignedRoles.filter((r) => r !== role),
        })),
        isSaving: false,
      }));
      toast.success(t("roleUpdated", { role }));
    },
    [],
  );

  // -----------------------------------------------------------------------
  // Switch active LLM provider
  // -----------------------------------------------------------------------

  const switchProvider = useCallback(
    async (provider: LLMProvider) => {
      setState((prev) => ({ ...prev, isSaving: true }));
      const { error } = await resilientPut("/api/settings", {
        llmProvider: provider,
        chatModel: "",
        researchModel: "",
        visionModel: "",
        utilityModel: "",
      });
      if (error) {
        toast.error(t("switchProviderFailed"));
        setState((prev) => ({ ...prev, isSaving: false }));
        return;
      }
      await fetchSettings();
      toast.success(t("providerSwitched", { name: PROVIDER_DISPLAY_NAMES[provider] }));
    },
    [fetchSettings],
  );

  // -----------------------------------------------------------------------
  // Filtered + searched models
  // -----------------------------------------------------------------------

  const filteredModels = useMemo(() => {
    let result = state.models;
    if (state.filterProvider !== "all") {
      result = result.filter((m) => m.provider === state.filterProvider);
    }
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      result = result.filter(
        (m) =>
          m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q),
      );
    }
    return result;
  }, [state.models, state.filterProvider, state.searchQuery]);

  return {
    ...state,
    filteredModels,
    assignModelToRole,
    switchProvider,
    setFilterProvider: (p: LLMProvider | "all") =>
      setState((prev) => ({ ...prev, filterProvider: p })),
    setSearchQuery: (q: string) =>
      setState((prev) => ({ ...prev, searchQuery: q })),
    setHoveredModel: (id: string | null) =>
      setState((prev) => ({ ...prev, hoveredModel: id })),
    refresh: fetchSettings,
  };
}
