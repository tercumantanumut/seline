"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { ComputerGraphic } from "../computer-graphic";
import { TypewriterText } from "@/components/ui/typewriter-text";
import { TerminalPrompt } from "@/components/ui/terminal-prompt";
import { useReducedMotion } from "../hooks/use-reduced-motion";
import { useTranslations } from "next-intl";

/** Tool capability definition for the wizard */
export interface ToolCapability {
  id: string;
  /** Translation key for display name (e.g., "docsSearch" -> t("tools.docsSearch")) */
  nameKey: string;
  /** Translation key for description (e.g., "docsSearch" -> t("tools.docsSearchDesc")) */
  descKey: string;
  category: "knowledge" | "search" | "image-generation" | "image-editing" | "video-generation" | "analysis" | "utility";
}

/** Available tools grouped by category - uses translation keys */
const AVAILABLE_TOOLS: ToolCapability[] = [
  { id: "docsSearch", nameKey: "docsSearch", descKey: "docsSearchDesc", category: "knowledge" },
  { id: "vectorSearch", nameKey: "vectorSearch", descKey: "vectorSearchDesc", category: "knowledge" },
  { id: "readFile", nameKey: "readFile", descKey: "readFileDesc", category: "knowledge" },
  { id: "localGrep", nameKey: "localGrep", descKey: "localGrepDesc", category: "knowledge" },
  { id: "webSearch", nameKey: "webSearch", descKey: "webSearchDesc", category: "search" },
  { id: "webBrowse", nameKey: "webBrowse", descKey: "webBrowseDesc", category: "search" },
  { id: "webQuery", nameKey: "webQuery", descKey: "webQueryDesc", category: "search" },
  { id: "firecrawlCrawl", nameKey: "firecrawlCrawl", descKey: "firecrawlCrawlDesc", category: "search" },
  { id: "assembleVideo", nameKey: "assembleVideo", descKey: "assembleVideoDesc", category: "video-generation" },
  { id: "describeImage", nameKey: "describeImage", descKey: "describeImageDesc", category: "analysis" },
  { id: "showProductImages", nameKey: "showProductImages", descKey: "showProductImagesDesc", category: "utility" },
  { id: "executeCommand", nameKey: "executeCommand", descKey: "executeCommandDesc", category: "utility" },
  // OpenRouter Image Tools
  { id: "generateImageFlux2Flex", nameKey: "generateImageFlux2Flex", descKey: "generateImageFlux2FlexDesc", category: "image-generation" },
  { id: "editImageFlux2Flex", nameKey: "editImageFlux2Flex", descKey: "editImageFlux2FlexDesc", category: "image-editing" },
  { id: "referenceImageFlux2Flex", nameKey: "referenceImageFlux2Flex", descKey: "referenceImageFlux2FlexDesc", category: "image-generation" },
  { id: "generateImageGpt5Mini", nameKey: "generateImageGpt5Mini", descKey: "generateImageGpt5MiniDesc", category: "image-generation" },
  { id: "editImageGpt5Mini", nameKey: "editImageGpt5Mini", descKey: "editImageGpt5MiniDesc", category: "image-editing" },
  { id: "referenceImageGpt5Mini", nameKey: "referenceImageGpt5Mini", descKey: "referenceImageGpt5MiniDesc", category: "image-generation" },
  { id: "generateImageGpt5", nameKey: "generateImageGpt5", descKey: "generateImageGpt5Desc", category: "image-generation" },
  { id: "editImageGpt5", nameKey: "editImageGpt5", descKey: "editImageGpt5Desc", category: "image-editing" },
  { id: "referenceImageGpt5", nameKey: "referenceImageGpt5", descKey: "referenceImageGpt5Desc", category: "image-generation" },
  { id: "generateImageGemini25Flash", nameKey: "generateImageGemini25Flash", descKey: "generateImageGemini25FlashDesc", category: "image-generation" },
  { id: "editImageGemini25Flash", nameKey: "editImageGemini25Flash", descKey: "editImageGemini25FlashDesc", category: "image-editing" },
  { id: "referenceImageGemini25Flash", nameKey: "referenceImageGemini25Flash", descKey: "referenceImageGemini25FlashDesc", category: "image-generation" },
  { id: "generateImageGemini3Pro", nameKey: "generateImageGemini3Pro", descKey: "generateImageGemini3ProDesc", category: "image-generation" },
  { id: "editImageGemini3Pro", nameKey: "editImageGemini3Pro", descKey: "editImageGemini3ProDesc", category: "image-editing" },
  { id: "referenceImageGemini3Pro", nameKey: "referenceImageGemini3Pro", descKey: "referenceImageGemini3ProDesc", category: "image-generation" },
];

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

interface CapabilitiesPageProps {
  agentName: string;
  initialEnabledTools?: string[];
  onSubmit: (enabledTools: string[]) => void;
  onBack: () => void;
}

export function CapabilitiesPage({
  agentName,
  initialEnabledTools = ["docsSearch"],
  onSubmit,
  onBack,
}: CapabilitiesPageProps) {
  const t = useTranslations("characterCreation.capabilities");
  const [enabledTools, setEnabledTools] = useState<Set<string>>(new Set(initialEnabledTools));
  const [showForm, setShowForm] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const hasAnimated = useRef(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onBack();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onBack]);

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
  const toolsByCategory = AVAILABLE_TOOLS.reduce((acc, tool) => {
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
                      {t(`categories.${CATEGORY_KEYS[category]}`)}
                    </h3>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {tools.map((tool) => (
                        <ToolToggle
                          key={tool.id}
                          tool={tool}
                          displayName={t(`tools.${tool.nameKey}`)}
                          description={t(`tools.${tool.descKey}`)}
                          enabled={enabledTools.has(tool.id)}
                          onToggle={() => toggleTool(tool.id)}
                        />
                      ))}
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
  onToggle,
}: {
  tool: ToolCapability;
  displayName: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center gap-3 p-3 rounded border transition-colors text-left ${enabled
        ? "bg-terminal-green/10 border-terminal-green/50"
        : "bg-terminal-bg/20 border-terminal-border/50 hover:border-terminal-border"
        }`}
    >
      <div
        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${enabled
          ? "bg-terminal-green border-terminal-green text-white"
          : "border-terminal-dark/30"
          }`}
      >
        {enabled && (
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      <div className="flex-1">
        <div className="font-mono text-sm text-terminal-dark">{displayName}</div>
        <div className="font-mono text-xs text-terminal-dark/60">{description}</div>
      </div>
    </button>
  );
}
