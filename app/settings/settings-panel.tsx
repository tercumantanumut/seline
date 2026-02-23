"use client";

import React from "react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { KeyIcon } from "lucide-react";
import { CustomWorkflowsManager, LocalModelsManager } from "@/components/comfyui";
import { AdvancedVectorSettings } from "@/components/settings/advanced-vector-settings";
import { MCPSettings } from "@/components/settings/mcp-settings";
import { PluginSettings } from "@/components/settings/plugin-settings";
import {
  SettingsField,
  SettingsOptionGroup,
  SettingsPanelCard,
  SettingsRadioCard,
  SettingsToggleRow,
  settingsInputClassName,
  settingsSectionShellClassName,
} from "@/components/settings/settings-form-layout";
import type { FormState, SettingsSection } from "./settings-types";
import { WhisperModelSelector } from "./whisper-model-selector";
import { PreferencesSection } from "./preferences-section";
import { MemorySection } from "./memory-section";
import { ApiKeysSection } from "./api-keys-section";
import { ModelsSection } from "./models-section";

export interface SettingsPanelProps {
  section: SettingsSection;
  formState: FormState;
  setFormState: React.Dispatch<React.SetStateAction<FormState>>;
  antigravityAuth: { isAuthenticated: boolean; email?: string; expiresAt?: number } | null;
  antigravityLoading: boolean;
  onAntigravityLogin: () => void;
  onAntigravityLogout: () => void;
  codexAuth: { isAuthenticated: boolean; email?: string; accountId?: string; expiresAt?: number } | null;
  codexLoading: boolean;
  onCodexLogin: () => void;
  onCodexLogout: () => void;
  claudecodeAuth: { isAuthenticated: boolean; email?: string; expiresAt?: number } | null;
  claudecodeLoading: boolean;
  onClaudeCodeLogin: () => void;
  onClaudeCodeLogout: () => void;
  claudeCodePasteMode: boolean;
  onClaudeCodePasteSubmit: (code: string) => void;
  onClaudeCodePasteCancel: () => void;
}

export function ClaudeCodePasteInput({
  loading,
  onSubmit,
  onCancel,
}: {
  loading: boolean;
  onSubmit: (code: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("settings.api.auth");
  const [code, setCode] = useState("");

  return (
    <div className="mt-3 space-y-3 border-t border-terminal-border pt-3">
      <p className="font-mono text-xs text-terminal-muted">
        {t("pasteInstructions")}
      </p>
      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={t("codePlaceholder")}
        className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter" && code.trim()) {
            onSubmit(code);
          }
        }}
      />
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          disabled={loading}
          className="rounded border border-terminal-border px-3 py-1.5 font-mono text-xs text-terminal-muted hover:bg-terminal-bg disabled:opacity-50"
        >
          {t("cancel")}
        </button>
        <button
          onClick={() => onSubmit(code)}
          disabled={loading || !code.trim()}
          className="rounded border border-terminal-green bg-terminal-green/10 px-3 py-1.5 font-mono text-xs text-terminal-green hover:bg-terminal-green/20 disabled:opacity-50"
        >
          {loading ? t("verifying") : t("submitCode")}
        </button>
      </div>
    </div>
  );
}

