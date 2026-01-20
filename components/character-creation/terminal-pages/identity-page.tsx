"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { ComputerGraphic } from "../computer-graphic";
import { TypewriterText } from "@/components/ui/typewriter-text";
import { TerminalInput, TerminalTextArea } from "@/components/ui/terminal-input";
import { TerminalPrompt } from "@/components/ui/terminal-prompt";
import { useReducedMotion } from "../hooks/use-reduced-motion";
import { useTranslations } from "next-intl";

export interface AgentIdentity {
  name: string;
  tagline: string;
  purpose: string;
}

interface IdentityPageProps {
  initialIdentity?: Partial<AgentIdentity>;
  onSubmit: (identity: AgentIdentity) => void;
  onBack: () => void;
}

export function IdentityPage({
  initialIdentity = {},
  onSubmit,
  onBack,
}: IdentityPageProps) {
  const t = useTranslations("characterCreation.identity");
  const [name, setName] = useState(initialIdentity.name ?? "");
  const [tagline, setTagline] = useState(initialIdentity.tagline ?? "");
  const [purpose, setPurpose] = useState(initialIdentity.purpose ?? "");
  const [showForm, setShowForm] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof AgentIdentity, string>>>({});
  const prefersReducedMotion = useReducedMotion();
  const hasAnimated = useRef(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onBack();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onBack]);

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof AgentIdentity, string>> = {};
    if (name.trim().length < 2) newErrors.name = t("errorNameMin");
    if (name.trim().length > 50) newErrors.name = t("errorNameMax");
    if (tagline.trim().length > 100) newErrors.tagline = t("errorTaglineMax");
    if (purpose.trim().length < 10) newErrors.purpose = t("errorPurposeMin");
    if (purpose.trim().length > 1000) newErrors.purpose = t("errorPurposeMax");
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    onSubmit({
      name: name.trim(),
      tagline: tagline.trim(),
      purpose: purpose.trim(),
    });
  };

  return (
    <div className="flex h-full min-h-full flex-col items-center bg-terminal-cream px-4 py-6 sm:px-8">
      <div className="flex w-full max-w-2xl flex-1 flex-col gap-6 min-h-0">
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
            <TerminalPrompt prefix="step-1" symbol="$" animate={!prefersReducedMotion}>
              <span className="text-terminal-amber">agent.identity()</span>
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

        {/* Form Section - Scrollable Container */}
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.3 }}
            className="flex min-h-0 flex-1 flex-col rounded-lg border border-terminal-border bg-terminal-bg/30"
          >
            {/* Scrollable content area */}
            <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
              {/* Name Field */}
              <div className="space-y-2">
                <label className="text-sm font-mono text-terminal-dark/70">{t("nameLabel")}</label>
                <TerminalInput
                  value={name}
                  onChange={setName}
                  onSubmit={() => { }}
                  placeholder={t("namePlaceholder")}
                  autoFocusOnMount
                  className="text-terminal-dark placeholder:text-terminal-dark/50"
                />
                {errors.name && <div className="text-red-500 text-xs font-mono">! {errors.name}</div>}
              </div>

              {/* Tagline Field */}
              <div className="space-y-2">
                <label className="text-sm font-mono text-terminal-dark/70">{t("taglineLabel")}</label>
                <TerminalInput
                  value={tagline}
                  onChange={setTagline}
                  onSubmit={() => { }}
                  placeholder={t("taglinePlaceholder")}
                  className="text-terminal-dark placeholder:text-terminal-dark/50"
                />
                {errors.tagline && <div className="text-red-500 text-xs font-mono">! {errors.tagline}</div>}
              </div>

              {/* Purpose Field */}
              <div className="space-y-2">
                <label className="text-sm font-mono text-terminal-dark/70">{t("purposeLabel")}</label>
                <TerminalTextArea
                  value={purpose}
                  onChange={setPurpose}
                  onSubmit={handleSubmit}
                  placeholder={t("purposePlaceholder")}
                  rows={4}
                  className="text-terminal-dark placeholder:text-terminal-dark/50"
                />
                {errors.purpose && <div className="text-red-500 text-xs font-mono">! {errors.purpose}</div>}
              </div>
            </div>

            {/* Navigation - Fixed at bottom */}
            <div className="flex flex-col gap-3 border-t border-terminal-border/50 bg-terminal-cream/90 px-5 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
              <button
                onClick={onBack}
                className="order-2 text-sm font-mono text-terminal-dark/60 transition-colors hover:text-terminal-dark sm:order-1"
              >
                ← {t("back")}
              </button>
              <button
                onClick={handleSubmit}
                disabled={!name.trim() || !purpose.trim()}
                className="order-1 w-full rounded bg-terminal-dark px-4 py-2 text-sm font-mono text-terminal-cream transition-colors hover:bg-terminal-dark/90 disabled:opacity-50 disabled:cursor-not-allowed sm:order-2 sm:w-auto"
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
