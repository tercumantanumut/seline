"use client";

import { useTranslations, useLocale } from "next-intl";
import { locales, localeCookieName, type Locale } from "@/i18n/config";
import type { FormState } from "./settings-types";

interface PreferencesSectionProps {
  formState: FormState;
  updateField: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
}

export function PreferencesSection({ formState, updateField }: PreferencesSectionProps) {
  const t = useTranslations("settings");
  const currentLocale = useLocale() as Locale;

  const handleLocaleChange = (newLocale: Locale) => {
    document.cookie = `${localeCookieName}=${newLocale}; path=/; max-age=31536000`;
    window.location.reload();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-mono text-lg font-semibold text-terminal-dark">{t("preferences.title")}</h2>
        <p className="mt-1 font-mono text-sm text-terminal-muted">
          {t("preferences.description")}
        </p>
      </div>

      <div>
        <label className="mb-2 block font-mono text-sm text-terminal-muted">{t("preferences.theme.label")}</label>
        <div className="space-y-3">
          {(["dark", "light", "system"] as const).map((theme) => (
            <label key={theme} className="flex items-center gap-3">
              <input
                type="radio"
                name="theme"
                value={theme}
                checked={formState.theme === theme}
                onChange={(e) => updateField("theme", e.target.value as "dark" | "light" | "system")}
                className="size-4 accent-terminal-green"
              />
              <span className="font-mono capitalize text-terminal-dark">{t(`preferences.theme.${theme}`)}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-2 block font-mono text-sm text-terminal-muted">{t("preferences.language.label")}</label>
        <div className="space-y-3">
          {locales.map((locale) => (
            <label key={locale} className="flex items-center gap-3">
              <input
                type="radio"
                name="language"
                value={locale}
                checked={currentLocale === locale}
                onChange={() => handleLocaleChange(locale)}
                className="size-4 accent-terminal-green"
              />
              <span className="font-mono text-terminal-dark">{t(`preferences.language.${locale}`)}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Tool Loading Mode */}
      <div>
        <label className="mb-2 block font-mono text-sm text-terminal-muted">
          {t("preferences.toolLoading.label")}
        </label>
        <div className="space-y-3">
          <label className="flex items-start gap-3">
            <input
              type="radio"
              name="toolLoadingMode"
              value="deferred"
              checked={formState.toolLoadingMode === "deferred"}
              onChange={() => updateField("toolLoadingMode", "deferred")}
              className="mt-1 size-4 accent-terminal-green"
            />
            <div>
              <span className="font-mono text-terminal-dark">{t("preferences.toolLoading.deferred")}</span>
              <p className="font-mono text-xs text-terminal-muted">{t("preferences.toolLoading.deferredHelper")}</p>
            </div>
          </label>
          <label className="flex items-start gap-3">
            <input
              type="radio"
              name="toolLoadingMode"
              value="always"
              checked={formState.toolLoadingMode === "always" || !formState.toolLoadingMode}
              onChange={() => updateField("toolLoadingMode", "always")}
              className="mt-1 size-4 accent-terminal-green"
            />
            <div>
              <span className="font-mono text-terminal-dark">{t("preferences.toolLoading.always")}</span>
              <p className="font-mono text-xs text-terminal-muted">{t("preferences.toolLoading.alwaysHelper")}</p>
            </div>
          </label>
        </div>
      </div>

      <div className="space-y-4 rounded border border-terminal-border bg-terminal-cream/30 p-4">
        <div>
          <h3 className="font-mono text-base font-semibold text-terminal-dark">{t("localGrep.heading")}</h3>
          <p className="mt-1 font-mono text-xs text-terminal-muted">{t("localGrep.description")}</p>
          <p className="mt-2 font-mono text-xs text-terminal-muted">{t("localGrep.tip")}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex items-center justify-between rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2">
            <span className="font-mono text-sm text-terminal-dark">{t("localGrep.enableLabel")}</span>
            <input
              type="checkbox"
              checked={formState.localGrepEnabled}
              onChange={(e) => updateField("localGrepEnabled", e.target.checked)}
              className="size-4 accent-terminal-green"
            />
          </label>
          <label className="flex items-center justify-between rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2">
            <span className="font-mono text-sm text-terminal-dark">{t("localGrep.gitignoreLabel")}</span>
            <input
              type="checkbox"
              checked={formState.localGrepRespectGitignore}
              onChange={(e) => updateField("localGrepRespectGitignore", e.target.checked)}
              className="size-4 accent-terminal-green"
            />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block font-mono text-xs text-terminal-muted">{t("localGrep.maxResultsLabel")}</label>
            <input
              type="number"
              min={1}
              max={100}
              value={formState.localGrepMaxResults}
              onChange={(e) => updateField("localGrepMaxResults", Number(e.target.value) || 20)}
              className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
            />
          </div>
          <div>
            <label className="mb-1 block font-mono text-xs text-terminal-muted">{t("localGrep.contextLinesLabel")}</label>
            <input
              type="number"
              min={0}
              max={10}
              value={formState.localGrepContextLines}
              onChange={(e) => updateField("localGrepContextLines", Number(e.target.value) || 2)}
              className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
            />
          </div>
        </div>
      </div>

      {/* Post-Edit Hooks */}
      <div className="space-y-4 rounded border border-terminal-border bg-terminal-cream/30 p-4">
        <div>
          <h3 className="font-mono text-base font-semibold text-terminal-dark">{t("preferences.postEditHooks.heading")}</h3>
          <p className="mt-1 font-mono text-xs text-terminal-muted">
            {t("preferences.postEditHooks.description")}
          </p>
        </div>

        <div>
          <label className="mb-2 block font-mono text-sm text-terminal-dark">{t("preferences.postEditHooks.profileLabel")}</label>
          <div className="space-y-2">
            <label className="flex items-start gap-3">
              <input
                type="radio"
                name="postEditHooksPreset"
                value="off"
                checked={formState.postEditHooksPreset === "off"}
                onChange={() => {
                  updateField("postEditHooksPreset", "off");
                  updateField("postEditHooksEnabled", false);
                  updateField("postEditTypecheckEnabled", false);
                  updateField("postEditLintEnabled", false);
                }}
                className="mt-1 size-4 accent-terminal-green"
              />
              <div>
                <span className="font-mono text-terminal-dark">{t("preferences.postEditHooks.off")}</span>
                <p className="font-mono text-xs text-terminal-muted">{t("preferences.postEditHooks.offDesc")}</p>
              </div>
            </label>
            <label className="flex items-start gap-3">
              <input
                type="radio"
                name="postEditHooksPreset"
                value="fast"
                checked={formState.postEditHooksPreset === "fast"}
                onChange={() => {
                  updateField("postEditHooksPreset", "fast");
                  updateField("postEditHooksEnabled", true);
                  updateField("postEditTypecheckEnabled", true);
                  updateField("postEditLintEnabled", false);
                  updateField("postEditTypecheckScope", "auto");
                  updateField("postEditRunInPatchTool", false);
                }}
                className="mt-1 size-4 accent-terminal-green"
              />
              <div>
                <span className="font-mono text-terminal-dark">{t("preferences.postEditHooks.fast")}</span>
                <p className="font-mono text-xs text-terminal-muted">{t("preferences.postEditHooks.fastDesc")}</p>
              </div>
            </label>
            <label className="flex items-start gap-3">
              <input
                type="radio"
                name="postEditHooksPreset"
                value="strict"
                checked={formState.postEditHooksPreset === "strict"}
                onChange={() => {
                  updateField("postEditHooksPreset", "strict");
                  updateField("postEditHooksEnabled", true);
                  updateField("postEditTypecheckEnabled", true);
                  updateField("postEditLintEnabled", true);
                  updateField("postEditTypecheckScope", "all");
                  updateField("postEditRunInPatchTool", true);
                }}
                className="mt-1 size-4 accent-terminal-green"
              />
              <div>
                <span className="font-mono text-terminal-dark">{t("preferences.postEditHooks.strict")}</span>
                <p className="font-mono text-xs text-terminal-muted">{t("preferences.postEditHooks.strictDesc")}</p>
              </div>
            </label>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex items-center justify-between rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2">
            <span className="font-mono text-sm text-terminal-dark">{t("preferences.postEditHooks.enableHooks")}</span>
            <input
              type="checkbox"
              checked={formState.postEditHooksEnabled}
              onChange={(e) => updateField("postEditHooksEnabled", e.target.checked)}
              className="size-4 accent-terminal-green"
            />
          </label>
          <label className="flex items-center justify-between rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2">
            <span className="font-mono text-sm text-terminal-dark">{t("preferences.postEditHooks.includePatches")}</span>
            <input
              type="checkbox"
              checked={formState.postEditRunInPatchTool}
              onChange={(e) => updateField("postEditRunInPatchTool", e.target.checked)}
              className="size-4 accent-terminal-green"
            />
          </label>
          <label className="flex items-center justify-between rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2">
            <span className="font-mono text-sm text-terminal-dark">{t("preferences.postEditHooks.typecheck")}</span>
            <input
              type="checkbox"
              checked={formState.postEditTypecheckEnabled}
              onChange={(e) => updateField("postEditTypecheckEnabled", e.target.checked)}
              className="size-4 accent-terminal-green"
            />
          </label>
          <label className="flex items-center justify-between rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2">
            <span className="font-mono text-sm text-terminal-dark">{t("preferences.postEditHooks.eslint")}</span>
            <input
              type="checkbox"
              checked={formState.postEditLintEnabled}
              onChange={(e) => updateField("postEditLintEnabled", e.target.checked)}
              className="size-4 accent-terminal-green"
            />
          </label>
        </div>

        <div>
          <label className="mb-1 block font-mono text-sm text-terminal-dark">{t("preferences.postEditHooks.typecheckScopeLabel")}</label>
          <p className="mb-2 font-mono text-xs text-terminal-muted">
            {t("preferences.postEditHooks.typecheckScopeDesc")}
          </p>
          <select
            value={formState.postEditTypecheckScope}
            onChange={(e) => updateField("postEditTypecheckScope", e.target.value as FormState["postEditTypecheckScope"])}
            className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
          >
            <option value="auto">{t("preferences.postEditHooks.scopeAuto")}</option>
            <option value="app">{t("preferences.postEditHooks.scopeApp")}</option>
            <option value="lib">{t("preferences.postEditHooks.scopeLib")}</option>
            <option value="electron">{t("preferences.postEditHooks.scopeElectron")}</option>
            <option value="tooling">{t("preferences.postEditHooks.scopeTooling")}</option>
            <option value="all">{t("preferences.postEditHooks.scopeAll")}</option>
          </select>
        </div>
      </div>

      {/* Prompt Caching */}
      <div className="space-y-4">
        <h3 className="font-mono text-base font-semibold text-terminal-dark">
          {t("preferences.promptCaching.heading")}
        </h3>
        <p className="font-mono text-xs text-terminal-muted">
          {t("preferences.promptCaching.description")}
        </p>

        {/* Enable/Disable Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <label className="font-mono text-sm text-terminal-dark">
              {t("preferences.promptCaching.enableLabel")}
            </label>
            <p className="mt-1 font-mono text-xs text-terminal-muted">
              {t("preferences.promptCaching.enableDesc")}
            </p>
          </div>
          <input
            type="checkbox"
            checked={formState.promptCachingEnabled ?? true}
            onChange={(e) => updateField("promptCachingEnabled", e.target.checked)}
            className="size-5 accent-terminal-green"
          />
        </div>

      </div>

      {/* RTK (Rust Token Killer) */}
      <div className="space-y-4 rounded border border-terminal-border bg-terminal-cream/30 p-4">
        <div>
          <h3 className="font-mono text-base font-semibold text-terminal-dark">
            {t("preferences.rtk.heading")}
          </h3>
          <p className="font-mono text-xs text-terminal-muted">
            {t("preferences.rtk.description")}
          </p>
        </div>

        <label className="flex items-center justify-between gap-3">
          <div>
            <span className="font-mono text-sm text-terminal-dark">{t("preferences.rtk.enableLabel")}</span>
            <p className="mt-1 font-mono text-xs text-terminal-muted">
              {t("preferences.rtk.enableDesc")}
            </p>
          </div>
          <input
            type="checkbox"
            checked={formState.rtkEnabled}
            onChange={(e) => updateField("rtkEnabled", e.target.checked)}
            className="size-5 accent-terminal-green"
          />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block font-mono text-xs text-terminal-muted">{t("preferences.rtk.verbosityLabel")}</label>
            <select
              value={String(formState.rtkVerbosity)}
              onChange={(e) => updateField("rtkVerbosity", Number(e.target.value) as 0 | 1 | 2 | 3)}
              className="w-full rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
            >
              <option value="0">0 (quiet)</option>
              <option value="1">1 (-v)</option>
              <option value="2">2 (-vv)</option>
              <option value="3">3 (-vvv)</option>
            </select>
          </div>

          <label className="flex items-center gap-3 md:pt-6">
            <input
              type="checkbox"
              checked={formState.rtkUltraCompact}
              onChange={(e) => updateField("rtkUltraCompact", e.target.checked)}
              className="size-4 accent-terminal-green"
            />
            <span className="font-mono text-sm text-terminal-dark">{t("preferences.rtk.ultraCompact")}</span>
          </label>
        </div>
      </div>

      {/* Developer Workspace (Git Worktree Integration) */}
      <div className="space-y-4 rounded border border-terminal-border bg-terminal-cream/30 p-4">
        <div>
          <h3 className="font-mono text-base font-semibold text-terminal-dark">
            {t("preferences.devWorkspace.heading")}
          </h3>
          <p className="mt-1 font-mono text-xs text-terminal-muted">
            {t("preferences.devWorkspace.description")}
          </p>
        </div>

        <label className="flex items-center justify-between gap-3">
          <div>
            <span className="font-mono text-sm text-terminal-dark">{t("preferences.devWorkspace.enableLabel")}</span>
            <p className="mt-1 font-mono text-xs text-terminal-muted">
              {t("preferences.devWorkspace.enableDesc")}
            </p>
          </div>
          <input
            type="checkbox"
            checked={formState.devWorkspaceEnabled}
            onChange={(e) => updateField("devWorkspaceEnabled", e.target.checked)}
            className="size-5 accent-terminal-green"
          />
        </label>

        {formState.devWorkspaceEnabled && (
          <div className="space-y-4 border-t border-terminal-border pt-4">
            <label className="flex items-center justify-between gap-3">
              <div>
                <span className="font-mono text-sm text-terminal-dark">{t("preferences.devWorkspace.autoCleanLabel")}</span>
                <p className="mt-1 font-mono text-xs text-terminal-muted">
                  {t("preferences.devWorkspace.autoCleanDesc")}
                </p>
              </div>
              <input
                type="checkbox"
                checked={formState.devWorkspaceAutoCleanup}
                onChange={(e) => updateField("devWorkspaceAutoCleanup", e.target.checked)}
                className="size-5 accent-terminal-green"
              />
            </label>

            {formState.devWorkspaceAutoCleanup && (
              <div>
                <label className="mb-1 block font-mono text-xs text-terminal-muted">
                  {t("preferences.devWorkspace.cleanupDaysLabel")}
                </label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={formState.devWorkspaceAutoCleanupDays}
                  onChange={(e) => updateField("devWorkspaceAutoCleanupDays", Math.max(1, Math.min(30, Number(e.target.value))))}
                  className="w-24 rounded border border-terminal-border bg-terminal-cream/95 dark:bg-terminal-cream-dark/50 px-3 py-2 font-mono text-sm text-terminal-dark focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
                />
              </div>
            )}

            <div className="rounded border border-dashed border-terminal-border bg-terminal-cream/50 p-3">
              <p className="font-mono text-xs text-terminal-muted">
                <strong className="text-terminal-dark">{t("preferences.devWorkspace.recommendedServers")}</strong>{" "}
                {t.rich("preferences.devWorkspace.recommendedServersDesc", {
                  worktreeTools: () => <code className="rounded bg-terminal-border/30 px-1">worktree-tools-mcp</code>,
                  githubMcp: () => <code className="rounded bg-terminal-border/30 px-1">github-mcp-server</code>,
                })}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
