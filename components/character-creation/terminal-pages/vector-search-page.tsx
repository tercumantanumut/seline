"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useReducedMotion } from "../hooks/use-reduced-motion";
import { FolderSyncManager } from "@/components/vector-search/folder-sync-manager";
import { DatabaseIcon, ArrowLeftIcon, ArrowRightIcon, SkipForwardIcon } from "lucide-react";
import { useTranslations } from "next-intl";

interface VectorSearchPageProps {
  agentId: string;
  agentName: string;
  onSubmit: () => void;
  onBack: () => void;
  onSkip: () => void;
}

export function VectorSearchPage({
  agentId,
  agentName,
  onSubmit,
  onBack,
  onSkip,
}: VectorSearchPageProps) {
  const t = useTranslations("characterCreation.vectorSearchPage");
  const [showContent, setShowContent] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  // Show content immediately or with a short delay
  useEffect(() => {
    if (prefersReducedMotion) {
      setShowContent(true);
    } else {
      const timer = setTimeout(() => setShowContent(true), 100);
      return () => clearTimeout(timer);
    }
  }, [prefersReducedMotion]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onBack();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onBack]);

  return (
    <div className="flex h-full min-h-full flex-col items-center bg-terminal-cream px-4 py-6 sm:px-8">
      <div className="flex w-full max-w-2xl flex-1 flex-col gap-6 min-h-0">
        {/* Compact Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.3 }}
          className="flex items-center gap-3"
        >
          <div className="p-2 rounded-lg bg-terminal-green/10">
            <DatabaseIcon className="w-5 h-5 text-terminal-green" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-terminal-muted uppercase tracking-wide">{t("step")}</span>
              <h2 className="font-mono font-semibold text-terminal-dark">{t("title")}</h2>
            </div>
            <p className="text-sm text-terminal-muted font-mono">
              {t("description", { agentName })}
            </p>
          </div>
        </motion.div>

        {/* Folder Manager - Scrollable Container */}
        {showContent && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.3, delay: 0.1 }}
            className="flex min-h-0 flex-1 flex-col rounded-lg border border-terminal-border bg-terminal-bg/20"
          >
            {/* Scrollable content */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4">
              <FolderSyncManager characterId={agentId} />
            </div>

            {/* Navigation - Fixed at bottom */}
            <div className="flex flex-col gap-3 border-t border-terminal-border/50 bg-terminal-cream/90 px-5 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
              <button
                onClick={onBack}
                className="order-2 flex items-center gap-2 font-mono text-terminal-muted hover:text-terminal-dark transition-colors sm:order-1"
              >
                <ArrowLeftIcon className="w-4 h-4" />
                {t("back")}
              </button>

              <div className="flex gap-3 order-1 sm:order-2">
                <button
                  onClick={onSkip}
                  className="flex items-center gap-2 font-mono text-terminal-muted hover:text-terminal-dark transition-colors"
                >
                  <SkipForwardIcon className="w-4 h-4" />
                  {t("skip")}
                </button>
                <button
                  onClick={onSubmit}
                  className="flex items-center gap-2 px-4 py-2 bg-terminal-green text-white font-mono rounded hover:bg-terminal-green/90 transition-colors"
                >
                  {t("continue")}
                  <ArrowRightIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
