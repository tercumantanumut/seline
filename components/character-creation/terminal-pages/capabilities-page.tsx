"use client";

import { useState, useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ComputerGraphic } from "../computer-graphic";
import { TypewriterText } from "@/components/ui/typewriter-text";
import { TerminalPrompt } from "@/components/ui/terminal-prompt";
import { useTranslations } from "next-intl";
import { ToolDependencyBadge } from "@/components/ui/tool-dependency-badge";
import { AlertTriangleIcon, LockIcon } from "lucide-react";
import { resilientFetch } from "@/lib/utils/resilient-fetch";

/** Tool capability definition for the wizard */
export interface ToolCapability {
  id: string;
  /** Translation key for display name (e.g., "docsSearch" -> t("tools.docsSearch")) */
  nameKey?: string;
  /** Translation key for description (e.g., "docsSearch" -> t("tools.docsSearchDesc")) */
  descKey?: string;
  displayName?: string;
  description?: string;
  category: string;
  /** Dependencies required for this tool to function */
  dependencies?: (
    | "syncedFolders"
    | "embeddings"
    | "vectorDbEnabled"
    | "tavilyKey"
    | "webScraper"
    | "openrouterKey"
    | "comfyuiEnabled"
    | "flux2Klein4bEnabled"
    | "flux2Klein9bEnabled"
    | "localGrepEnabled"
    | "devWorkspaceEnabled"
  )[];
}

