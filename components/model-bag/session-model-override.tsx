"use client";

/**
 * SessionModelOverride — Per-session model picker.
 *
 * A compact UI that appears in the chat sidebar or session details,
 * allowing users to override the model for the current session
 * without changing global settings.
 */

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { resilientFetch, resilientPut } from "@/lib/utils/resilient-fetch";
import { PROVIDER_THEME, PROVIDER_DISPLAY_NAMES, ROLE_THEME } from "./model-bag.constants";
import type { LLMProvider, ModelRole, SessionModelConfig } from "./model-bag.types";
import { CpuIcon, XIcon, Loader2Icon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";

interface SessionModelOverrideProps {
  sessionId: string;
  className?: string;
}

interface SessionModelState {
  hasOverrides: boolean;
  config: SessionModelConfig;
  globalDefaults: {
    provider: string;
    chatModel: string;
    researchModel: string;
    visionModel: string;
    utilityModel: string;
  };
  isLoading: boolean;
  isSaving: boolean;
}

export function SessionModelOverride({
  sessionId,
  className,
}: SessionModelOverrideProps) {
  const t = useTranslations("modelBag.sessionOverride");
  const [state, setState] = useState<SessionModelState>({
    hasOverrides: false,
    config: {},
    globalDefaults: {
      provider: "anthropic",
      chatModel: "",
      researchModel: "",
      visionModel: "",
      utilityModel: "",
    },
    isLoading: true,
    isSaving: false,
  });
  const [expanded, setExpanded] = useState(false);

  // Fetch current session model config
  const fetchConfig = useCallback(async () => {
    const { data, error } = await resilientFetch<{
      hasOverrides: boolean;
      config: SessionModelConfig;
      globalDefaults: SessionModelState["globalDefaults"];
    }>(`/api/sessions/${sessionId}/model-config`);
    if (error || !data) {
      setState((prev) => ({ ...prev, isLoading: false }));
      return;
    }
    setState((prev) => ({
      ...prev,
      hasOverrides: data.hasOverrides,
      config: data.config,
      globalDefaults: data.globalDefaults,
      isLoading: false,
    }));
  }, [sessionId]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // Save override
  const saveOverride = useCallback(
    async (update: Partial<SessionModelConfig>) => {
      setState((prev) => ({ ...prev, isSaving: true }));
      const { data, error } = await resilientPut<{ config: SessionModelConfig }>(
        `/api/sessions/${sessionId}/model-config`,
        { ...state.config, ...update },
      );
      if (error || !data) {
        toast.error(t("updateFailed"));
        setState((prev) => ({ ...prev, isSaving: false }));
        return;
      }
      setState((prev) => ({
        ...prev,
        hasOverrides: true,
        config: data.config,
        isSaving: false,
      }));
      toast.success(t("updateSuccess"));
    },
    [sessionId, state.config],
  );

  // Clear all overrides
  const clearOverrides = useCallback(async () => {
    setState((prev) => ({ ...prev, isSaving: true }));
    const { error } = await resilientPut(
      `/api/sessions/${sessionId}/model-config`,
      { clear: true },
    );
    if (error) {
      toast.error(t("clearFailed"));
      setState((prev) => ({ ...prev, isSaving: false }));
      return;
    }
    setState((prev) => ({
      ...prev,
      hasOverrides: false,
      config: {},
      isSaving: false,
    }));
    toast.success(t("clearSuccess"));
  }, [sessionId]);

  if (state.isLoading) {
    return (
      <div className={cn("flex items-center gap-2 p-2", className)}>
        <Loader2Icon className="size-3 animate-spin text-terminal-muted" />
        <span className="font-mono text-[10px] text-terminal-muted">{t("loadingConfig")}</span>
      </div>
    );
  }

  const globalProvider = state.globalDefaults.provider as LLMProvider;
  const sessionProvider = state.config.sessionProvider || globalProvider;
  const chatModel = state.config.sessionChatModel || state.globalDefaults.chatModel || "(default)";

  return (
    <div className={cn("rounded-lg border border-terminal-border bg-white/50 p-2", className)}>
      {/* Collapsed header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 font-mono text-[10px]"
      >
        <CpuIcon className="size-3 text-terminal-green" />
        <span className="font-bold text-terminal-dark">Model</span>
        {state.hasOverrides ? (
          <span className="rounded bg-terminal-green/15 px-1 text-[9px] font-bold text-terminal-green">
            OVERRIDE
          </span>
        ) : (
          <span className="text-terminal-muted">Global</span>
        )}
        <span className="ml-auto truncate text-terminal-muted">
          {chatModel}
        </span>
        {expanded ? (
          <ChevronUpIcon className="size-3 text-terminal-muted" />
        ) : (
          <ChevronDownIcon className="size-3 text-terminal-muted" />
        )}
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div className="mt-2 space-y-2 border-t border-terminal-border/50 pt-2">
          {/* Chat model override */}
          <ModelOverrideField
            label={t("chatModel")}
            role="chat"
            value={state.config.sessionChatModel || ""}
            globalDefault={state.globalDefaults.chatModel}
            onChange={(v) => saveOverride({ sessionChatModel: v })}
            isSaving={state.isSaving}
          />

          {/* Research model override */}
          <ModelOverrideField
            label={t("researchModel")}
            role="research"
            value={state.config.sessionResearchModel || ""}
            globalDefault={state.globalDefaults.researchModel}
            onChange={(v) => saveOverride({ sessionResearchModel: v })}
            isSaving={state.isSaving}
          />

          {/* Vision model override */}
          <ModelOverrideField
            label={t("visionModel")}
            role="vision"
            value={state.config.sessionVisionModel || ""}
            globalDefault={state.globalDefaults.visionModel}
            onChange={(v) => saveOverride({ sessionVisionModel: v })}
            isSaving={state.isSaving}
          />

          {/* Utility model override */}
          <ModelOverrideField
            label={t("utilityModel")}
            role="utility"
            value={state.config.sessionUtilityModel || ""}
            globalDefault={state.globalDefaults.utilityModel}
            onChange={(v) => saveOverride({ sessionUtilityModel: v })}
            isSaving={state.isSaving}
          />

          {/* Clear all button */}
          {state.hasOverrides && (
            <button
              onClick={clearOverrides}
              disabled={state.isSaving}
              className="flex w-full items-center justify-center gap-1 rounded border border-red-200 bg-red-50 px-2 py-1 font-mono text-[10px] text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
            >
              <XIcon className="size-3" />
              Clear all overrides
            </button>
          )}

          <p className="font-mono text-[9px] text-terminal-muted">
            Empty = use global setting. Enter a model ID to override for this session only.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Individual model override field
// ---------------------------------------------------------------------------

function ModelOverrideField({
  label,
  role,
  value,
  globalDefault,
  onChange,
  isSaving,
}: {
  label: string;
  role: ModelRole;
  value: string;
  globalDefault: string;
  onChange: (value: string) => void;
  isSaving: boolean;
}) {
  const [localValue, setLocalValue] = useState(value);
  const roleInfo = ROLE_THEME[role];

  // Sync when external value changes
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return (
    <div>
      <label className="mb-0.5 flex items-center gap-1 font-mono text-[9px] text-terminal-muted">
        <span>{roleInfo.iconEmoji}</span>
        <span>{label}</span>
        {globalDefault && (
          <span className="ml-auto text-[8px] italic">
            global: {globalDefault || "(provider default)"}
          </span>
        )}
      </label>
      <input
        type="text"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={() => {
          if (localValue !== value) {
            onChange(localValue);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && localValue !== value) {
            onChange(localValue);
          }
        }}
        disabled={isSaving}
        placeholder={globalDefault || "(provider default)"}
        className="w-full rounded border border-terminal-border bg-white/80 px-2 py-1 font-mono text-[10px] text-terminal-dark placeholder:text-terminal-muted/40 focus:border-terminal-green focus:outline-none disabled:opacity-50"
      />
    </div>
  );
}
