/**
 * Vector Search Inline Component
 *
 * Displays intelligent search results inline in chat.
 * Shows search strategy, organized findings, and navigation.
 *
 * Theme-aligned with terminal aesthetic (cream/dark/terracotta).
 */

"use client";

import type { FC } from "react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { VectorSearchResult, SearchFinding } from "@/lib/ai/vector-search";
import {
  SearchIcon,
  FileCodeIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  SparklesIcon,
  Loader2Icon,
  CheckCircleIcon,
  AlertCircleIcon,
  LightbulbIcon,
  ZapIcon,
  CompassIcon,
  MessageSquareIcon,
} from "lucide-react";

// ============================================================================
// Types
// ============================================================================

type ToolCallContentPartComponent = FC<{
  toolName: string;
  argsText?: string;
  args?: { query?: string; maxResults?: number; minScore?: number; folderIds?: string[] };
  result?: VectorSearchResult;
}>;

// ============================================================================
// Strategy Configuration - Theme Aligned
// ============================================================================

const STRATEGY_CONFIG: Record<string, {
  label: string;
  icon: typeof SparklesIcon;
  color: string;
  bgColor: string;
}> = {
  semantic: {
    label: "Semantic",
    icon: SparklesIcon,
    color: "text-terminal-green",
    bgColor: "bg-terminal-green/10 border-terminal-green/20"
  },
  keyword: {
    label: "Keyword",
    icon: SearchIcon,
    color: "text-terminal-dark",
    bgColor: "bg-terminal-dark/5 border-terminal-dark/10"
  },
  hybrid: {
    label: "Hybrid",
    icon: ZapIcon,
    color: "text-terminal-amber",
    bgColor: "bg-terminal-amber/10 border-terminal-amber/20"
  },
  contextual: {
    label: "Contextual",
    icon: MessageSquareIcon,
    color: "text-terminal-dark",
    bgColor: "bg-terminal-dark/5 border-terminal-dark/10"
  },
  exploratory: {
    label: "Exploratory",
    icon: CompassIcon,
    color: "text-terminal-muted",
    bgColor: "bg-terminal-dark/5 border-terminal-dark/10"
  },
};

// ============================================================================
// Animation Variants
// ============================================================================

const cardVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2 } },
};

const expandVariants = {
  collapsed: { opacity: 0 },
  expanded: { opacity: 1, transition: { duration: 0.15 } },
};

// ============================================================================
// Sub-Components
// ============================================================================

const ConfidenceBadge: FC<{ confidence: number }> = ({ confidence }) => {
  const percentage = Math.round(confidence * 100);
  const colorClass = confidence >= 0.8
    ? "text-terminal-green bg-terminal-green/10"
    : confidence >= 0.5
      ? "text-terminal-amber bg-terminal-amber/10"
      : "text-terminal-muted bg-terminal-dark/5";

  return (
    <span className={cn(
      "text-[10px] font-mono px-1.5 py-0.5 rounded",
      colorClass
    )}>
      {percentage}%
    </span>
  );
};