/** Available tools grouped by category - uses translation keys */
const BASE_TOOLS: ToolCapability[] = [
  { id: "docsSearch", nameKey: "docsSearch", descKey: "docsSearchDesc", category: "knowledge" },
  {
    id: "vectorSearch",
    nameKey: "vectorSearch",
    descKey: "vectorSearchDesc",
    category: "knowledge",
    dependencies: ["syncedFolders", "embeddings", "vectorDbEnabled"],
  },
  { id: "readFile", nameKey: "readFile", descKey: "readFileDesc", category: "knowledge", dependencies: ["syncedFolders"] },
  { id: "editFile", nameKey: "editFile", descKey: "editFileDesc", category: "knowledge", dependencies: ["syncedFolders"] },
  { id: "writeFile", nameKey: "writeFile", descKey: "writeFileDesc", category: "knowledge", dependencies: ["syncedFolders"] },
  { id: "patchFile", nameKey: "patchFile", descKey: "patchFileDesc", category: "knowledge", dependencies: ["syncedFolders"] },
  {
    id: "localGrep",
    nameKey: "localGrep",
    descKey: "localGrepDesc",
    category: "knowledge",
    dependencies: ["syncedFolders", "localGrepEnabled"],
  },
  { id: "webSearch", nameKey: "webSearch", descKey: "webSearchDesc", category: "search", dependencies: ["tavilyKey"] },
  { id: "webBrowse", nameKey: "webBrowse", descKey: "webBrowseDesc", category: "search", dependencies: ["webScraper"] },
  { id: "webQuery", nameKey: "webQuery", descKey: "webQueryDesc", category: "search", dependencies: ["webScraper"] },
  { id: "firecrawlCrawl", nameKey: "firecrawlCrawl", descKey: "firecrawlCrawlDesc", category: "search", dependencies: ["webScraper"] },
  { id: "assembleVideo", nameKey: "assembleVideo", descKey: "assembleVideoDesc", category: "video-generation" },
  { id: "describeImage", nameKey: "describeImage", descKey: "describeImageDesc", category: "analysis" },
  { id: "showProductImages", nameKey: "showProductImages", descKey: "showProductImagesDesc", category: "utility" },
  { id: "executeCommand", nameKey: "executeCommand", descKey: "executeCommandDesc", category: "utility", dependencies: ["syncedFolders"] },
  { id: "scheduleTask", nameKey: "scheduleTask", descKey: "scheduleTaskDesc", category: "utility" },
  { id: "runSkill", nameKey: "runSkill", descKey: "runSkillDesc", category: "utility" },
  { id: "updateSkill", nameKey: "updateSkill", descKey: "updateSkillDesc", category: "utility" },
  { id: "memorize", nameKey: "memorize", descKey: "memorizeDesc", category: "utility" },
  { id: "calculator", nameKey: "calculator", descKey: "calculatorDesc", category: "utility" },
  { id: "updatePlan", nameKey: "updatePlan", descKey: "updatePlanDesc", category: "utility" },
  { id: "sendMessageToChannel", nameKey: "sendMessageToChannel", descKey: "sendMessageToChannelDesc", category: "utility" },
  { id: "workspace", nameKey: "workspace", descKey: "workspaceDesc", category: "utility", dependencies: ["devWorkspaceEnabled"] },
  // OpenRouter Image Tools
  {
    id: "generateImageFlux2Flex",
    nameKey: "generateImageFlux2Flex",
    descKey: "generateImageFlux2FlexDesc",
    category: "image-generation",
    dependencies: ["openrouterKey"],
  },
  {
    id: "editImageFlux2Flex",
    nameKey: "editImageFlux2Flex",
    descKey: "editImageFlux2FlexDesc",
    category: "image-editing",
    dependencies: ["openrouterKey"],
  },
  {
    id: "referenceImageFlux2Flex",
    nameKey: "referenceImageFlux2Flex",
    descKey: "referenceImageFlux2FlexDesc",
    category: "image-generation",
    dependencies: ["openrouterKey"],
  },
  {
    id: "generateImageGpt5Mini",
    nameKey: "generateImageGpt5Mini",
    descKey: "generateImageGpt5MiniDesc",
    category: "image-generation",
    dependencies: ["openrouterKey"],
  },
  {
    id: "editImageGpt5Mini",
    nameKey: "editImageGpt5Mini",
    descKey: "editImageGpt5MiniDesc",
    category: "image-editing",
    dependencies: ["openrouterKey"],
  },
  {
    id: "referenceImageGpt5Mini",
    nameKey: "referenceImageGpt5Mini",
    descKey: "referenceImageGpt5MiniDesc",
    category: "image-generation",
    dependencies: ["openrouterKey"],
  },
  {
    id: "generateImageGpt5",
    nameKey: "generateImageGpt5",
    descKey: "generateImageGpt5Desc",
    category: "image-generation",
    dependencies: ["openrouterKey"],
  },
  {
    id: "editImageGpt5",
    nameKey: "editImageGpt5",
    descKey: "editImageGpt5Desc",
    category: "image-editing",
    dependencies: ["openrouterKey"],
  },
  {
    id: "referenceImageGpt5",
    nameKey: "referenceImageGpt5",
    descKey: "referenceImageGpt5Desc",
    category: "image-generation",
    dependencies: ["openrouterKey"],
  },
  {
    id: "generateImageGemini25Flash",
    nameKey: "generateImageGemini25Flash",
    descKey: "generateImageGemini25FlashDesc",
    category: "image-generation",
    dependencies: ["openrouterKey"],
  },
  {
    id: "editImageGemini25Flash",
    nameKey: "editImageGemini25Flash",
    descKey: "editImageGemini25FlashDesc",
    category: "image-editing",
    dependencies: ["openrouterKey"],
  },
  {
    id: "referenceImageGemini25Flash",
    nameKey: "referenceImageGemini25Flash",
    descKey: "referenceImageGemini25FlashDesc",
    category: "image-generation",
    dependencies: ["openrouterKey"],
  },
  {
    id: "generateImageGemini3Pro",
    nameKey: "generateImageGemini3Pro",
    descKey: "generateImageGemini3ProDesc",
    category: "image-generation",
    dependencies: ["openrouterKey"],
  },
  {
    id: "editImageGemini3Pro",
    nameKey: "editImageGemini3Pro",
    descKey: "editImageGemini3ProDesc",
    category: "image-editing",
    dependencies: ["openrouterKey"],
  },
  {
    id: "referenceImageGemini3Pro",
    nameKey: "referenceImageGemini3Pro",
    descKey: "referenceImageGemini3ProDesc",
    category: "image-generation",
    dependencies: ["openrouterKey"],
  },
  // Local ComfyUI Image Tools
  {
    id: "generateImageZImage",
    nameKey: "generateImageZImage",
    descKey: "generateImageZImageDesc",
    category: "image-generation",
    dependencies: ["comfyuiEnabled"],
  },
  {
    id: "generateImageFlux2Klein4B",
    nameKey: "generateImageFlux2Klein4B",
    descKey: "generateImageFlux2Klein4BDesc",
    category: "image-generation",
    dependencies: ["flux2Klein4bEnabled"],
  },
  {
    id: "editImageFlux2Klein4B",
    nameKey: "editImageFlux2Klein4B",
    descKey: "editImageFlux2Klein4BDesc",
    category: "image-editing",
    dependencies: ["flux2Klein4bEnabled"],
  },
  {
    id: "referenceImageFlux2Klein4B",
    nameKey: "referenceImageFlux2Klein4B",
    descKey: "referenceImageFlux2Klein4BDesc",
    category: "image-generation",
    dependencies: ["flux2Klein4bEnabled"],
  },
  {
    id: "generateImageFlux2Klein9B",
    nameKey: "generateImageFlux2Klein9B",
    descKey: "generateImageFlux2Klein9BDesc",
    category: "image-generation",
    dependencies: ["flux2Klein9bEnabled"],
  },
  {
    id: "editImageFlux2Klein9B",
    nameKey: "editImageFlux2Klein9B",
    descKey: "editImageFlux2Klein9BDesc",
    category: "image-editing",
    dependencies: ["flux2Klein9bEnabled"],
  },
  {
    id: "referenceImageFlux2Klein9B",
    nameKey: "referenceImageFlux2Klein9B",
    descKey: "referenceImageFlux2Klein9BDesc",
    category: "image-generation",
    dependencies: ["flux2Klein9bEnabled"],
  },
];

