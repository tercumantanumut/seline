"use client";

import { useTranslations } from "next-intl";
import { settingsSectionShellClassName } from "@/components/settings/settings-form-layout";
import { getAntigravityModels } from "@/lib/auth/antigravity-models";
import { getCodexModels } from "@/lib/auth/codex-models";
import { getClaudeCodeModels } from "@/lib/auth/claudecode-models";
import { getKimiModels } from "@/lib/auth/kimi-models";
import type { FormState } from "./settings-types";
import { LocalEmbeddingModelSelector } from "./embedding-model-selector";

const ANTIGRAVITY_MODELS = getAntigravityModels();
const CODEX_MODELS = getCodexModels();
const CLAUDECODE_MODELS = getClaudeCodeModels();
const KIMI_MODELS = getKimiModels();

interface ModelsSectionProps {
  formState: FormState;
  updateField: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
}

function ModelSelect({
  label,
  fieldKey,
  formState,
  updateField,
  antigravityDefault,
  codexDefault,
  claudecodeDefault,
  kimiDefault,
  anthropicPlaceholder,
  ollamaPlaceholder,
  openrouterPlaceholder,
  helperKey,
  t,
}: {
  label: string;
  fieldKey: "chatModel" | "researchModel" | "visionModel" | "utilityModel";
  formState: FormState;
  updateField: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  antigravityDefault: string;
  codexDefault: string;
  claudecodeDefault: string;
  kimiDefault: string;
  anthropicPlaceholder: string;
  ollamaPlaceholder: string;
  openrouterPlaceholder: string;
  helperKey: string;
  t: ReturnType<typeof useTranslations<"settings">>;
}) {
  return (
    <div>
      <label className="mb-1 block font-mono text-sm text-terminal-muted">{label}</label>
      {formState.llmProvider === "antigravity" ? (
        <select
          value={formState[fieldKey] || antigravityDefault}
          onChange={(e) => updateField(fieldKey, e.target.value)}
          className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
        >
          {ANTIGRAVITY_MODELS.map((model) => (
            <option key={model.id} value={model.id}>{model.name}</option>
          ))}
        </select>
      ) : formState.llmProvider === "codex" ? (
        <select
          value={formState[fieldKey] || codexDefault}
          onChange={(e) => updateField(fieldKey, e.target.value)}
          className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
        >
          {CODEX_MODELS.map((model) => (
            <option key={model.id} value={model.id}>{model.name}</option>
          ))}
        </select>
      ) : formState.llmProvider === "claudecode" ? (
        <select
          value={formState[fieldKey] || claudecodeDefault}
          onChange={(e) => updateField(fieldKey, e.target.value)}
          className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
        >
          {CLAUDECODE_MODELS.map((model) => (
            <option key={model.id} value={model.id}>{model.name}</option>
          ))}
        </select>
      ) : formState.llmProvider === "kimi" ? (
        <select
          value={formState[fieldKey] || kimiDefault}
          onChange={(e) => updateField(fieldKey, e.target.value)}
          className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
        >
          {KIMI_MODELS.map((model) => (
            <option key={model.id} value={model.id}>{model.name}</option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          value={formState[fieldKey] ?? ""}
          onChange={(e) => updateField(fieldKey, e.target.value)}
          placeholder={
            formState.llmProvider === "anthropic"
              ? anthropicPlaceholder
              : formState.llmProvider === "ollama"
                ? ollamaPlaceholder
                : openrouterPlaceholder
          }
          className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
        />
      )}
      <p className="mt-1 font-mono text-xs text-terminal-muted">
        {t(helperKey as Parameters<typeof t>[0])}
      </p>
    </div>
  );
}

export function ModelsSection({ formState, updateField }: ModelsSectionProps) {
  const t = useTranslations("settings");

  return (
    <div className={settingsSectionShellClassName}>
      <div>
        <h2 className="font-mono text-lg font-semibold text-terminal-dark">{t("models.title")}</h2>
        <p className="font-mono text-sm text-terminal-muted">
          {t("models.subtitle")}
        </p>
        <p className="font-mono text-xs text-terminal-muted">
          Choose which model handles each job, like chat, research, and image understanding.
        </p>
      </div>

      <div className="rounded border border-terminal-border bg-terminal-cream/30 p-4">
        <p className="font-mono text-xs text-terminal-muted">
          <strong>{t("models.defaults.label")}</strong> {t("models.defaults.value")}
        </p>
      </div>

      <div className="space-y-4">
        <ModelSelect
          label={t("models.fields.chat.label")}
          fieldKey="chatModel"
          formState={formState}
          updateField={updateField}
          antigravityDefault="claude-sonnet-4-5"
          codexDefault="gpt-5.1-codex"
          claudecodeDefault="claude-sonnet-4-5-20250929"
          kimiDefault="kimi-k2.5"
          anthropicPlaceholder="claude-sonnet-4-5-20250929"
          ollamaPlaceholder="llama3.1:8b"
          openrouterPlaceholder="x-ai/grok-4.1-fast"
          helperKey="models.fields.chat.helper"
          t={t}
        />

        <ModelSelect
          label={t("models.fields.research.label")}
          fieldKey="researchModel"
          formState={formState}
          updateField={updateField}
          antigravityDefault="gemini-3-pro-high"
          codexDefault="gpt-5.1-codex"
          claudecodeDefault="claude-opus-4-6"
          kimiDefault="kimi-k2-thinking"
          anthropicPlaceholder="claude-sonnet-4-5-20250929"
          ollamaPlaceholder="llama3.1:8b"
          openrouterPlaceholder="x-ai/grok-4.1-fast"
          helperKey="models.fields.research.helper"
          t={t}
        />

        <ModelSelect
          label={t("models.fields.vision.label")}
          fieldKey="visionModel"
          formState={formState}
          updateField={updateField}
          antigravityDefault="gemini-3-pro-low"
          codexDefault="gpt-5.1-codex"
          claudecodeDefault="claude-sonnet-4-5-20250929"
          kimiDefault="kimi-k2.5"
          anthropicPlaceholder="claude-sonnet-4-5-20250929"
          ollamaPlaceholder="llama3.1:8b"
          openrouterPlaceholder="google/gemini-2.0-flash-001"
          helperKey="models.fields.vision.helper"
          t={t}
        />

        <ModelSelect
          label={t("models.fields.utility.label")}
          fieldKey="utilityModel"
          formState={formState}
          updateField={updateField}
          antigravityDefault="gemini-3-flash"
          codexDefault="gpt-5.1-codex-mini"
          claudecodeDefault="claude-haiku-4-5-20251001"
          kimiDefault="kimi-k2-turbo-preview"
          anthropicPlaceholder="claude-haiku-4-5-20251001"
          ollamaPlaceholder="llama3.1:8b"
          openrouterPlaceholder="google/gemini-2.0-flash-lite-001"
          helperKey="models.fields.utility.helper"
          t={t}
        />

        <div>
          <label className="mb-1 block font-mono text-sm text-terminal-muted">{t("models.fields.embeddingProvider.label")}</label>
          <div className="space-y-2">
            <label className="flex items-center gap-3">
              <input
                type="radio"
                name="embeddingProvider"
                value="openrouter"
                checked={formState.embeddingProvider === "openrouter"}
                onChange={(e) => updateField("embeddingProvider", e.target.value as FormState["embeddingProvider"])}
                className="size-4 accent-terminal-green"
              />
              <span className="font-mono text-terminal-dark">
                {t("models.fields.embeddingProvider.options.openrouter")}
              </span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="radio"
                name="embeddingProvider"
                value="local"
                checked={formState.embeddingProvider === "local"}
                onChange={(e) => updateField("embeddingProvider", e.target.value as FormState["embeddingProvider"])}
                className="size-4 accent-terminal-green"
              />
              <span className="font-mono text-terminal-dark">
                {t("models.fields.embeddingProvider.options.local")}
              </span>
            </label>
          </div>
          <p className="mt-1 font-mono text-xs text-terminal-muted">
            {t("models.fields.embeddingProvider.helper")}
          </p>
        </div>

        <LocalEmbeddingModelSelector
          formState={formState}
          updateField={updateField}
          t={t}
        />

        {/* OpenRouter Advanced Options */}
        {formState.llmProvider === "openrouter" && (
          <div>
            <label className="mb-1 block font-mono text-sm text-terminal-muted">
              {t("models.fields.openrouterArgs.label")}
            </label>
            <textarea
              value={formState.openrouterArgs}
              onChange={(e) => updateField("openrouterArgs", e.target.value)}
              placeholder='{ "quant": "q4_0", "thinkingBudget": 512, "includeThoughts": false }'
              className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-xs text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green resize-none"
              rows={4}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => updateField("openrouterArgs", '{"quant":"q4_0"}')} className="px-2 py-1 text-xs font-mono text-terminal-green hover:bg-terminal-green/10 rounded transition-colors">
                {t("models.fields.openrouterArgs.presets.q4")}
              </button>
              <button type="button" onClick={() => updateField("openrouterArgs", '{"quant":"q8_0"}')} className="px-2 py-1 text-xs font-mono text-terminal-green hover:bg-terminal-green/10 rounded transition-colors">
                {t("models.fields.openrouterArgs.presets.q8")}
              </button>
              <button type="button" onClick={() => updateField("openrouterArgs", '{"quant":"auto"}')} className="px-2 py-1 text-xs font-mono text-terminal-green hover:bg-terminal-green/10 rounded transition-colors">
                {t("models.fields.openrouterArgs.presets.auto")}
              </button>
              <button type="button" onClick={() => updateField("openrouterArgs", '{"thinkingBudget":0}')} className="px-2 py-1 text-xs font-mono text-terminal-green hover:bg-terminal-green/10 rounded transition-colors">
                {t("models.fields.openrouterArgs.presets.noThinking")}
              </button>
            </div>
            <p className="mt-2 font-mono text-xs text-terminal-muted">
              {t("models.fields.openrouterArgs.helper")}
            </p>
          </div>
        )}
      </div>

      <div className="rounded border border-amber-200 bg-amber-50 p-4">
        <p className="font-mono text-xs text-amber-800">
          <strong>{t("models.tip.title")}</strong> {t("models.tip.body")}
        </p>
      </div>
    </div>
  );
}
