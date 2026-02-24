"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { AlertTriangle, Info } from "lucide-react";
import { settingsSectionShellClassName } from "@/components/settings/settings-form-layout";
import type { FormState } from "./settings-types";
import { ClaudeCodePasteInput } from "./settings-panel";

interface ApiKeysSectionProps {
  formState: FormState;
  updateField: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
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

export function ApiKeysSection({
  formState,
  updateField,
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
}: ApiKeysSectionProps) {
  const t = useTranslations("settings");

  return (
    <div className={settingsSectionShellClassName}>
      <div>
        <h2 className="mb-1 font-mono text-lg font-semibold text-terminal-dark">{t("api.title")}</h2>
        <p className="mb-4 font-mono text-sm text-terminal-muted">
          {t("api.description")}
        </p>
        <div className="space-y-3">
          <label className="flex items-center gap-3">
            <input
              type="radio"
              name="llmProvider"
              value="anthropic"
              checked={formState.llmProvider === "anthropic"}
              onChange={(e) => {
                updateField("llmProvider", e.target.value as FormState["llmProvider"]);
                updateField("chatModel", "");
                updateField("researchModel", "");
                updateField("visionModel", "");
                updateField("utilityModel", "");
              }}
              className="size-4 accent-terminal-green"
            />
            <span className="font-mono text-terminal-dark">{t("api.anthropic")}</span>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="radio"
              name="llmProvider"
              value="openrouter"
              checked={formState.llmProvider === "openrouter"}
              onChange={(e) => {
                updateField("llmProvider", e.target.value as FormState["llmProvider"]);
                updateField("chatModel", "");
                updateField("researchModel", "");
                updateField("visionModel", "");
                updateField("utilityModel", "");
              }}
              className="size-4 accent-terminal-green"
            />
            <span className="font-mono text-terminal-dark">{t("api.openrouter")}</span>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="radio"
              name="llmProvider"
              value="ollama"
              checked={formState.llmProvider === "ollama"}
              onChange={(e) => {
                updateField("llmProvider", e.target.value as FormState["llmProvider"]);
                updateField("chatModel", "");
                updateField("researchModel", "");
                updateField("visionModel", "");
                updateField("utilityModel", "");
              }}
              className="size-4 accent-terminal-green"
            />
            <span className="font-mono text-terminal-dark">{t("api.ollama")}</span>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="radio"
              name="llmProvider"
              value="kimi"
              checked={formState.llmProvider === "kimi"}
              onChange={(e) => {
                updateField("llmProvider", e.target.value as FormState["llmProvider"]);
                updateField("chatModel", "");
                updateField("researchModel", "");
                updateField("visionModel", "");
                updateField("utilityModel", "");
              }}
              className="size-4 accent-terminal-green"
            />
            <span className="font-mono text-terminal-dark">{t("api.kimi")}</span>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="radio"
              name="llmProvider"
              value="codex"
              checked={formState.llmProvider === "codex"}
              onChange={(e) => {
                updateField("llmProvider", e.target.value as FormState["llmProvider"]);
                updateField("chatModel", "");
                updateField("researchModel", "");
                updateField("visionModel", "");
                updateField("utilityModel", "");
              }}
              disabled={!codexAuth?.isAuthenticated}
              className="size-4 accent-terminal-green disabled:opacity-50"
            />
            <span className={cn(
              "font-mono",
              codexAuth?.isAuthenticated ? "text-terminal-dark" : "text-terminal-muted"
            )}>
              Codex
              {codexAuth?.isAuthenticated && (
                <span className="ml-2 text-xs text-terminal-green">{t("api.readyStatus")}</span>
              )}
            </span>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="radio"
              name="llmProvider"
              value="claudecode"
              checked={formState.llmProvider === "claudecode"}
              onChange={(e) => {
                updateField("llmProvider", e.target.value as FormState["llmProvider"]);
                updateField("chatModel", "");
                updateField("researchModel", "");
                updateField("visionModel", "");
                updateField("utilityModel", "");
              }}
              disabled={!claudecodeAuth?.isAuthenticated}
              className="size-4 accent-terminal-green disabled:opacity-50"
            />
            <span className={cn(
              "font-mono",
              claudecodeAuth?.isAuthenticated ? "text-terminal-dark" : "text-terminal-muted"
            )}>
              Claude Code
              {claudecodeAuth?.isAuthenticated && (
                <span className="ml-2 text-xs text-terminal-green">{t("api.readyStatus")}</span>
              )}
            </span>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="radio"
              name="llmProvider"
              value="antigravity"
              checked={formState.llmProvider === "antigravity"}
              onChange={(e) => {
                updateField("llmProvider", e.target.value as FormState["llmProvider"]);
                updateField("chatModel", "");
                updateField("researchModel", "");
                updateField("visionModel", "");
                updateField("utilityModel", "");
              }}
              disabled={!antigravityAuth?.isAuthenticated}
              className="size-4 accent-terminal-green disabled:opacity-50"
            />
            <span className={cn(
              "font-mono",
              antigravityAuth?.isAuthenticated ? "text-terminal-dark" : "text-terminal-muted"
            )}>
              Antigravity
              {antigravityAuth?.isAuthenticated && (
                <span className="ml-2 text-xs text-terminal-green">{t("api.readyStatus")}</span>
              )}
            </span>
          </label>
        </div>
      </div>

      {/* Antigravity OAuth Section */}
      <div className="rounded-lg border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-mono text-sm font-semibold text-terminal-dark">
              {t("api.auth.antigravityTitle")}
            </h3>
            <p className="mt-1 font-mono text-xs text-terminal-muted">
              {t("api.auth.antigravityDesc")}
            </p>
            <p className="mt-1 font-mono text-xs text-terminal-amber inline-flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {t("api.auth.antigravityWarning")}
            </p>
            {antigravityAuth?.isAuthenticated && antigravityAuth.email && (
              <p className="mt-1 font-mono text-xs text-terminal-green">
                {t("api.auth.signedIn", { email: antigravityAuth.email })}
              </p>
            )}
          </div>
          <div>
            {antigravityAuth?.isAuthenticated ? (
              <button
                onClick={onAntigravityLogout}
                disabled={antigravityLoading}
                className="rounded border border-red-300 bg-red-50 px-3 py-1.5 font-mono text-xs text-red-600 hover:bg-red-100 disabled:opacity-50"
              >
                {antigravityLoading ? "..." : t("api.auth.signOut")}
              </button>
            ) : (
              <button
                onClick={onAntigravityLogin}
                disabled={antigravityLoading}
                className="rounded border border-terminal-green bg-terminal-green/10 px-3 py-1.5 font-mono text-xs text-terminal-green hover:bg-terminal-green/20 disabled:opacity-50"
              >
                {antigravityLoading ? t("api.auth.connecting") : t("api.auth.signInGoogle")}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Codex OAuth Section */}
      <div className="rounded-lg border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-mono text-sm font-semibold text-terminal-dark">
              {t("api.auth.codexTitle")}
            </h3>
            <p className="mt-1 font-mono text-xs text-terminal-muted">
              {t("api.auth.codexDesc")}
            </p>
            {codexAuth?.isAuthenticated && (codexAuth.email || codexAuth.accountId) && (
              <p className="mt-1 font-mono text-xs text-terminal-green">
                {t("api.auth.signedIn", { email: codexAuth.email || codexAuth.accountId || "" })}
              </p>
            )}
          </div>
          <div>
            {codexAuth?.isAuthenticated ? (
              <button
                onClick={onCodexLogout}
                disabled={codexLoading}
                className="rounded border border-red-300 bg-red-50 px-3 py-1.5 font-mono text-xs text-red-600 hover:bg-red-100 disabled:opacity-50"
              >
                {codexLoading ? "..." : t("api.auth.signOut")}
              </button>
            ) : (
              <button
                onClick={onCodexLogin}
                disabled={codexLoading}
                className="rounded border border-terminal-green bg-terminal-green/10 px-3 py-1.5 font-mono text-xs text-terminal-green hover:bg-terminal-green/20 disabled:opacity-50"
              >
                {codexLoading ? t("api.auth.connecting") : t("api.auth.signInOpenAI")}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Claude Code OAuth Section */}
      <div className="rounded-lg border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-mono text-sm font-semibold text-terminal-dark">
              {t("api.auth.claudecodeTitle")}
            </h3>
            <p className="mt-1 font-mono text-xs text-terminal-muted">
              {t("api.auth.claudecodeDesc")}
            </p>
            <p className="mt-1 font-mono text-xs text-terminal-blue inline-flex items-center gap-1">
              <Info className="w-3 h-3" />
              {t("api.auth.claudecodeWarning")}
            </p>
            {claudecodeAuth?.isAuthenticated && claudecodeAuth.email && (
              <p className="mt-1 font-mono text-xs text-terminal-green">
                {t("api.auth.signedIn", { email: claudecodeAuth.email })}
              </p>
            )}
          </div>
          <div>
            {claudecodeAuth?.isAuthenticated ? (
              <button
                onClick={onClaudeCodeLogout}
                disabled={claudecodeLoading}
                className="rounded border border-red-300 bg-red-50 px-3 py-1.5 font-mono text-xs text-red-600 hover:bg-red-100 disabled:opacity-50"
              >
                {claudecodeLoading ? "..." : t("api.auth.signOut")}
              </button>
            ) : !claudeCodePasteMode ? (
              <button
                onClick={onClaudeCodeLogin}
                disabled={claudecodeLoading}
                className="rounded border border-terminal-green bg-terminal-green/10 px-3 py-1.5 font-mono text-xs text-terminal-green hover:bg-terminal-green/20 disabled:opacity-50"
              >
                {claudecodeLoading ? t("api.auth.connecting") : t("api.auth.signInAnthropic")}
              </button>
            ) : null}
          </div>
        </div>
        {claudeCodePasteMode && !claudecodeAuth?.isAuthenticated && (
          <ClaudeCodePasteInput
            loading={claudecodeLoading}
            onSubmit={onClaudeCodePasteSubmit}
            onCancel={onClaudeCodePasteCancel}
          />
        )}
      </div>

      <div className="space-y-4">
        <h2 className="font-mono text-lg font-semibold text-terminal-dark">{t("api.keysTitle")}</h2>

        {formState.llmProvider === "ollama" && (
          <div>
            <label className="mb-1 block font-mono text-sm text-terminal-muted">{t("api.fields.ollama.label")}</label>
            <input
              type="text"
              value={formState.ollamaBaseUrl}
              onChange={(e) => updateField("ollamaBaseUrl", e.target.value)}
              placeholder={t("api.fields.ollama.placeholder")}
              className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
            />
            <p className="mt-1 font-mono text-xs text-terminal-muted">
              {t("api.fields.ollama.helper")}
            </p>
          </div>
        )}

        <div>
          <label className="mb-1 block font-mono text-sm text-terminal-muted">{t("api.fields.anthropic.label")}</label>
          <input
            type="password"
            value={formState.anthropicApiKey}
            onChange={(e) => updateField("anthropicApiKey", e.target.value)}
            placeholder={t("api.fields.anthropic.placeholder")}
            className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
          />
          <p className="mt-1 font-mono text-xs text-terminal-muted">{t("api.fields.anthropic.helper")}</p>
        </div>

        <div>
          <label className="mb-1 block font-mono text-sm text-terminal-muted">{t("api.fields.openrouter.label")}</label>
          <input
            type="password"
            value={formState.openrouterApiKey}
            onChange={(e) => updateField("openrouterApiKey", e.target.value)}
            placeholder={t("api.fields.openrouter.placeholder")}
            className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
          />
          <p className="mt-1 font-mono text-xs text-terminal-muted">{t("api.fields.openrouter.helper")}</p>
        </div>

        <div>
          <label className="mb-1 block font-mono text-sm text-terminal-muted">{t("api.fields.kimi.label")}</label>
          <input
            type="password"
            value={formState.kimiApiKey}
            onChange={(e) => updateField("kimiApiKey", e.target.value)}
            placeholder={t("api.fields.kimi.placeholder")}
            className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
          />
          <p className="mt-1 font-mono text-xs text-terminal-muted">{t("api.fields.kimi.helper")}</p>
        </div>

        <div>
          <label className="mb-1 block font-mono text-sm text-terminal-muted">{t("api.fields.openai.label")}</label>
          <input
            type="password"
            value={formState.openaiApiKey}
            onChange={(e) => updateField("openaiApiKey", e.target.value)}
            placeholder={t("api.fields.openai.placeholder")}
            className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
          />
          <p className="mt-1 font-mono text-xs text-terminal-muted">
            {t("api.fields.openai.helper")}{" "}
            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-terminal-green underline hover:text-terminal-green/80">
              platform.openai.com
            </a>
          </p>
        </div>

        <div>
          <label className="mb-1 block font-mono text-sm text-terminal-muted">
            {t("api.fields.webSearchProvider.label")}
          </label>
          <div className="space-y-2">
            <label className="flex items-center gap-3">
              <input
                type="radio"
                name="webSearchProvider"
                value="auto"
                checked={formState.webSearchProvider === "auto"}
                onChange={(e) => updateField("webSearchProvider", e.target.value as FormState["webSearchProvider"])}
                className="size-4 accent-terminal-green"
              />
              <span className="font-mono text-terminal-dark">
                {t("api.fields.webSearchProvider.options.auto")}
              </span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="radio"
                name="webSearchProvider"
                value="tavily"
                checked={formState.webSearchProvider === "tavily"}
                onChange={(e) => updateField("webSearchProvider", e.target.value as FormState["webSearchProvider"])}
                className="size-4 accent-terminal-green"
              />
              <span className="font-mono text-terminal-dark">
                {t("api.fields.webSearchProvider.options.tavily")}
              </span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="radio"
                name="webSearchProvider"
                value="duckduckgo"
                checked={formState.webSearchProvider === "duckduckgo"}
                onChange={(e) => updateField("webSearchProvider", e.target.value as FormState["webSearchProvider"])}
                className="size-4 accent-terminal-green"
              />
              <span className="font-mono text-terminal-dark">
                {t("api.fields.webSearchProvider.options.duckduckgo")}
              </span>
            </label>
          </div>
          <p className="mt-1 font-mono text-xs text-terminal-muted">
            {t("api.fields.webSearchProvider.helper")}
          </p>
        </div>

        <div>
          <label className="mb-1 block font-mono text-sm text-terminal-muted">{t("api.fields.tavily.label")}</label>
          <input
            type="password"
            value={formState.tavilyApiKey}
            onChange={(e) => updateField("tavilyApiKey", e.target.value)}
            placeholder={t("api.fields.tavily.placeholder")}
            className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
          />
          <p className="mt-1 font-mono text-xs text-terminal-muted">{t("api.fields.tavily.helper")}</p>
        </div>

        <div>
          <label className="mb-1 block font-mono text-sm text-terminal-muted">
            {t("api.fields.webScraperProvider.label")}
          </label>
          <div className="space-y-2">
            <label className="flex items-center gap-3">
              <input
                type="radio"
                name="webScraperProvider"
                value="firecrawl"
                checked={formState.webScraperProvider === "firecrawl"}
                onChange={(e) => updateField("webScraperProvider", e.target.value as FormState["webScraperProvider"])}
                className="size-4 accent-terminal-green"
              />
              <span className="font-mono text-terminal-dark">
                {t("api.fields.webScraperProvider.options.firecrawl")}
              </span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="radio"
                name="webScraperProvider"
                value="local"
                checked={formState.webScraperProvider === "local"}
                onChange={(e) => updateField("webScraperProvider", e.target.value as FormState["webScraperProvider"])}
                className="size-4 accent-terminal-green"
              />
              <span className="font-mono text-terminal-dark">
                {t("api.fields.webScraperProvider.options.local")}
              </span>
            </label>
          </div>
          <p className="mt-1 font-mono text-xs text-terminal-muted">
            {t("api.fields.webScraperProvider.helper")}
          </p>
        </div>

        <div>
          <label className="mb-1 block font-mono text-sm text-terminal-muted">{t("api.fields.firecrawl.label")}</label>
          <input
            type="password"
            value={formState.firecrawlApiKey}
            onChange={(e) => updateField("firecrawlApiKey", e.target.value)}
            placeholder={t("api.fields.firecrawl.placeholder")}
            className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
          />
          <p className="mt-1 font-mono text-xs text-terminal-muted">{t("api.fields.firecrawl.helper")}</p>
        </div>

        <div>
          <label className="mb-1 block font-mono text-sm text-terminal-muted">{t("api.fields.seline.label")}</label>
          <input
            type="password"
            value={formState.stylyAiApiKey}
            onChange={(e) => updateField("stylyAiApiKey", e.target.value)}
            placeholder={t("api.fields.seline.placeholder")}
            className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark placeholder:text-terminal-muted/50 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
          />
          <p className="mt-1 font-mono text-xs text-terminal-muted">{t("api.fields.seline.helper")}</p>
        </div>
      </div>
    </div>
  );
}
