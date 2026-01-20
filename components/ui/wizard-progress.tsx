"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Check, Sparkles, User, Wrench, BookOpen, Database, Eye, Plug } from "lucide-react";
import { useReducedMotion } from "@/components/character-creation/hooks/use-reduced-motion";

export interface WizardStep {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface WizardProgressProps {
  steps: WizardStep[];
  currentStep: string;
  onStepClick?: (stepId: string) => void;
  className?: string;
}

/** Default wizard steps for agent creation */
export const WIZARD_STEPS: WizardStep[] = [
  { id: "intro", label: "Start", icon: <Sparkles className="w-4 h-4" /> },
  { id: "identity", label: "Identity", icon: <User className="w-4 h-4" /> },
  { id: "knowledge", label: "Knowledge", icon: <BookOpen className="w-4 h-4" /> },
  { id: "embeddingSetup", label: "Embeddings", icon: <Database className="w-4 h-4" /> },
  { id: "vectorSearch", label: "Vector Search", icon: <Database className="w-4 h-4" /> },
  { id: "capabilities", label: "Capabilities", icon: <Wrench className="w-4 h-4" /> },
  { id: "mcpTools", label: "MCP Tools", icon: <Plug className="w-4 h-4" /> },
  { id: "preview", label: "Preview", icon: <Eye className="w-4 h-4" /> },
];

/**
 * WizardProgress - A step progress indicator for multi-step wizards
 * Shows current step, completed steps with checkmarks, and allows backward navigation
 */
export function WizardProgress({
  steps,
  currentStep,
  onStepClick,
  className,
}: WizardProgressProps) {
  const prefersReducedMotion = useReducedMotion();
  const currentIndex = steps.findIndex((s) => s.id === currentStep);

  return (
    <div
      className={cn(
        "w-full bg-terminal-cream/80 backdrop-blur-sm border-b border-terminal-border/50 px-4 py-3",
        className
      )}
    >
      <div className="max-w-3xl mx-auto">
        {/* Progress bar background */}
        <div className="relative">
          <div className="absolute top-4 left-0 right-0 h-0.5 bg-terminal-border/30" />
          <motion.div
            className="absolute top-4 left-0 h-0.5 bg-terminal-green"
            initial={{ width: 0 }}
            animate={{
              width: `${(currentIndex / (steps.length - 1)) * 100}%`,
            }}
            transition={{
              duration: prefersReducedMotion ? 0 : 0.4,
              ease: [0.4, 0, 0.2, 1],
            }}
          />

          {/* Step indicators */}
          <div className="relative flex justify-between">
            {steps.map((step, idx) => {
              const isCompleted = idx < currentIndex;
              const isCurrent = idx === currentIndex;
              const isFuture = idx > currentIndex;
              const canClick = isCompleted && onStepClick;

              return (
                <button
                  key={step.id}
                  onClick={() => canClick && onStepClick(step.id)}
                  disabled={!canClick}
                  className={cn(
                    "flex flex-col items-center gap-1.5 group",
                    canClick && "cursor-pointer",
                    !canClick && "cursor-default"
                  )}
                  title={canClick ? `Go back to ${step.label}` : undefined}
                >
                  {/* Step circle */}
                  <motion.div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors",
                      isCompleted && "bg-terminal-green border-terminal-green text-white",
                      isCurrent && "bg-terminal-cream border-terminal-green text-terminal-green",
                      isFuture && "bg-terminal-cream border-terminal-border/50 text-terminal-muted",
                      canClick && "group-hover:border-terminal-dark group-hover:bg-terminal-green/10"
                    )}
                    initial={false}
                    animate={{
                      scale: isCurrent ? 1.1 : 1,
                    }}
                    transition={{
                      duration: prefersReducedMotion ? 0 : 0.2,
                    }}
                  >
                    {isCompleted ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      step.icon
                    )}
                  </motion.div>

                  {/* Step label */}
                  <span
                    className={cn(
                      "text-xs font-mono transition-colors hidden sm:block",
                      isCompleted && "text-terminal-green",
                      isCurrent && "text-terminal-dark font-semibold",
                      isFuture && "text-terminal-muted",
                      canClick && "group-hover:text-terminal-dark"
                    )}
                  >
                    {step.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

