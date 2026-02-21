"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  GitBranchIcon,
  FileSearchIcon,
  LayoutDashboardIcon,
  ChevronRightIcon,
  CheckIcon,
} from "lucide-react";
import { resilientPatch } from "@/lib/utils/resilient-fetch";

interface WorkspaceOnboardingProps {
  open: boolean;
  onComplete: () => void;
}

const STEPS = [
  {
    icon: GitBranchIcon,
    title: "Workspaces let your agent work in isolation",
    description:
      "Your agent can create a separate copy of your code using git worktrees, make changes, and submit them for review — without touching your working files.",
    visual: (
      <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 font-mono text-xs text-emerald-800">
        <GitBranchIcon className="w-3.5 h-3.5 flex-shrink-0" />
        <span>feature/auth-refactor</span>
        <span className="opacity-50">&middot;</span>
        <span>3 files changed</span>
        <span className="ml-auto rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
          PR #42
        </span>
      </div>
    ),
    hint: "This badge appears in your chat header when a workspace is active.",
  },
  {
    icon: FileSearchIcon,
    title: "Review changes before they land",
    description:
      "See exactly what changed in a side panel with syntax-highlighted diffs. Approve changes, sync them to your local repository, or ask the agent to revise.",
    visual: (
      <div className="space-y-1 rounded-lg border border-terminal-border bg-white p-3 font-mono text-xs">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-green-50 text-[10px] font-bold text-green-600">
            A
          </span>
          <span className="text-terminal-dark/80">src/auth/middleware.ts</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-amber-50 text-[10px] font-bold text-amber-600">
            M
          </span>
          <span className="text-terminal-dark/80">src/routes/login.ts</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-red-50 text-[10px] font-bold text-red-600">
            D
          </span>
          <span className="text-terminal-dark/80">src/auth/legacy.ts</span>
        </div>
      </div>
    ),
    hint: "Click \"View Changes\" from the workspace badge to open the diff panel.",
  },
  {
    icon: LayoutDashboardIcon,
    title: "Track all workspaces at a glance",
    description:
      "See all your agents' active workspaces on the home page — their status, branch names, PR links, and quick actions like continue, cleanup, or view PR.",
    visual: (
      <div className="grid grid-cols-2 gap-2">
        {[
          { agent: "Seline", branch: "auth-refactor", status: "3 files", color: "emerald" },
          { agent: "CodeBot", branch: "fix-bug-123", status: "PR #67", color: "blue" },
        ].map((w) => (
          <div
            key={w.branch}
            className={cn(
              "rounded-lg border p-2 font-mono text-xs",
              w.color === "emerald"
                ? "border-emerald-200 bg-emerald-50"
                : "border-blue-200 bg-blue-50"
            )}
          >
            <div className="font-medium text-terminal-dark">{w.agent}</div>
            <div className="text-terminal-muted">{w.branch}</div>
            <div
              className={cn(
                "mt-1 text-[10px]",
                w.color === "emerald" ? "text-emerald-700" : "text-blue-700"
              )}
            >
              {w.status}
            </div>
          </div>
        ))}
      </div>
    ),
    hint: "Active workspaces appear above your agent cards on the home page.",
  },
] as const;

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 80 : -80,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 80 : -80,
    opacity: 0,
  }),
};

export function WorkspaceOnboarding({ open, onComplete }: WorkspaceOnboardingProps) {
  const t = useTranslations("workspace.onboarding");
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(0);

  const stepTexts = [
    { title: t("step1.title"), description: t("step1.description"), hint: t("step1.hint") },
    { title: t("step2.title"), description: t("step2.description"), hint: t("step2.hint") },
    { title: t("step3.title"), description: t("step3.description"), hint: t("step3.hint") },
  ];

  const handleNext = useCallback(() => {
    if (step < STEPS.length - 1) {
      setDirection(1);
      setStep((s) => s + 1);
    } else {
      // Mark onboarding as seen
      resilientPatch("/api/settings", { workspaceOnboardingSeen: true }).catch(() => {});
      onComplete();
    }
  }, [step, onComplete]);

  const handleSkip = useCallback(() => {
    resilientPatch("/api/settings", { workspaceOnboardingSeen: true }).catch(() => {});
    onComplete();
  }, [onComplete]);

  const current = STEPS[step];
  const currentText = stepTexts[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleSkip()}>
      <DialogContent className="sm:max-w-[440px] p-0 overflow-hidden border-terminal-border bg-terminal-cream">
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 pt-5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === step ? "w-6 bg-terminal-green" : "w-1.5 bg-terminal-dark/15"
              )}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="relative min-h-[320px] overflow-hidden px-6 pb-2">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="flex flex-col items-center text-center"
            >
              {/* Icon */}
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-terminal-green/10">
                <Icon className="w-6 h-6 text-terminal-green" />
              </div>

              {/* Title */}
              <h3 className="mb-2 font-mono text-base font-medium text-terminal-dark">
                {currentText.title}
              </h3>

              {/* Description */}
              <p className="mb-4 text-sm leading-relaxed text-terminal-muted">
                {currentText.description}
              </p>

              {/* Visual mockup */}
              <div className="w-full max-w-[340px] mb-3">
                {current.visual}
              </div>

              {/* Hint */}
              <p className="text-xs text-terminal-muted/60 italic">
                {currentText.hint}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-terminal-border px-6 py-3">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs font-mono text-terminal-muted"
            onClick={handleSkip}
          >
            {t("skip")}
          </Button>

          <Button
            size="sm"
            className="gap-1.5 font-mono text-xs"
            onClick={handleNext}
          >
            {isLast ? (
              <>
                <CheckIcon className="w-3.5 h-3.5" />
                {t("gotIt")}
              </>
            ) : (
              <>
                {t("next")}
                <ChevronRightIcon className="w-3.5 h-3.5" />
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
