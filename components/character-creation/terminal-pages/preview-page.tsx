"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { ComputerGraphic } from "../computer-graphic";
import { TerminalPrompt, TerminalBlock } from "@/components/ui/terminal-prompt";
import { useReducedMotion } from "../hooks/use-reduced-motion";
import { ToolBadge, TOOL_ICONS } from "@/components/ui/tool-badge";
import { Wrench, FileText, Sparkles, CheckCircle2 } from "lucide-react";
import type { AgentIdentity } from "./identity-page";
import type { UploadedDocument } from "./knowledge-base-page";
import { useTranslations } from "next-intl";

/** Tool translation keys for preview - maps tool ID to capabilities.tools key */
const TOOL_TRANSLATION_KEYS: Record<string, string> = {
  docsSearch: "docsSearch",
  vectorSearch: "vectorSearch",
  generateImageFlux2: "generateImageFlux2",
  generateImageWan22: "generateImageWan22",
  editRoomImage: "editRoomImage",
  generateVideoWan22: "generateVideoWan22",
  generatePixelVideoWan22: "generatePixelVideoWan22",
  showProductImages: "showProductImages",
  executeCommand: "executeCommand",
};

interface PreviewPageProps {
  identity: AgentIdentity;
  enabledTools: string[];
  documents: UploadedDocument[];
  onConfirm: () => void;
  onBack: () => void;
  isSubmitting?: boolean;
}

export function PreviewPage({
  identity,
  enabledTools,
  documents,
  onConfirm,
  onBack,
  isSubmitting = false,
}: PreviewPageProps) {
  const t = useTranslations("characterCreation.preview");
  const tTools = useTranslations("characterCreation.capabilities.tools");
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) {
        onBack();
      }
      if (e.key === "Enter" && !isSubmitting) {
        onConfirm();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onBack, onConfirm, isSubmitting]);

  return (
    <div className="flex h-full min-h-full flex-col items-center bg-terminal-cream px-4 py-6 sm:px-8">
      <div className="flex w-full max-w-3xl flex-1 flex-col gap-6 min-h-0">
        {/* Header */}
        <div className="flex items-start gap-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.5 }}
          >
            <ComputerGraphic size="sm" />
          </motion.div>

          <div className="flex-1">
            <TerminalPrompt prefix="preview" symbol="$" animate={!prefersReducedMotion}>
              <span className="text-terminal-amber">agent.preview()</span>
            </TerminalPrompt>
            <h1 className="mt-2 text-2xl font-mono font-bold text-terminal-dark">
              {identity.name}
            </h1>
            {identity.tagline && (
              <p className="text-terminal-muted font-mono text-sm mt-1">
                {identity.tagline}
              </p>
            )}
          </div>
        </div>

        {/* Scrollable content container */}
        <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-terminal-border bg-terminal-bg/30">
          <div className="flex-1 min-h-0 overflow-y-auto p-5">
            {/* Agent Configuration Grid */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: prefersReducedMotion ? 0 : 0.2 }}
              className="grid md:grid-cols-2 gap-4"
            >
              {/* Purpose */}
              <TerminalBlock title={t("purpose")}>
                <div className="text-sm text-terminal-text/90">
                  {identity.purpose}
                </div>
              </TerminalBlock>

              {/* Capabilities */}
              <TerminalBlock title={t("capabilities")}>
                <div className="space-y-2 text-sm">
                  {enabledTools.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {enabledTools.map((toolId) => (
                        <ToolBadge
                          key={toolId}
                          toolId={toolId}
                          size="sm"
                          showLabel
                          label={TOOL_TRANSLATION_KEYS[toolId] ? tTools(TOOL_TRANSLATION_KEYS[toolId]) : toolId}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-terminal-dark/50 italic flex items-center gap-2">
                      <Wrench className="w-4 h-4" />
                      {t("noToolsEnabled")}
                    </div>
                  )}
                </div>
              </TerminalBlock>

              {/* Knowledge Base */}
              <TerminalBlock title={t("knowledgeBase")}>
                <div className="space-y-2 text-sm">
                  {documents.length > 0 ? (
                    <>
                      <div className="flex items-center gap-2 text-terminal-amber font-semibold">
                        <FileText className="w-4 h-4" />
                        {documents.length === 1
                          ? t("documentsAttached", { count: documents.length })
                          : t("documentsAttachedPlural", { count: documents.length })}
                      </div>
                      <div className="space-y-1">
                        {documents.slice(0, 3).map((doc) => (
                          <div key={doc.id} className="text-terminal-text/70 truncate pl-6">
                            • {doc.title || doc.originalFilename}
                          </div>
                        ))}
                        {documents.length > 3 && (
                          <div className="text-terminal-text/50 italic pl-6">
                            {t("moreDocuments", { count: documents.length - 3 })}
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="text-terminal-text/50 italic flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      {t("noDocuments")}
                    </div>
                  )}
                </div>
              </TerminalBlock>

              {/* Summary */}
              <TerminalBlock title={t("configSummary")}>
                <div className="space-y-2 text-sm text-terminal-text/90">
                  <div className="flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-terminal-muted/80" />
                    {t("toolsEnabled", { count: enabledTools.length })}
                  </div>
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-terminal-muted/80" />
                    {t("documentsCount", { count: documents.length })}
                  </div>
                  <div className="flex items-center gap-2 text-terminal-green mt-2">
                    <CheckCircle2 className="w-4 h-4" />
                    {t("readyToDeploy")}
                  </div>
                </div>
              </TerminalBlock>
            </motion.div>
          </div>

          {/* Actions - Fixed at bottom */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: prefersReducedMotion ? 0 : 0.3 }}
            className="flex flex-col gap-3 border-t border-terminal-border/50 bg-terminal-cream/90 px-5 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between"
          >
            <button
              onClick={onBack}
              disabled={isSubmitting}
              className="order-2 text-sm font-mono text-terminal-muted hover:text-terminal-dark transition-colors disabled:opacity-50 sm:order-1"
            >
              ← {t("back")}
            </button>

            <button
              onClick={onConfirm}
              disabled={isSubmitting}
              className="order-1 w-full px-6 py-2 bg-terminal-green text-terminal-dark font-mono text-sm font-bold rounded hover:bg-terminal-green/90 transition-colors disabled:opacity-50 sm:order-2 sm:w-auto"
            >
              {isSubmitting ? t("creating") : t("createAgent")}
            </button>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
