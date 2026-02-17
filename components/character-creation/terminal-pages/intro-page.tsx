"use client";

import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { Sparkles, ArrowRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ComputerGraphic } from "../computer-graphic";
import { useReducedMotion } from "../hooks/use-reduced-motion";
import { useTranslations } from "next-intl";
import { isElectron } from "@/lib/electron/types";
import { cn } from "@/lib/utils";

interface IntroPageProps {
  onContinue: () => void;
  onQuickCreate?: (description: string) => void;
  onCreateFromTemplate?: (templateId: string, templateName: string) => void;
  onBack?: () => void;
}

type AgentTemplateLite = {
  id: string;
  name: string;
  tagline: string;
  category?: string;
};

export function IntroPage({ onContinue, onQuickCreate, onCreateFromTemplate, onBack }: IntroPageProps) {
  const t = useTranslations("characterCreation.intro");
  const tc = useTranslations("common");
  const [showSubtitle, setShowSubtitle] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [quickDescription, setQuickDescription] = useState("");
  const [isQuickMode, setIsQuickMode] = useState(false);
  const [isElectronApp, setIsElectronApp] = useState(false);
  const [templates, setTemplates] = useState<AgentTemplateLite[]>([]);
  const [templateQuery, setTemplateQuery] = useState("");
  const [templateCategory, setTemplateCategory] = useState("");
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const prefersReducedMotion = useReducedMotion();

  // Detect Electron environment
  useEffect(() => {
    setIsElectronApp(isElectron());
  }, []);

  // Handle keyboard input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && showPrompt && !isQuickMode) {
        onContinue();
      }
      if (e.key === "Escape" && !isQuickMode && onBack) {
        onBack();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showPrompt, isQuickMode, onContinue, onBack]);

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

  const loadTemplates = async () => {
    if (!onCreateFromTemplate) return;
    setLoadingTemplates(true);
    try {
      const params = new URLSearchParams();
      if (templateQuery.trim()) params.set("q", templateQuery.trim());
      if (templateCategory.trim()) params.set("category", templateCategory.trim());
      const res = await fetch(`/api/characters/templates?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      setTemplates(Array.isArray(data.templates) ? data.templates : []);
    } finally {
      setLoadingTemplates(false);
    }
  };

  useEffect(() => {
    if (!showPrompt || !onCreateFromTemplate) return;
    void loadTemplates();
  }, [showPrompt, onCreateFromTemplate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-terminal-cream">
      {/* Computer Graphic */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{
          duration: prefersReducedMotion ? 0 : 0.8,
          ease: [0.4, 0, 0.2, 1],
        }}
        className="mb-12"
      >
        <ComputerGraphic
          size="lg"
          screenContent={
            <div className="flex items-center justify-center h-full">
              <span className="text-terminal-green text-lg animate-pulse">
                ▋
              </span>
            </div>
          }
        />
      </motion.div>

      {/* Title */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{
          delay: prefersReducedMotion ? 0 : 0.4,
          duration: prefersReducedMotion ? 0 : 0.5,
        }}
        onAnimationComplete={() => {
          // Trigger subtitle after animation completes
          setTimeout(() => setShowSubtitle(true), prefersReducedMotion ? 0 : 300);
        }}
        className="text-center space-y-4 max-w-2xl"
      >
        {/* Subtitle */}
        {showSubtitle && (
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.5 }}
            className="text-lg text-terminal-muted font-mono"
            onAnimationComplete={() => {
              setTimeout(() => setShowPrompt(true), prefersReducedMotion ? 0 : 500);
            }}
          >
            {t("subtitle")}
          </motion.p>
        )}

        {/* Action Buttons */}
        {showPrompt && !isQuickMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.3 }}
            className="pt-8 space-y-4"
          >
            {/* Main Continue Button */}
            <button
              onClick={onContinue}
              className="group inline-flex items-center gap-2 px-6 py-3 bg-terminal-dark text-terminal-cream font-mono text-sm rounded-lg hover:bg-terminal-dark/90 transition-colors"
            >
              <span className="text-terminal-green">{">"}</span>
              <span>{t("guidedCreation")}</span>
              <ArrowRight className="w-4 h-4 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
            </button>

            {/* Quick Create Button */}
            {onQuickCreate && (
              <div className="flex flex-col items-center gap-2">
                <span className="text-xs text-terminal-muted font-mono">{t("or")}</span>
                <button
                  onClick={() => setIsQuickMode(true)}
                  className="group inline-flex items-center gap-2 px-6 py-3 bg-terminal-cream/50 text-terminal-dark font-mono text-sm rounded-lg hover:bg-terminal-amber/10 shadow-sm transition-colors"
                >
                  <Sparkles className="w-4 h-4 text-terminal-amber" />
                  <span>{t("quickCreate")}</span>
                </button>
              </div>
            )}

            {onCreateFromTemplate ? (
              <div className="mx-auto mt-6 w-full max-w-2xl rounded-lg border border-terminal-border bg-terminal-cream/50 p-4 text-left">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <input
                    value={templateQuery}
                    onChange={(e) => setTemplateQuery(e.target.value)}
                    placeholder={t("templateSearch")}
                    className="flex-1 rounded border border-terminal-border bg-white px-3 py-2 font-mono text-xs text-terminal-dark"
                  />
                  <input
                    value={templateCategory}
                    onChange={(e) => setTemplateCategory(e.target.value)}
                    placeholder={t("templateCategory")}
                    className="w-36 rounded border border-terminal-border bg-white px-3 py-2 font-mono text-xs text-terminal-dark"
                  />
                  <button
                    onClick={() => void loadTemplates()}
                    className="rounded bg-terminal-dark px-3 py-2 font-mono text-xs text-terminal-cream"
                  >
                    {t("templateFilter")}
                  </button>
                </div>

                <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                  {loadingTemplates ? <p className="font-mono text-xs text-terminal-muted">{t("templateLoading")}</p> : null}
                  {!loadingTemplates && templates.length === 0 ? (
                    <p className="font-mono text-xs text-terminal-muted">{t("templateEmpty")}</p>
                  ) : null}
                  {templates.map((template) => (
                    <div key={template.id} className="rounded border border-terminal-border/70 bg-white p-2">
                      <p className="font-mono text-xs font-semibold text-terminal-dark">{template.name}</p>
                      <p className="mt-1 font-mono text-[11px] text-terminal-muted">{template.tagline}</p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="font-mono text-[10px] uppercase tracking-wide text-terminal-muted">{template.category || "general"}</span>
                        <button
                          onClick={() => onCreateFromTemplate(template.id, template.name)}
                          className="rounded bg-terminal-green px-2 py-1 font-mono text-[11px] text-white"
                        >
                          {t("templateUse")}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </motion.div>
        )}

        {/* Quick Create Input */}
        {showPrompt && isQuickMode && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.3 }}
            className="pt-8 space-y-4"
          >
            <p className="text-sm text-terminal-muted font-mono">
              {t("quickPrompt")}
            </p>
            <form onSubmit={handleQuickSubmit} className="space-y-4">
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
                <span className="absolute right-4 top-1/2 -translate-y-1/2 animate-blink text-terminal-green">
                  ▋
                </span>
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
          </motion.div>
        )}
      </motion.div>

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

      {/* Decorative Elements */}
      <div className="absolute bottom-8 left-8 font-mono text-xs text-terminal-muted opacity-80">
        Seline
      </div>
      <div className="absolute bottom-8 right-8 font-mono text-xs text-terminal-muted opacity-80">
        {new Date().getFullYear()}
      </div>
    </div>
  );
}