export function SettingsPanel({
  section,
  formState,
  setFormState,
  antigravityAuth,
  antigravityLoading,
  onAntigravityLogin,
  onAntigravityLogout,
  codexAuth,
  codexLoading,
  onCodexLogin,
  onCodexLogout,
  claudecodeAuth,
  claudecodeLoading,
  onClaudeCodeLogin,
  onClaudeCodeLogout,
  claudeCodePasteMode,
  onClaudeCodePasteSubmit,
  onClaudeCodePasteCancel,
}: SettingsPanelProps) {
  const t = useTranslations("settings");
  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
  };

  if (section === "api-keys") {
    return (
      <ApiKeysSection
        formState={formState}
        updateField={updateField}
        antigravityAuth={antigravityAuth}
        antigravityLoading={antigravityLoading}
        onAntigravityLogin={onAntigravityLogin}
        onAntigravityLogout={onAntigravityLogout}
        codexAuth={codexAuth}
        codexLoading={codexLoading}
        onCodexLogin={onCodexLogin}
        onCodexLogout={onCodexLogout}
        claudecodeAuth={claudecodeAuth}
        claudecodeLoading={claudecodeLoading}
        onClaudeCodeLogin={onClaudeCodeLogin}
        onClaudeCodeLogout={onClaudeCodeLogout}
        claudeCodePasteMode={claudeCodePasteMode}
        onClaudeCodePasteSubmit={onClaudeCodePasteSubmit}
        onClaudeCodePasteCancel={onClaudeCodePasteCancel}
      />
    );
  }

  if (section === "models") {
    return <ModelsSection formState={formState} updateField={updateField} />;
  }

  if (section === "vector-search") {
    return (
      <div className={settingsSectionShellClassName}>
        <h2 className="font-mono text-lg font-semibold text-terminal-dark">{t("vector.title")}</h2>
        <p className="font-mono text-sm text-terminal-muted">
          {t("vector.subtitle")}
        </p>

        {formState.embeddingReindexRequired && (
          <div className="rounded border border-amber-200 bg-amber-50 p-4">
            <p className="font-mono text-xs text-amber-800">
              <strong>{t("vector.reindexRequired.title")}</strong> {t("vector.reindexRequired.body")}
            </p>
            <p className="mt-2 font-mono text-xs text-amber-800">
              {t("vector.reindexRequired.folderHint")}
            </p>
          </div>
        )}

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="vectorDBEnabled"
            checked={formState.vectorDBEnabled}
            onChange={(e) => updateField("vectorDBEnabled", e.target.checked)}
            className="size-4 accent-terminal-green"
          />
          <label htmlFor="vectorDBEnabled" className="font-mono text-sm text-terminal-dark">
            {t("vector.enable")}
          </label>
        </div>

        {formState.vectorDBEnabled && (
          <div className="space-y-6">
            <div className="rounded border border-terminal-border bg-terminal-cream/50 p-4">
              <p className="font-mono text-sm text-terminal-muted">
                {t("vector.enabled")}
              </p>
              <p className="mt-2 font-mono text-xs text-terminal-muted">
                {t("vector.path")} <code className="rounded bg-terminal-dark/10 px-1">~/.local-data/vectordb/</code>
              </p>
            </div>

            {/* LLM Synthesis Toggle - Main visible option */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="llmSynthesisEnabled"
                checked={formState.vectorSearchLlmSynthesisEnabled}
                onChange={(e) => updateField("vectorSearchLlmSynthesisEnabled", e.target.checked)}
                className="size-4 accent-terminal-green"
              />
              <label htmlFor="llmSynthesisEnabled" className="font-mono text-sm text-terminal-dark">
                {t("vector.enableLlmSynthesis")}
              </label>
            </div>

            {/* Advanced Settings Accordion */}
            <AdvancedVectorSettings
              hybridEnabled={formState.vectorSearchHybridEnabled}
              onHybridEnabledChange={(v) => updateField("vectorSearchHybridEnabled", v)}
              denseWeight={formState.vectorSearchDenseWeight}
              onDenseWeightChange={(v) => updateField("vectorSearchDenseWeight", v)}
              lexicalWeight={formState.vectorSearchLexicalWeight}
              onLexicalWeightChange={(v) => updateField("vectorSearchLexicalWeight", v)}
              rrfK={formState.vectorSearchRrfK}
              onRrfKChange={(v) => updateField("vectorSearchRrfK", v)}
              tokenChunkingEnabled={formState.vectorSearchTokenChunkingEnabled}
              onTokenChunkingEnabledChange={(v) => updateField("vectorSearchTokenChunkingEnabled", v)}
              chunkSize={formState.vectorSearchTokenChunkSize}
              onChunkSizeChange={(v) => updateField("vectorSearchTokenChunkSize", v)}
              chunkStride={formState.vectorSearchTokenChunkStride}
              onChunkStrideChange={(v) => updateField("vectorSearchTokenChunkStride", v)}
              rerankingEnabled={formState.vectorSearchRerankingEnabled}
              onRerankingEnabledChange={(v) => updateField("vectorSearchRerankingEnabled", v)}
              rerankTopK={formState.vectorSearchRerankTopK}
              onRerankTopKChange={(v) => updateField("vectorSearchRerankTopK", v)}
              rerankModel={formState.vectorSearchRerankModel}
              onRerankModelChange={(v) => updateField("vectorSearchRerankModel", v)}
              queryExpansionEnabled={formState.vectorSearchQueryExpansionEnabled}
              onQueryExpansionEnabledChange={(v) => updateField("vectorSearchQueryExpansionEnabled", v)}
              maxFileLines={formState.vectorSearchMaxFileLines}
              onMaxFileLinesChange={(v) => updateField("vectorSearchMaxFileLines", v)}
              maxLineLength={formState.vectorSearchMaxLineLength}
              onMaxLineLengthChange={(v) => updateField("vectorSearchMaxLineLength", v)}
              embeddingModel={formState.embeddingModel}
              embeddingProvider={formState.embeddingProvider}
            />
          </div>
        )}
      </div>
    );
  }

  if (section === "preferences") {
    return (
      <div className={settingsSectionShellClassName}>
        <PreferencesSection formState={formState} updateField={updateField} />
      </div>
    );
  }

  if (section === "comfyui") {
    return (
      <div className={settingsSectionShellClassName}>
        <div>
          <h2 className="mb-2 text-lg font-semibold text-terminal-text">{t("localImage.heading")}</h2>
          <p className="text-sm text-terminal-muted">
            {t("localImage.description")}
          </p>
        </div>

        <div className="rounded-xl border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-terminal-border bg-terminal-green/15 text-terminal-green">
                <KeyIcon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-terminal-text">{t("localImage.hfTokenTitle")}</p>
                <p className="text-xs text-terminal-muted">
                  {t("localImage.hfTokenDesc")}
                </p>
              </div>
            </div>
            <a
              href="https://huggingface.co/settings/tokens"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-terminal-green underline hover:text-terminal-green/80"
            >
              {t("localImage.hfTokenLink")}
            </a>
          </div>
          <input
            type="password"
            value={formState.huggingFaceToken}
            onChange={(e) => updateField("huggingFaceToken", e.target.value)}
            placeholder={t("localImage.hfTokenPlaceholder")}
            className="mt-3 w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 text-sm text-terminal-text placeholder:text-terminal-muted/60 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
          />
        </div>

        <div className="rounded-xl border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-terminal-text">{t("localImage.primaryFlowTitle")}</h3>
          <p className="text-xs text-terminal-muted">{t("localImage.primaryFlowDesc")}</p>
          <p className="text-xs text-terminal-muted">{t("localImage.workflowsDesc")}</p>
        </div>

        <details className="rounded-xl border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-terminal-text">
            {t("localImage.advancedSetupTitle")}
          </summary>
          <p className="mt-2 text-xs text-terminal-muted">{t("localImage.advancedSetupDesc")}</p>

          <div className="mt-4 space-y-3">
            <p className="text-xs uppercase tracking-wide text-terminal-muted">{t("localImage.backendsLabel")}</p>
            <LocalModelsManager
              zImageEnabled={formState.comfyuiEnabled}
              zImageBackendPath={formState.comfyuiBackendPath}
              onZImageEnabledChange={(enabled: boolean) => updateField("comfyuiEnabled", enabled)}
              onZImageBackendPathChange={(path: string) => updateField("comfyuiBackendPath", path)}
              flux4bEnabled={formState.flux2Klein4bEnabled}
              flux4bBackendPath={formState.flux2Klein4bBackendPath}
              onFlux4bEnabledChange={(enabled: boolean) => updateField("flux2Klein4bEnabled", enabled)}
              onFlux4bBackendPathChange={(path: string) => updateField("flux2Klein4bBackendPath", path)}
              flux9bEnabled={formState.flux2Klein9bEnabled}
              flux9bBackendPath={formState.flux2Klein9bBackendPath}
              onFlux9bEnabledChange={(enabled: boolean) => updateField("flux2Klein9bEnabled", enabled)}
              onFlux9bBackendPathChange={(path: string) => updateField("flux2Klein9bBackendPath", path)}
            />
          </div>

          <div className="mt-6 border-t border-terminal-border/60 pt-6 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-terminal-text">{t("localImage.workflowsHeading")}</h3>
              <p className="text-xs text-terminal-muted">
                {t("localImage.workflowsDesc")}
              </p>
            </div>
            <CustomWorkflowsManager
              connectionBaseUrl={formState.comfyuiCustomBaseUrl}
              connectionHost={formState.comfyuiCustomHost}
              connectionPort={formState.comfyuiCustomPort}
              connectionUseHttps={formState.comfyuiCustomUseHttps}
              connectionAutoDetect={formState.comfyuiCustomAutoDetect}
              onConnectionBaseUrlChange={(value: string) => updateField("comfyuiCustomBaseUrl", value)}
              onConnectionHostChange={(value: string) => updateField("comfyuiCustomHost", value)}
              onConnectionPortChange={(value: number) => updateField("comfyuiCustomPort", value)}
              onConnectionUseHttpsChange={(value: boolean) => updateField("comfyuiCustomUseHttps", value)}
              onConnectionAutoDetectChange={(value: boolean) => updateField("comfyuiCustomAutoDetect", value)}
            />
          </div>
        </details>
      </div>
    );
  }

  if (section === "memory") {
    return (
      <div className={settingsSectionShellClassName}>
        <MemorySection />
      </div>
    );
  }

  if (section === "mcp") {
    return (
      <div className={settingsSectionShellClassName}>
        <div>
          <h2 className="mb-2 font-mono text-lg font-semibold text-terminal-dark">
            Tool servers (MCP)
          </h2>
          <p className="mb-4 font-mono text-sm text-terminal-muted">
            Connect external tool servers so your agent can use more tools.
          </p>
        </div>
        <MCPSettings />
      </div>
    );
  }

  if (section === "plugins") {
    return (
      <div className={settingsSectionShellClassName}>
        <PluginSettings />
      </div>
    );
  }

  if (section === "voice") {
    const ttsAutoModeOptions = [
      { value: "off" as const, label: t("voice.tts.modeOff"), description: t("voice.tts.modeOffDesc") },
      { value: "channels-only" as const, label: t("voice.tts.modeChannels"), description: t("voice.tts.modeChannelsDesc") },
      { value: "always" as const, label: t("voice.tts.modeAlways"), description: t("voice.tts.modeAlwaysDesc") },
    ];

    const ttsProviderOptions = [
      { value: "edge" as const, label: t("voice.tts.providerEdge"), description: t("voice.tts.providerEdgeDesc"), badge: t("voice.tts.badgeFree") },
      { value: "openai" as const, label: t("voice.tts.providerOpenAI"), description: t("voice.tts.providerOpenAIDesc"), badge: t("voice.tts.badgeApiKey") },
      { value: "elevenlabs" as const, label: t("voice.tts.providerElevenLabs"), description: t("voice.tts.providerElevenLabsDesc"), badge: t("voice.tts.badgeApiKey") },
    ];

    const sttProviderOptions = [
      { value: "openai" as const, label: t("voice.stt.providerOpenAI"), description: t("voice.stt.providerOpenAIDesc") },
      { value: "local" as const, label: t("voice.stt.providerLocal"), description: t("voice.stt.providerLocalDesc") },
    ];

    return (
      <div className={settingsSectionShellClassName}>
        <div className="space-y-1.5">
          <h2 className="font-mono text-lg font-semibold text-terminal-dark">{t("voice.heading")}</h2>
          <p className="font-mono text-sm text-terminal-muted">
            {t("voice.description")}
          </p>
        </div>

        <div className="space-y-5">
          <SettingsPanelCard
            title={t("voice.tts.title")}
            description={t("voice.tts.description")}
          >
            <SettingsToggleRow
              id="ttsEnabled"
              label={t("voice.tts.enableLabel")}
              description={t("voice.tts.enableDesc")}
              checked={formState.ttsEnabled}
              onChange={(checked) => updateField("ttsEnabled", checked)}
            />

            {formState.ttsEnabled ? (
              <div className="space-y-6">
                <SettingsOptionGroup
                  title={t("voice.tts.whenTitle")}
                  description={t("voice.tts.whenDesc")}
                >
                  {ttsAutoModeOptions.map((option) => (
                    <SettingsRadioCard
                      key={option.value}
                      id={`tts-auto-mode-${option.value}`}
                      name="ttsAutoMode"
                      value={option.value}
                      label={option.label}
                      description={option.description}
                      checked={formState.ttsAutoMode === option.value}
                      onChange={() => updateField("ttsAutoMode", option.value)}
                    />
                  ))}
                </SettingsOptionGroup>

                <SettingsOptionGroup
                  title={t("voice.tts.providerTitle")}
                  description={t("voice.tts.providerDesc")}
                >
                  {ttsProviderOptions.map((option) => (
                    <SettingsRadioCard
                      key={option.value}
                      id={`tts-provider-${option.value}`}
                      name="ttsProvider"
                      value={option.value}
                      label={option.label}
                      description={option.description}
                      badge={option.badge}
                      checked={formState.ttsProvider === option.value}
                      onChange={() => updateField("ttsProvider", option.value)}
                    />
                  ))}
                </SettingsOptionGroup>

                {formState.ttsProvider === "openai" && (
                  <SettingsField
                    label={t("voice.tts.defaultVoiceLabel")}
                    htmlFor="openaiTtsVoice"
                    helperText={t("voice.tts.defaultVoiceHelper")}
                    className="max-w-sm"
                  >
                    <select
                      id="openaiTtsVoice"
                      value={formState.openaiTtsVoice}
                      onChange={(e) => updateField("openaiTtsVoice", e.target.value)}
                      aria-describedby="openaiTtsVoice-help"
                      className={settingsInputClassName}
                    >
                      {["alloy", "ash", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"].map((voice) => (
                        <option key={voice} value={voice}>
                          {voice}
                        </option>
                      ))}
                    </select>
                  </SettingsField>
                )}

                {formState.ttsProvider === "elevenlabs" && (
                  <SettingsOptionGroup
                    title={t("voice.tts.elevenLabsTitle")}
                    description={t("voice.tts.elevenLabsDesc")}
                  >
                    <div className="grid gap-4 md:grid-cols-2">
                      <SettingsField label={t("voice.tts.elevenLabsKeyLabel")} htmlFor="elevenLabsApiKey">
                        <input
                          id="elevenLabsApiKey"
                          type="password"
                          value={formState.elevenLabsApiKey}
                          onChange={(e) => updateField("elevenLabsApiKey", e.target.value)}
                          placeholder={t("voice.tts.elevenLabsKeyPlaceholder")}
                          className={settingsInputClassName}
                        />
                      </SettingsField>
                      <SettingsField
                        label={t("voice.tts.voiceIdLabel")}
                        htmlFor="elevenLabsVoiceId"
                        helperText={t("voice.tts.voiceIdHelper")}
                      >
                        <input
                          id="elevenLabsVoiceId"
                          type="text"
                          value={formState.elevenLabsVoiceId}
                          onChange={(e) => updateField("elevenLabsVoiceId", e.target.value)}
                          placeholder={t("voice.tts.voiceIdPlaceholder")}
                          aria-describedby="elevenLabsVoiceId-help"
                          className={settingsInputClassName}
                        />
                      </SettingsField>
                    </div>
                  </SettingsOptionGroup>
                )}

                <SettingsField
                  label={t("voice.tts.limitLabel")}
                  htmlFor="ttsSummarizeThreshold"
                  helperText={t("voice.tts.limitHelper")}
                  className="max-w-xs"
                >
                  <input
                    id="ttsSummarizeThreshold"
                    type="number"
                    min={100}
                    max={5000}
                    step={100}
                    value={formState.ttsSummarizeThreshold}
                    onChange={(e) => updateField("ttsSummarizeThreshold", parseInt(e.target.value, 10) || 500)}
                    aria-describedby="ttsSummarizeThreshold-help"
                    className={settingsInputClassName}
                  />
                </SettingsField>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-terminal-border/60 bg-terminal-bg/5 px-3 py-2.5 font-mono text-xs text-terminal-muted dark:border-terminal-border/80 dark:bg-terminal-cream/5">
                {t("voice.tts.disabledHint")}
              </div>
            )}
          </SettingsPanelCard>

          <SettingsPanelCard
            title={t("voice.stt.title")}
            description={t("voice.stt.description")}
          >
            <SettingsToggleRow
              id="sttEnabled"
              label={t("voice.stt.enableLabel")}
              description={t("voice.stt.enableDesc")}
              checked={formState.sttEnabled}
              onChange={(checked) => updateField("sttEnabled", checked)}
            />

            {formState.sttEnabled ? (
              <div className="space-y-6">
                <SettingsOptionGroup
                  title={t("voice.stt.providerTitle")}
                  description={t("voice.stt.providerDesc")}
                >
                  {sttProviderOptions.map((option) => (
                    <SettingsRadioCard
                      key={option.value}
                      id={`stt-provider-${option.value}`}
                      name="sttProvider"
                      value={option.value}
                      label={option.label}
                      description={option.description}
                      checked={formState.sttProvider === option.value}
                      onChange={() => updateField("sttProvider", option.value)}
                    />
                  ))}
                </SettingsOptionGroup>

                {formState.sttProvider === "local" && (
                  <WhisperModelSelector formState={formState} updateField={updateField} />
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-terminal-border/60 bg-terminal-bg/5 px-3 py-2.5 font-mono text-xs text-terminal-muted dark:border-terminal-border/80 dark:bg-terminal-cream/5">
                {t("voice.stt.disabledHint")}
              </div>
            )}
          </SettingsPanelCard>
        </div>
      </div>
    );
  }

  return null;
}
