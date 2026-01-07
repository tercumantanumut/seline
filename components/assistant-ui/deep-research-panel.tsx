"use client";

import type { FC } from "react";
import { cn } from "@/lib/utils";
import type { ResearchPhase, ResearchFinding, FinalReport } from "@/lib/ai/deep-research/types";
import {
  SearchIcon,
  FileTextIcon,
  RefreshCwIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ClipboardListIcon,
  BrainIcon,
  XIcon,
  ExternalLinkIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  BookOpenIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { StandaloneMarkdown } from "@/components/ui/standalone-markdown";
import { useTranslations } from "next-intl";

interface DeepResearchPanelProps {
  phase: ResearchPhase;
  phaseMessage: string;
  progress: { completed: number; total: number; currentQuery: string } | null;
  findings: ResearchFinding[];
  finalReport: FinalReport | null;
  error: string | null;
  onCancel: () => void;
  onReset: () => void;
}

const PHASE_CONFIG: Record<ResearchPhase, { icon: typeof SearchIcon; color: string }> = {
  idle: { icon: BrainIcon, color: "text-terminal-muted" },
  planning: { icon: ClipboardListIcon, color: "text-blue-500" },
  searching: { icon: SearchIcon, color: "text-amber-500" },
  analyzing: { icon: BrainIcon, color: "text-purple-500" },
  drafting: { icon: FileTextIcon, color: "text-green-500" },
  refining: { icon: RefreshCwIcon, color: "text-orange-500" },
  finalizing: { icon: FileTextIcon, color: "text-emerald-500" },
  complete: { icon: CheckCircleIcon, color: "text-green-600" },
  error: { icon: AlertCircleIcon, color: "text-red-500" },
};

export const DeepResearchPanel: FC<DeepResearchPanelProps> = ({
  phase,
  phaseMessage,
  progress,
  findings,
  finalReport,
  error,
  onCancel,
  onReset,
}) => {
  const [showSources, setShowSources] = useState(false);
  const t = useTranslations("assistantUi.deepResearchPanel");
  const config = PHASE_CONFIG[phase];
  const Icon = config.icon;
  const isComplete = phase === 'complete';
  const isActive = phase !== "idle" && phase !== "complete" && phase !== "error";
  const phaseLabel = t(`phases.${phase}`);

  return (
    <div className={cn(
      "w-full rounded-lg mb-4",
      !isComplete && "border border-terminal-dark/20 bg-terminal-cream/50 p-4",
      isComplete && "p-0"
    )}>
      {/* Header - Only show if not complete */}
      {!isComplete && (
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={cn("p-1.5 rounded-md bg-terminal-dark/5", config.color)}>
              <Icon className={cn("size-4", isActive && "animate-pulse")} />
            </div>
            <div>
              <span className="font-mono text-sm font-medium text-terminal-dark">
                {t("title")}
              </span>
              <span className={cn("ml-2 text-xs font-mono", config.color)}>
                {phaseLabel}
              </span>
            </div>
          </div>
          {isActive && (
            <Button variant="ghost" size="sm" onClick={onCancel} className="h-7 px-2">
              <XIcon className="size-3 mr-1" />
              {t("cancel")}
            </Button>
          )}
          {phase === "error" && (
            <Button variant="ghost" size="sm" onClick={onReset} className="h-7 px-2">
              {t("newResearch")}
            </Button>
          )}
        </div>
      )}

      {/* Phase Message */}
      {phaseMessage && (
        <p className="text-xs font-mono text-terminal-muted mb-2">{phaseMessage}</p>
      )}

      {/* Progress Bar */}
      {progress && phase === "searching" && (
        <div className="mb-3">
          <div className="flex justify-between text-xs font-mono text-terminal-muted mb-1">
            <span>{t("searchingPrefix")} {progress.currentQuery.slice(0, 40)}...</span>
            <span>{progress.completed}/{progress.total}</span>
          </div>
          <div className="h-1.5 bg-terminal-dark/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 transition-all duration-300"
              style={{ width: `${(progress.completed / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Sources Found */}
      {findings.length > 0 && (
        <div className="mb-3">
          <button
            onClick={() => setShowSources(!showSources)}
            className="flex items-center gap-1 text-xs font-mono text-terminal-muted hover:text-terminal-dark"
          >
            {showSources ? <ChevronUpIcon className="size-3" /> : <ChevronDownIcon className="size-3" />}
            {t("sourcesFound", { count: findings.reduce((acc, f) => acc + f.sources.length, 0) })}
          </button>
          {showSources && (
            <div className="mt-2 max-h-32 overflow-y-auto space-y-1">
              {findings.flatMap((f) =>
                f.sources.map((source, i) => (
                  <a
                    key={`${f.query}-${i}`}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-blue-600 hover:underline truncate"
                  >
                    <ExternalLinkIcon className="size-3 flex-shrink-0" />
                    {source.title}
                  </a>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600 font-mono">
          {error}
        </div>
      )}

      {/* Final Report Display */}
      {finalReport && phase === "complete" && (
        <div className="mt-4 border-t border-terminal-dark/10 pt-4">
          <div className="flex items-center gap-2 mb-3">
            <BookOpenIcon className="size-4 text-green-600" />
            <h3 className="font-mono font-medium text-terminal-dark">
              {finalReport.title}
            </h3>
          </div>

          {/* Report Content */}
          <div className="text-sm text-terminal-dark/90">
            <StandaloneMarkdown content={finalReport.content} />
          </div>

          {/* Citations */}
          {finalReport.citations && finalReport.citations.length > 0 && (
            <div className="mt-4 pt-3 border-t border-terminal-dark/10">
              <button
                onClick={() => setShowSources(!showSources)}
                className="flex items-center gap-1 text-xs font-mono text-terminal-muted hover:text-terminal-dark mb-2"
              >
                {showSources ? <ChevronUpIcon className="size-3" /> : <ChevronDownIcon className="size-3" />}
                {t("citations", { count: finalReport.citations.length })}
              </button>
              {showSources && (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {finalReport.citations.map((citation, i) => (
                    <a
                      key={i}
                      href={citation.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2 text-xs text-terminal-dark/70 hover:text-blue-600 p-1 rounded hover:bg-terminal-dark/5"
                    >
                      <span className="text-terminal-muted font-mono">[{i + 1}]</span>
                      <div className="flex-1 min-w-0">
                        <span className="font-medium block truncate">{citation.title}</span>
                        <span className="text-terminal-muted truncate block">{citation.url}</span>
                      </div>
                      <ExternalLinkIcon className="size-3 flex-shrink-0 mt-0.5" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

