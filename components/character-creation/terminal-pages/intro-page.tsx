"use client";

import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { Sparkles, ArrowRight, ArrowLeft, PenTool } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReducedMotion } from "../hooks/use-reduced-motion";
import { useTranslations } from "next-intl";
import { isElectron } from "@/lib/electron/types";
import { cn } from "@/lib/utils";
import { AgentTemplateBrowser } from "../template-browser";
import { AGENCY_AGENTS_SKILLS } from "@/lib/skills/catalog/agency-agents";
import type { CatalogSkill } from "@/lib/skills/catalog/types";

interface IntroPageProps {
  onContinue: () => void;
  onQuickCreate?: (description: string) => void;
  onSelectTemplate?: (template: CatalogSkill) => void;
  onBack?: () => void;
}

export function IntroPage({ onContinue, onQuickCreate, onSelectTemplate, onBack }: IntroPageProps) {
  const t = useTranslations("characterCreation.intro");
  const tc = useTranslations("common");
  const [quickDescription, setQuickDescription] = useState("");
  const [isQuickMode, setIsQuickMode] = useState(false);
  const [isElectronApp, setIsElectronApp] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const prefersReducedMotion = useReducedMotion();

  // Detect Electron environment
  useEffect(() => {
    setIsElectronApp(isElectron());
  }, []);

  // Handle keyboard input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isQuickMode) {
        setIsQuickMode(false);
      } else if (e.key === "Escape" && !isQuickMode && onBack) {
        onBack();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isQuickMode, onBack]);

  // Focus input when quick mode is activated
  useEffect(() => {
    if (isQuickMode && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isQuickMode]);

  const handleQuickSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (quickDescription.trim() && onQuickCreate) {
      onQuickCreate(quickDescription.trim());
    }
  };

  const handleTemplateSelect = (template: CatalogSkill) => {
    onSelectTemplate?.(template);
  };

  return (
    <div className="flex h-full min-h-screen flex-col bg-terminal-cream">
      {/* Top Left Back Button */}
      {onBack && !isQuickMode && (
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className={cn(
            "absolute top-2.5 md:top-3.5 left-4 md:left-6 z-50",
            isElectronApp && "mt-8"
          )}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="flex items-center gap-1 text-terminal-dark hover:bg-terminal-dark/10 h-9 px-3"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden md:inline">{tc("back")}</span>
          </Button>
        </motion.div>
      )}

      {/* Header section */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.5 }}
        className="shrink-0 px-6 pt-14 pb-4 text-center"
      >
        <h1 className="text-2xl font-bold text-terminal-dark font-mono">
          {t("title")}
        </h1>
        <p className="mt-2 text-sm text-terminal-muted font-mono">
          {t("subtitle")}
        </p>
      </motion.div>

      {/* Template Browser — main content area */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          delay: prefersReducedMotion ? 0 : 0.2,
          duration: prefersReducedMotion ? 0 : 0.4,
        }}
        className="mx-auto flex w-full max-w-6xl flex-1 min-h-0 px-4 pb-4"
      >
        <AgentTemplateBrowser
          templates={AGENCY_AGENTS_SKILLS}
          onSelectTemplate={handleTemplateSelect}
        />
      </motion.div>

      {/* Bottom bar — Start from Scratch + Quick Create */}
      {!isQuickMode ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: prefersReducedMotion ? 0 : 0.4,
            duration: prefersReducedMotion ? 0 : 0.3,
          }}
          className="shrink-0 border-t border-terminal-border/50 bg-terminal-cream/90 backdrop-blur-sm"
        >
          <div className="mx-auto flex max-w-6xl items-center justify-center gap-6 px-6 py-4">
            <button
              onClick={onContinue}
              className="group inline-flex items-center gap-2 rounded-lg border border-terminal-border/60 bg-white px-5 py-2.5 font-mono text-sm text-terminal-dark transition-colors hover:border-terminal-dark/30 hover:bg-terminal-dark/5"
            >
              <PenTool className="h-4 w-4 text-terminal-muted" />
              <span>{t("guidedCreation")}</span>
              <ArrowRight className="h-4 w-4 opacity-50 transition-all group-hover:translate-x-1 group-hover:opacity-100" />
            </button>

            {onQuickCreate && (
              <button
                onClick={() => setIsQuickMode(true)}
                className="group inline-flex items-center gap-2 rounded-lg border border-terminal-amber/30 bg-terminal-amber/5 px-5 py-2.5 font-mono text-sm text-terminal-dark transition-colors hover:bg-terminal-amber/10"
              >
                <Sparkles className="h-4 w-4 text-terminal-amber" />
                <span>{t("quickCreate")}</span>
              </button>
            )}
          </div>
        </motion.div>
      ) : (
        /* Quick Create Input — replaces the bottom bar */
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.3 }}
          className="shrink-0 border-t border-terminal-border/50 bg-terminal-cream/90 backdrop-blur-sm px-6 py-5"
        >
          <div className="mx-auto max-w-2xl space-y-3">
            <p className="text-sm text-terminal-muted font-mono text-center">
              {t("quickPrompt")}
            </p>
            <form onSubmit={handleQuickSubmit} className="space-y-3">
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-terminal-green font-mono">
                  {">"}
                </span>
                <input
                  ref={inputRef}
                  type="text"
                  value={quickDescription}
                  onChange={(e) => setQuickDescription(e.target.value)}
                  placeholder={t("quickPlaceholder")}
                  className="w-full pl-10 pr-4 py-3 bg-terminal-dark text-terminal-cream font-mono text-sm rounded-lg placeholder:text-terminal-cream/40 focus:outline-none focus:ring-2 focus:ring-terminal-green/50"
                  autoComplete="off"
                />
                {!quickDescription && (
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 animate-blink text-terminal-green pointer-events-none">
                    ▋
                  </span>
                )}
              </div>
              <div className="flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => setIsQuickMode(false)}
                  className="px-4 py-2 text-terminal-muted font-mono text-sm hover:text-terminal-dark transition-colors"
                >
                  {t("back")}
                </button>
                <button
                  type="submit"
                  disabled={!quickDescription.trim()}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-terminal-amber text-terminal-dark font-mono text-sm rounded-lg hover:bg-terminal-amber/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{t("generate")}</span>
                </button>
              </div>
            </form>
          </div>
        </motion.div>
      )}

      {/* Decorative Elements */}
      <div className="absolute bottom-2 left-4 font-mono text-[10px] text-terminal-muted opacity-60">
        Selene
      </div>
      <div className="absolute bottom-2 right-4 font-mono text-[10px] text-terminal-muted opacity-60">
        {new Date().getFullYear()}
      </div>
    </div>
  );
}
