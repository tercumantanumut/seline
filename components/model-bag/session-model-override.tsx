"use client";

/**
 * SessionModelOverride — Per-session model picker.
 *
 * Shows the current precedence chain for the active chat session and lets the
 * user override role-specific models without touching agent or global defaults.
 */

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { resilientFetch, resilientPut } from "@/lib/utils/resilient-fetch";
import { PROVIDER_DISPLAY_NAMES, ROLE_THEME } from "./model-bag.constants";
import type {
  LLMProvider,
  ModelConfigSource,
  ModelRole,
  ResolvedModelConfig,
  ResolvedModelSources,
  SessionModelConfig,
} from "./model-bag.types";
import { CpuIcon, XIcon, Loader2Icon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";

interface SessionModelOverrideProps {
  sessionId: string;
  className?: string;
}

type ScopeValues = {
  provider: string;
  chatModel: string;
  researchModel: string;
  visionModel: string;
  utilityModel: string;
};

interface SessionModelState {
  hasOverrides: boolean;
  config: SessionModelConfig;
  agentDefaults: ScopeValues;
  globalDefaults: ScopeValues;
  effective: ScopeValues;
  sources: ResolvedModelSources;
  isLoading: boolean;
  isSaving: boolean;
}

const EMPTY_SCOPE_VALUES: ScopeValues = {
  provider: "",
  chatModel: "",
  researchModel: "",
  visionModel: "",
  utilityModel: "",
};

const ROLE_ORDER: ModelRole[] = ["chat", "research", "vision", "utility"];

const ROLE_VALUE_KEYS: Record<ModelRole, keyof ScopeValues> = {
  chat: "chatModel",
  research: "researchModel",
  vision: "visionModel",
  utility: "utilityModel",
};

const ROLE_SOURCE_KEYS: Record<ModelRole, keyof ResolvedModelSources> = {
  chat: "chatModel",
  research: "researchModel",
  vision: "visionModel",
  utility: "utilityModel",
};

const EMPTY_SOURCES: ResolvedModelSources = {
  provider: "global",
  chatModel: "global",
  researchModel: "global",
  visionModel: "global",
  utilityModel: "global",
};

function sessionConfigToScopeValues(config: SessionModelConfig): ScopeValues {
  return {
    provider: config.sessionProvider || "",
    chatModel: config.sessionChatModel || "",
    researchModel: config.sessionResearchModel || "",
    visionModel: config.sessionVisionModel || "",
    utilityModel: config.sessionUtilityModel || "",
  };
}

function normalizeScopeValues(values?: Partial<ResolvedModelConfig> | Partial<ScopeValues> | null): ScopeValues {
  return {
    provider: values?.provider || "",
    chatModel: values?.chatModel || "",
    researchModel: values?.researchModel || "",
    visionModel: values?.visionModel || "",
    utilityModel: values?.utilityModel || "",
  };
}

function getSourceTranslationKey(source: ModelConfigSource): string {
  switch (source) {
    case "session":
      return "sourceSession";
    case "agent":
      return "sourceAgent";
    case "global":
      return "sourceGlobal";
    case "provider-default":
      return "sourceProviderDefault";
  }
}

function formatProvider(provider: string, t: ReturnType<typeof useTranslations<"modelBag.sessionOverride">>) {
  if (!provider) return t("emptyValue");
  return PROVIDER_DISPLAY_NAMES[provider as LLMProvider] || provider;
}

function formatScopeValue(value: string, t: ReturnType<typeof useTranslations<"modelBag.sessionOverride">>) {
  return value || t("emptyValue");
}

export function SessionModelOverride({
  sessionId,
  className,
}: SessionModelOverrideProps) {
  const t = useTranslations("modelBag.sessionOverride");
  const [state, setState] = useState<SessionModelState>({
    hasOverrides: false,
    config: {},
    agentDefaults: { ...EMPTY_SCOPE_VALUES },
    globalDefaults: { ...EMPTY_SCOPE_VALUES, provider: "anthropic" },
    effective: { ...EMPTY_SCOPE_VALUES },
    sources: { ...EMPTY_SOURCES },
    isLoading: true,
    isSaving: false,
  });
  const [expanded, setExpanded] = useState(false);

  const fetchConfig = useCallback(async () => {
    const { data, error } = await resilientFetch<{
      hasOverrides: boolean;
      config: SessionModelConfig;
      agentDefaults?: ScopeValues;
      globalDefaults?: ScopeValues;
      effective?: ResolvedModelConfig;
      sources?: ResolvedModelSources;
    }>(`/api/sessions/${sessionId}/model-config`);

    if (error || !data) {
      setState((prev) => ({ ...prev, isLoading: false }));
      return;
    }

    setState((prev) => ({
      ...prev,
      hasOverrides: data.hasOverrides,
      config: data.config,
      agentDefaults: normalizeScopeValues(data.agentDefaults),
      globalDefaults: normalizeScopeValues(data.globalDefaults),
      effective: normalizeScopeValues(data.effective),
      sources: data.sources || { ...EMPTY_SOURCES },
      isLoading: false,
    }));
  }, [sessionId]);

  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  const saveOverride = useCallback(
    async (update: Partial<SessionModelConfig>) => {
      setState((prev) => ({ ...prev, isSaving: true }));
      const { data, error } = await resilientPut<{
        config: SessionModelConfig;
        effective?: ResolvedModelConfig;
        sources?: ResolvedModelSources;
      }>(`/api/sessions/${sessionId}/model-config`, {
        ...state.config,
        ...update,
      });

      if (error || !data) {
        toast.error(t("updateFailed"));
        setState((prev) => ({ ...prev, isSaving: false }));
        return;
      }

      setState((prev) => ({
        ...prev,
        hasOverrides: Object.values(data.config || {}).some(Boolean),
        config: data.config,
        effective: normalizeScopeValues(data.effective),
        sources: data.sources || prev.sources,
        isSaving: false,
      }));
      toast.success(t("updateSuccess"));
    },
    [sessionId, state.config, t],
  );

  const clearOverrides = useCallback(async () => {
    setState((prev) => ({ ...prev, isSaving: true }));
    const { data, error } = await resilientPut<{
      config: SessionModelConfig;
      effective?: ResolvedModelConfig;
      sources?: ResolvedModelSources;
    }>(`/api/sessions/${sessionId}/model-config`, { clear: true });

    if (error) {
      toast.error(t("clearFailed"));
      setState((prev) => ({ ...prev, isSaving: false }));
      return;
    }

    setState((prev) => ({
      ...prev,
      hasOverrides: false,
      config: data?.config || {},
      effective: normalizeScopeValues(data?.effective),
      sources: data?.sources || prev.sources,
      isSaving: false,
    }));
    toast.success(t("clearSuccess"));
  }, [sessionId, t]);

  if (state.isLoading) {
    return (
      <div className={cn("flex items-center gap-2 p-2", className)}>
        <Loader2Icon className="size-3 animate-spin text-terminal-muted" />
        <span className="font-mono text-[10px] text-terminal-muted">{t("loadingConfig")}</span>
      </div>
    );
  }

  const sessionSnapshot = sessionConfigToScopeValues(state.config);
  const headerSource = t(getSourceTranslationKey(state.sources.chatModel));

  return (
    <div className={cn("rounded-lg border border-terminal-border bg-white/70 p-2", className)}>
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center gap-2 font-mono text-[10px]"
      >
        <CpuIcon className="size-3 text-terminal-green" />
        <span className="font-bold text-terminal-dark">{t("modelLabel")}</span>
        <span className="rounded bg-terminal-dark/5 px-1.5 py-0.5 text-[9px] text-terminal-muted">
          {headerSource}
        </span>
        <span className="ml-auto truncate text-terminal-muted">
          {formatScopeValue(state.effective.chatModel, t)}
        </span>
        {expanded ? (
          <ChevronUpIcon className="size-3 text-terminal-muted" />
        ) : (
          <ChevronDownIcon className="size-3 text-terminal-muted" />
        )}
      </button>

      {expanded && (
        <div className="mt-2 space-y-3 border-t border-terminal-border/50 pt-3">
          <div className="rounded border border-terminal-green/20 bg-terminal-green/5 px-3 py-2">
            <p className="font-mono text-[10px] text-terminal-dark">{t("precedence")}</p>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            <ScopeSnapshotCard title={t("sessionScopeTitle")} values={sessionSnapshot} />
            <ScopeSnapshotCard title={t("agentScopeTitle")} values={state.agentDefaults} />
            <ScopeSnapshotCard title={t("globalScopeTitle")} values={state.globalDefaults} />
            <ScopeSnapshotCard
              title={t("effectiveScopeTitle")}
              values={state.effective}
              sources={state.sources}
              highlight
            />
          </div>

          <div className="space-y-2">
            <ModelOverrideField
              label={t("chatModel")}
              role="chat"
              value={state.config.sessionChatModel || ""}
              effectiveValue={state.effective.chatModel}
              effectiveSource={state.sources.chatModel}
              onChange={(value) => saveOverride({ sessionChatModel: value })}
              isSaving={state.isSaving}
            />
            <ModelOverrideField
              label={t("researchModel")}
              role="research"
              value={state.config.sessionResearchModel || ""}
              effectiveValue={state.effective.researchModel}
              effectiveSource={state.sources.researchModel}
              onChange={(value) => saveOverride({ sessionResearchModel: value })}
              isSaving={state.isSaving}
            />
            <ModelOverrideField
              label={t("visionModel")}
              role="vision"
              value={state.config.sessionVisionModel || ""}
              effectiveValue={state.effective.visionModel}
              effectiveSource={state.sources.visionModel}
              onChange={(value) => saveOverride({ sessionVisionModel: value })}
              isSaving={state.isSaving}
            />
            <ModelOverrideField
              label={t("utilityModel")}
              role="utility"
              value={state.config.sessionUtilityModel || ""}
              effectiveValue={state.effective.utilityModel}
              effectiveSource={state.sources.utilityModel}
              onChange={(value) => saveOverride({ sessionUtilityModel: value })}
              isSaving={state.isSaving}
            />
          </div>

          {state.hasOverrides && (
            <button
              onClick={clearOverrides}
              disabled={state.isSaving}
              className="flex w-full items-center justify-center gap-1 rounded border border-red-200 bg-red-50 px-2 py-1 font-mono text-[10px] text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
            >
              <XIcon className="size-3" />
              {t("clearAllOverrides")}
            </button>
          )}

          <p className="font-mono text-[9px] text-terminal-muted">{t("helpText")}</p>
        </div>
      )}
    </div>
  );
}

function ScopeSnapshotCard({
  title,
  values,
  sources,
  highlight = false,
}: {
  title: string;
  values: ScopeValues;
  sources?: ResolvedModelSources;
  highlight?: boolean;
}) {
  const t = useTranslations("modelBag.sessionOverride");

  return (
    <div
      className={cn(
        "rounded border p-3",
        highlight
          ? "border-terminal-green/30 bg-terminal-green/5"
          : "border-terminal-border/50 bg-terminal-bg/5",
      )}
    >
      <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wide text-terminal-dark">
        {title}
      </p>
      <div className="space-y-1.5">
        <SnapshotRow
          label={t("providerLabel")}
          value={formatProvider(values.provider, t)}
          source={sources?.provider}
        />
        {ROLE_ORDER.map((role) => (
          <SnapshotRow
            key={role}
            label={t(`${role}Model`)}
            value={formatScopeValue(values[ROLE_VALUE_KEYS[role]], t)}
            source={sources?.[ROLE_SOURCE_KEYS[role]]}
          />
        ))}
      </div>
    </div>
  );
}

function SnapshotRow({
  label,
  value,
  source,
}: {
  label: string;
  value: string;
  source?: ModelConfigSource;
}) {
  const t = useTranslations("modelBag.sessionOverride");

  return (
    <div className="flex items-center gap-2 text-[10px] font-mono">
      <span className="text-terminal-muted">{label}</span>
      <span className="ml-auto truncate text-terminal-dark">{value}</span>
      {source ? (
        <span className="rounded bg-terminal-dark/5 px-1 py-0.5 text-[8px] uppercase text-terminal-muted">
          {t(getSourceTranslationKey(source))}
        </span>
      ) : null}
    </div>
  );
}

function ModelOverrideField({
  label,
  role,
  value,
  effectiveValue,
  effectiveSource,
  onChange,
  isSaving,
}: {
  label: string;
  role: ModelRole;
  value: string;
  effectiveValue: string;
  effectiveSource: ModelConfigSource;
  onChange: (value: string) => void;
  isSaving: boolean;
}) {
  const t = useTranslations("modelBag.sessionOverride");
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return (
    <div>
      <label className="mb-0.5 flex items-center gap-1 font-mono text-[9px] text-terminal-muted">
        <span>{ROLE_THEME[role].label}</span>
        <span className="ml-auto text-[8px] italic">
          {t("effectiveLabel")}: {t(getSourceTranslationKey(effectiveSource))}
        </span>
      </label>
      <input
        type="text"
        value={localValue}
        onChange={(event) => setLocalValue(event.target.value)}
        onBlur={() => {
          if (localValue !== value) {
            onChange(localValue);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && localValue !== value) {
            onChange(localValue);
          }
        }}
        disabled={isSaving}
        placeholder={effectiveValue || t("providerDefault")}
        className="w-full rounded border border-terminal-border bg-white/80 px-2 py-1 font-mono text-[10px] text-terminal-dark placeholder:text-terminal-muted/40 focus:border-terminal-green focus:outline-none disabled:opacity-50"
      />
    </div>
  );
}