const FindingCard: FC<{
  finding: SearchFinding;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}> = ({ finding, index, isExpanded, onToggle }) => {
  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      transition={{ delay: index * 0.05 }}
      className={cn(
        "rounded-lg border transition-all duration-200",
        isExpanded
          ? "border-terminal-green/30 bg-terminal-cream/50"
          : "border-terminal-dark/10 bg-transparent hover:border-terminal-dark/20"
      )}
    >
      {/* File Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 p-3 text-left group"
        aria-expanded={isExpanded}
        aria-controls={`finding-content-${index}`}
      >
        <div className={cn(
          "p-1 rounded transition-colors",
          isExpanded ? "bg-terminal-green/10" : "bg-terminal-dark/5 group-hover:bg-terminal-dark/10"
        )}>
          <FileCodeIcon className={cn(
            "w-3.5 h-3.5 transition-colors",
            isExpanded ? "text-terminal-green" : "text-terminal-muted"
          )} />
        </div>

        <div className="flex-1 min-w-0">
          <span className="text-sm font-mono text-terminal-dark truncate block">
            {finding.filePath.split('/').pop()}
          </span>
          <span className="text-[10px] font-mono text-terminal-muted truncate block">
            {finding.filePath}
          </span>
        </div>

        {finding.lineRange && (
          <span className="text-[10px] text-terminal-muted font-mono bg-terminal-dark/5 px-1.5 py-0.5 rounded">
            L{finding.lineRange}
          </span>
        )}

        <ConfidenceBadge confidence={finding.confidence} />

        <div className={cn(
          "p-1 rounded transition-colors",
          isExpanded ? "bg-terminal-green/10" : "bg-transparent group-hover:bg-terminal-dark/5"
        )}>
          {isExpanded ? (
            <ChevronUpIcon className="w-4 h-4 text-terminal-muted" />
          ) : (
            <ChevronDownIcon className="w-4 h-4 text-terminal-muted" />
          )}
        </div>
      </button>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            id={`finding-content-${index}`}
            initial="collapsed"
            animate="expanded"
            exit="collapsed"
            variants={expandVariants}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-3">
              {/* Divider */}
              <div className="h-px bg-terminal-dark/10" />

              {/* Explanation */}
              <p className="text-sm text-terminal-dark leading-relaxed break-words [overflow-wrap:anywhere]">
                {finding.explanation}
              </p>

              {/* Code Snippet */}
              {finding.snippet && (
                <div className="relative">
                  <pre className="p-3 rounded-lg bg-terminal-dark/[0.03] border border-terminal-dark/5 text-xs font-mono text-terminal-dark whitespace-pre-wrap break-words [overflow-wrap:anywhere] max-h-48 overflow-y-auto">
                    <code>{finding.snippet}</code>
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const SuggestedRefinements: FC<{ refinements: string[] }> = ({ refinements }) => {
  const t = useTranslations("assistantUi.vectorSearch");
  if (refinements.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-terminal-muted">
        <LightbulbIcon className="w-3 h-3 text-terminal-amber" />
        <span>{t("tryRefinements")}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {refinements.slice(0, 4).map((suggestion, idx) => (
          <span
            key={idx}
            className="text-xs font-mono px-2.5 py-1 rounded-full bg-terminal-dark/5 text-terminal-dark border border-terminal-dark/10 hover:border-terminal-dark/20 transition-colors cursor-default"
          >
            {suggestion}
          </span>
        ))}
      </div>
    </div>
  );
};

const StrategyBadge: FC<{ strategy: string }> = ({ strategy }) => {
  const config = STRATEGY_CONFIG[strategy] || STRATEGY_CONFIG.semantic;
  const Icon = config.icon;

  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded border",
      config.bgColor,
      config.color
    )}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
};

// ============================================================================
// Main Component
// ============================================================================

export const VectorSearchToolUI: ToolCallContentPartComponent = ({
  toolName,
  args,
  result,
}) => {
  const [expandedFiles, setExpandedFiles] = useState<Set<number>>(new Set([0])); // First one expanded by default

  const isRunning = result === undefined;
  const query = args?.query || "";

  const toggleFile = (index: number) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  // Expand all / Collapse all
  const toggleAll = () => {
    if (!result?.findings) return;
    if (expandedFiles.size === result.findings.length) {
      setExpandedFiles(new Set());
    } else {
      setExpandedFiles(new Set(result.findings.map((_, i) => i)));
    }
  };

  if (isRunning) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="my-3 rounded-lg bg-terminal-cream border border-terminal-dark/10 shadow-sm p-4 font-mono min-h-[60px] [contain:layout_style] min-w-0"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-terminal-green/10">
            <Loader2Icon className="w-4 h-4 text-terminal-green animate-spin" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium text-terminal-dark">Searching...</div>
            <div className="text-xs text-terminal-muted mt-0.5 break-words [overflow-wrap:anywhere]">
              &quot;{query}&quot;
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // Error state
  if (result?.status === "error" || result?.status === "disabled" || result?.status === "no_agent") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      className="my-3 rounded-lg bg-destructive/5 border border-destructive/20 shadow-sm p-4 font-mono min-w-0"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-destructive/10">
            <AlertCircleIcon className="w-4 h-4 text-destructive" />
          </div>
          <div>
            <div className="text-sm font-medium text-destructive">Search Failed</div>
            <div className="text-xs text-destructive/80 mt-0.5 break-words [overflow-wrap:anywhere]">
              {result?.message || result?.error || "An error occurred during search"}
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // No results state
  if (result?.status === "no_results" || !result?.findings || result.findings.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      className="my-3 rounded-lg bg-terminal-cream border border-terminal-dark/10 shadow-sm p-4 font-mono min-w-0"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-terminal-dark/5">
            <SearchIcon className="w-4 h-4 text-terminal-muted" />
          </div>
          <div>
            <div className="text-sm font-medium text-terminal-dark">No Results Found</div>
            <div className="text-xs text-terminal-muted mt-0.5 break-words [overflow-wrap:anywhere]">
              {result?.message || "Try rephrasing your query or using different keywords."}
            </div>
          </div>
        </div>
        {result?.suggestedRefinements && result.suggestedRefinements.length > 0 && (
          <div className="mt-4 pt-3 border-t border-terminal-dark/10">
            <SuggestedRefinements refinements={result.suggestedRefinements} />
          </div>
        )}
      </motion.div>
    );
  }

  // Success state with findings
  const fileCount = result.stats?.totalFiles || new Set(result.findings.map(f => f.filePath)).size;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="my-3 rounded-lg bg-terminal-cream border border-terminal-dark/10 shadow-sm overflow-hidden font-mono min-w-0"
    >
      {/* Header */}
      <div className="p-4 border-b border-terminal-dark/10">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-terminal-green/10">
            <CheckCircleIcon className="w-4 h-4 text-terminal-green" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-terminal-dark">Search Complete</span>
              <StrategyBadge strategy={result.strategy} />
            </div>
            {result.reasoning && (
              <p className="text-xs text-terminal-muted mt-1 leading-relaxed break-words [overflow-wrap:anywhere]">{result.reasoning}</p>
            )}
          </div>
        </div>

        {/* Summary */}
        {result.summary && (
          <div className="mt-3 p-3 rounded-lg bg-terminal-dark/[0.02] border border-terminal-dark/5">
            <p className="text-sm text-terminal-dark leading-relaxed break-words [overflow-wrap:anywhere]">{result.summary}</p>
          </div>
        )}

        {/* Stats */}
        {result.stats && (
          <div className="mt-3 flex items-center gap-3 text-xs text-terminal-muted">
            <span className="flex items-center gap-1">
              <span className="font-medium text-terminal-dark">{result.findings.length}</span>
              finding{result.findings.length !== 1 ? "s" : ""}
            </span>
            <span className="w-1 h-1 rounded-full bg-terminal-muted/50" />
            <span className="flex items-center gap-1">
              <span className="font-medium text-terminal-dark">{fileCount}</span>
              file{fileCount !== 1 ? "s" : ""}
            </span>
            {result.stats.totalChunks > 0 && (
              <>
                <span className="w-1 h-1 rounded-full bg-terminal-muted/50" />
                <span className="flex items-center gap-1">
                  <span className="font-medium text-terminal-dark">{result.stats.totalChunks}</span>
                  chunks analyzed
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Findings */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-terminal-muted uppercase tracking-wide">
            Findings
          </span>
          <button
            onClick={toggleAll}
            className="text-xs text-terminal-muted hover:text-terminal-dark transition-colors underline-offset-2 hover:underline"
          >
            {expandedFiles.size === result.findings.length ? "Collapse all" : "Expand all"}
          </button>
        </div>

        <div className="space-y-2">
          {result.findings.map((finding, idx) => (
            <FindingCard
              key={idx}
              finding={finding}
              index={idx}
              isExpanded={expandedFiles.has(idx)}
              onToggle={() => toggleFile(idx)}
            />
          ))}
        </div>
      </div>

      {/* Suggested Refinements */}
      {result.suggestedRefinements && result.suggestedRefinements.length > 0 && (
        <div className="px-4 pb-4 pt-2 border-t border-terminal-dark/5">
          <SuggestedRefinements refinements={result.suggestedRefinements} />
        </div>
      )}
    </motion.div>
  );
};

export default VectorSearchToolUI;