/** Category display order — matches character-picker's CATEGORY_ICONS */
const CATEGORY_ORDER: Record<string, number> = {
  knowledge: 0,
  search: 1,
  "image-generation": 2,
  "image-editing": 3,
  "video-generation": 4,
  analysis: 5,
  utility: 6,
  "custom-comfyui": 7,
};

/** Category translation keys */
const CATEGORY_KEYS: Record<string, string> = {
  knowledge: "knowledge",
  search: "search",
  "image-generation": "imageGeneration",
  "image-editing": "imageEditing",
  "video-generation": "videoGeneration",
  analysis: "analysis",
  utility: "utility",
};

/** Warning from the settings-aware tool resolver */
interface ToolResolutionWarning {
  toolId: string;
  toolName: string;
  reason: string;
  settingsKeys: string[];
  action: string;
}

interface CapabilitiesPageProps {
  agentName: string;
  agentId?: string | null;
  templateId?: string;
  initialEnabledTools?: string[];
  onSubmit: (enabledTools: string[]) => void;
  onBack: () => void;
}

export function CapabilitiesPage({
  agentName,
  agentId,
  templateId,
  initialEnabledTools = ["docsSearch"],
  onSubmit,
  onBack,
}: CapabilitiesPageProps) {
  const t = useTranslations("characterCreation.capabilities");
  const tDeps = useTranslations("characterCreation.capabilities.dependencyWarnings");
  const [enabledTools, setEnabledTools] = useState<Set<string>>(new Set(initialEnabledTools));
  const [availableTools, setAvailableTools] = useState<ToolCapability[]>(BASE_TOOLS);
  const [resolutionWarnings, setResolutionWarnings] = useState<ToolResolutionWarning[]>([]);
  const [showForm, setShowForm] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const hasAnimated = useRef(false);

  useEffect(() => {
    const baseTools = BASE_TOOLS.map((tool) => ({
      ...tool,
      displayName: tool.nameKey && t.has(`tools.${tool.nameKey}`)
        ? t(`tools.${tool.nameKey}`)
        : tool.id,
      description: tool.descKey && t.has(`tools.${tool.descKey}`)
        ? t(`tools.${tool.descKey}`)
        : "",
    }));

    const sortedBaseTools = [...baseTools].sort((a, b) => {
      const catA = CATEGORY_ORDER[a.category] ?? 99;
      const catB = CATEGORY_ORDER[b.category] ?? 99;
      if (catA !== catB) return catA - catB;
      return (a.displayName || a.id).localeCompare(b.displayName || b.id);
    });
    setAvailableTools(sortedBaseTools);

    let cancelled = false;
    const loadTools = async () => {
      try {
        const { data, error } = await resilientFetch<{
          tools?: Array<{ id: string; displayName: string; description: string; category: string }>;
        }>("/api/tools?includeDisabled=true&includeAlwaysLoad=true");
        if (error || !data) throw new Error(error || "Failed to load tools");
        if (cancelled) return;

        const merged = new Map<string, ToolCapability>();
        baseTools.forEach((tool) => merged.set(tool.id, tool));

        (data.tools || []).forEach((tool) => {
          if (tool.category === "mcp" || tool.id.startsWith("mcp_")) {
            return;
          }
          const existing = merged.get(tool.id);
          if (existing) {
            merged.set(tool.id, {
              ...existing,
              category: existing.category || tool.category,
              displayName: existing.displayName && existing.displayName !== existing.id
                ? existing.displayName
                : tool.displayName,
              description: existing.description && existing.description.length > 0
                ? existing.description
                : tool.description,
            });
          } else {
            merged.set(tool.id, {
              id: tool.id,
              category: tool.category,
              displayName: tool.displayName,
              description: tool.description,
            });
          }
        });

        const mergedList = Array.from(merged.values()).sort((a, b) => {
          const catA = CATEGORY_ORDER[a.category] ?? 99;
          const catB = CATEGORY_ORDER[b.category] ?? 99;
          if (catA !== catB) return catA - catB;
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
  }, [t]);

  // Dependency status - tracks what's configured
  const [dependencyStatus, setDependencyStatus] = useState<{
    syncedFolders: boolean;
    embeddings: boolean;
    vectorDbEnabled: boolean;
    tavilyKey: boolean;
    webScraper: boolean;
    openrouterKey: boolean;
    comfyuiEnabled: boolean;
    flux2Klein4bEnabled: boolean;
    flux2Klein9bEnabled: boolean;
    localGrepEnabled: boolean;
    devWorkspaceEnabled: boolean;
  }>({
    syncedFolders: false,
    embeddings: false,
    vectorDbEnabled: false,
    tavilyKey: false,
    webScraper: false,
    openrouterKey: false,
    comfyuiEnabled: false,
    flux2Klein4bEnabled: false,
    flux2Klein9bEnabled: false,
    localGrepEnabled: true,
    devWorkspaceEnabled: false,
  });

  // Check dependencies on mount
  useEffect(() => {
    const checkDependencies = async () => {
      // Fetch folder count — on failure, preserve previous state instead of
      // resetting to 0 (which would lock all folder-dependent tools).
      // A folder in any status (pending/syncing/synced) counts as configured.
      let foldersCount: number | null = null; // null = unknown (fetch failed)
      if (agentId) {
        const { data } = await resilientFetch<{ folders?: unknown[] }>(
          `/api/vector-sync?characterId=${agentId}`
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

        setDependencyStatus((prev) => ({
          // If folder fetch failed, keep the previous value instead of resetting to false
          syncedFolders: foldersCount !== null ? foldersCount > 0 : prev.syncedFolders,
          embeddings: embeddingsReady,
          vectorDbEnabled: settingsData.vectorDBEnabled === true,
          tavilyKey: typeof settingsData.tavilyApiKey === "string" && settingsData.tavilyApiKey.trim().length > 0,
          webScraper: webScraperReady,
          openrouterKey: typeof settingsData.openrouterApiKey === "string" && settingsData.openrouterApiKey.trim().length > 0,
          comfyuiEnabled: settingsData.comfyuiEnabled === true,
          flux2Klein4bEnabled: settingsData.flux2Klein4bEnabled === true,
          flux2Klein9bEnabled: settingsData.flux2Klein9bEnabled === true,
          localGrepEnabled: settingsData.localGrepEnabled !== false,
          devWorkspaceEnabled: settingsData.devWorkspaceEnabled === true,
        }));
      } catch {
        // Settings fetch failed — only update syncedFolders if we got a valid count
        if (foldersCount !== null) {
          setDependencyStatus((prev) => ({
            ...prev,
            syncedFolders: foldersCount > 0,
          }));
        }
        // Otherwise preserve all previous state — don't reset to false
      }
    };

    checkDependencies();
  }, [agentId]);

  // Fetch tool resolution warnings for Seline template
  useEffect(() => {
    if (templateId !== "seline-default") return;

    const fetchResolution = async () => {
      try {
        const { data, error } = await resilientFetch<{
          warnings?: ToolResolutionWarning[];
        }>("/api/tools/resolve?templateId=seline-default");
        if (!error && data?.warnings && data.warnings.length > 0) {
          setResolutionWarnings(data.warnings);
        }
      } catch {
        // Non-critical — warnings are informational only
      }
    };

    fetchResolution();
  }, [templateId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onBack();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onBack]);

  // Helper to check if tool dependencies are met
  const areDependenciesMet = (tool: ToolCapability): boolean => {
    if (!tool.dependencies || tool.dependencies.length === 0) return true;
    return tool.dependencies.every((dep) => dependencyStatus[dep]);
  };

  // Get dependency warning message
  const getDependencyWarning = (tool: ToolCapability): string | null => {
    if (!tool.dependencies || tool.dependencies.length === 0) return null;
    const unmet = tool.dependencies.filter((dep) => !dependencyStatus[dep]);
    if (unmet.length === 0) return null;
    if (unmet.length === 2 && unmet.includes("syncedFolders") && unmet.includes("embeddings")) {
      return tDeps("both");
    }
    return unmet.map((dep) => tDeps(dep)).join(" + ");
  };

  const toggleTool = (toolId: string) => {
    setEnabledTools((prev) => {
      const next = new Set(prev);
      if (next.has(toolId)) {
        next.delete(toolId);
      } else {
        next.add(toolId);
      }
      return next;
    });
  };

  const handleSubmit = () => {
    onSubmit(Array.from(enabledTools));
  };

  // Group tools by category
  const toolsByCategory = availableTools.reduce((acc, tool) => {
    if (!acc[tool.category]) acc[tool.category] = [];
    acc[tool.category].push(tool);
    return acc;
  }, {} as Record<string, ToolCapability[]>);

  return (
    <div className="flex h-full min-h-full flex-col items-center bg-terminal-cream px-4 py-6 sm:px-8">
      <div className="flex w-full max-w-4xl flex-1 flex-col gap-6 min-h-0">
        {/* Header */}
        <div className="flex items-start gap-8">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.5 }}
          >
            <ComputerGraphic size="sm" />
          </motion.div>

          <div className="flex-1 space-y-4">
            <TerminalPrompt prefix="step-2" symbol="$" animate={!prefersReducedMotion}>
              <span className="text-terminal-amber">agent.capabilities({agentName})</span>
            </TerminalPrompt>

            <div className="font-mono text-lg text-terminal-dark">
              {!hasAnimated.current ? (
                <TypewriterText
                  text={t("question")}
                  delay={prefersReducedMotion ? 0 : 200}
                  speed={prefersReducedMotion ? 0 : 25}
                  onComplete={() => {
                    hasAnimated.current = true;
                    setShowForm(true);
                  }}
                  showCursor={false}
                />
              ) : (
                <span>{t("question")}</span>
              )}
            </div>
          </div>
        </div>

        {/* Onboarding: Tool resolution warnings for Seline template */}
        {showForm && resolutionWarnings.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
            className="rounded-lg border border-terminal-amber/30 bg-terminal-amber/5 p-4"
          >
            <div className="flex items-start gap-2 mb-2">
              <AlertTriangleIcon className="w-4 h-4 text-terminal-amber mt-0.5 flex-shrink-0" />
              <p className="font-mono text-sm text-terminal-dark">
                {resolutionWarnings.length === 1
                  ? "1 tool is disabled due to missing configuration:"
                  : `${resolutionWarnings.length} tools are disabled due to missing configuration:`}
              </p>
            </div>
            <div className="ml-6 space-y-1.5">
              {resolutionWarnings.map((warning) => (
                <div key={warning.toolId} className="font-mono text-xs text-terminal-muted">
                  <span className="text-terminal-dark font-semibold">{warning.toolName}</span>
                  {" — "}
                  <span>{warning.action}</span>
                  {" "}
                  <a
                    href="/settings"
                    className="text-terminal-green hover:underline"
                    onClick={(e) => {
                      e.preventDefault();
                      window.open("/settings", "_blank");
                    }}
                  >
                    Configure Now →
                  </a>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Tool Selection */}
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.3 }}
            className="flex min-h-0 flex-1 flex-col rounded-lg border border-terminal-border bg-terminal-bg/30"
          >
            <div className="flex-1 min-h-0 overflow-y-auto p-5 pr-3">
              <div className="space-y-6">
                {Object.entries(toolsByCategory).map(([category, tools]) => (
                  <div key={category} className="space-y-3">
                    <h3 className="text-sm font-mono font-semibold text-terminal-amber">
                      {CATEGORY_KEYS[category]
                        ? t(`categories.${CATEGORY_KEYS[category]}`)
                        : category.replace(/-/g, " ")}
                    </h3>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {tools.map((tool) => {
                        const isMet = areDependenciesMet(tool);
                        const warning = getDependencyWarning(tool);
                        const displayName = tool.displayName
                          || (tool.nameKey && t.has(`tools.${tool.nameKey}`) ? t(`tools.${tool.nameKey}`) : tool.id);
                        const description = tool.description
                          || (tool.descKey && t.has(`tools.${tool.descKey}`) ? t(`tools.${tool.descKey}`) : "");

                        return (
                          <ToolToggle
                            key={tool.id}
                            tool={tool}
                            displayName={displayName}
                            description={description}
                            enabled={enabledTools.has(tool.id)}
                            disabled={!isMet}
                            warning={warning}
                            onToggle={() => toggleTool(tool.id)}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Navigation */}
            <div className="flex flex-col gap-3 border-t border-terminal-border/50 bg-terminal-cream/90 px-5 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
              <button
                onClick={onBack}
                className="order-2 text-sm font-mono text-terminal-dark/60 transition-colors hover:text-terminal-dark sm:order-1 sm:w-auto"
              >
                {t("back")}
              </button>
              <button
                onClick={handleSubmit}
                className="order-1 w-full rounded bg-terminal-dark px-4 py-2 text-sm font-mono text-terminal-cream transition-colors hover:bg-terminal-dark/90 sm:order-2 sm:w-auto"
              >
                {t("continue")}
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

/** Individual tool toggle component */
function ToolToggle({
  tool,
  displayName,
  description,
  enabled,
  disabled,
  warning,
  onToggle,
}: {
  tool: ToolCapability;
  displayName: string;
  description: string;
  enabled: boolean;
  disabled?: boolean;
  warning?: string | null;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`w-full flex items-center gap-3 p-3 rounded border transition-colors text-left ${disabled
        ? "bg-terminal-bg/10 border-terminal-border/30 opacity-60 cursor-not-allowed"
        : enabled
          ? "bg-terminal-green/10 border-terminal-green/50"
          : "bg-terminal-bg/20 border-terminal-border/50 hover:border-terminal-border"
        }`}
    >
      <div
        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${disabled
          ? "border-terminal-dark/10 bg-terminal-dark/5"
          : enabled
            ? "bg-terminal-green border-terminal-green text-white"
            : "border-terminal-dark/30"
          }`}
      >
        {enabled && (
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
        {disabled && <LockIcon className="w-3 h-3 text-terminal-dark/30" />}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <div className="font-mono text-sm text-terminal-dark">{displayName}</div>
          {warning && <ToolDependencyBadge warning={warning} />}
        </div>
        <div className="font-mono text-xs text-terminal-dark/60">{description}</div>
      </div>
    </button>
  );
}
