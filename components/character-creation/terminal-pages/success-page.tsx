"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import confetti from "canvas-confetti";
import { ComputerGraphic } from "../computer-graphic";
import { TypewriterText } from "@/components/ui/typewriter-text";
import { useReducedMotion } from "../hooks/use-reduced-motion";
import { Check, MessageSquare, User, ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

interface SuccessPageProps {
  characterId: string;
  characterName: string;
  avatarUrl?: string;
}

export function SuccessPage({ characterId, characterName, avatarUrl }: SuccessPageProps) {
  const t = useTranslations("characterCreation.success");
  const prefersReducedMotion = useReducedMotion();

  // Celebration confetti
  useEffect(() => {
    if (prefersReducedMotion) return;

    const duration = 2000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ["#00ff00", "#ffb000", "#f5e6d3"],
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ["#00ff00", "#ffb000", "#f5e6d3"],
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };

    frame();
  }, [prefersReducedMotion]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-terminal-cream">
      <div className="w-full max-w-lg text-center space-y-8">
        {/* Success Icon */}
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{
            type: "spring",
            stiffness: 200,
            damping: 15,
            duration: prefersReducedMotion ? 0 : undefined,
          }}
          className="mx-auto w-20 h-20 rounded-full bg-terminal-green/20 flex items-center justify-center"
        >
          <Check className="w-10 h-10 text-terminal-green" strokeWidth={3} />
        </motion.div>

        {/* Avatar or Computer */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: prefersReducedMotion ? 0 : 0.3 }}
          className="flex justify-center"
        >
          {avatarUrl ? (
            <div className="relative">
              <div className="w-40 h-40 rounded-full overflow-hidden border-4 border-terminal-green shadow-lg shadow-terminal-green/20">
                <img
                  src={avatarUrl}
                  alt={characterName}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-terminal-green flex items-center justify-center">
                <Check className="w-5 h-5 text-terminal-cream" strokeWidth={3} />
              </div>
            </div>
          ) : (
            <ComputerGraphic
              size="md"
              screenContent={
                <div className="flex flex-col items-center justify-center h-full">
                  <span className="text-terminal-green text-lg">✓</span>
                  <span className="text-terminal-amber text-xs mt-1">{t("complete")}</span>
                </div>
              }
            />
          )}
        </motion.div>

        {/* Success Message */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: prefersReducedMotion ? 0 : 0.5 }}
          className="space-y-2"
        >
          <h1 className="text-3xl font-mono font-bold text-terminal-dark">
            <TypewriterText
              text={t("title", { name: characterName })}
              delay={prefersReducedMotion ? 0 : 600}
              speed={prefersReducedMotion ? 0 : 40}
              showCursor={false}
            />
          </h1>
	          <p className="text-terminal-muted font-mono">
	            {t("subtitle")}
	          </p>
        </motion.div>

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: prefersReducedMotion ? 0 : 0.8 }}
          className="space-y-4"
        >
          <Link
            href={`/chat/${characterId}`}
            className="flex items-center justify-center gap-3 w-full px-6 py-4 bg-terminal-dark text-terminal-cream font-mono rounded-lg hover:bg-terminal-dark/90 transition-colors group"
          >
            <MessageSquare className="w-5 h-5" />
            <span>{t("startChatting")}</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>

          <div className="flex gap-3">
	            <Link
	              href="/create-character"
	              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-terminal-border text-terminal-dark font-mono text-sm rounded-lg hover:bg-terminal-bg/30 transition-colors"
	            >
	              {t("configureAnother")}
	            </Link>
            <Link
              href="/"
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-terminal-border text-terminal-dark font-mono text-sm rounded-lg hover:bg-terminal-bg/30 transition-colors"
            >
	              <User className="w-4 h-4" />
	              {t("myAgents")}
            </Link>
          </div>
        </motion.div>

        {/* Footer */}
	        <div className="pt-8 text-xs font-mono text-terminal-muted">
	          <span className="text-terminal-green">{">"}</span> {t("agentId")}: {characterId.slice(0, 8)}...
	        </div>
      </div>
    </div>
  );
}

