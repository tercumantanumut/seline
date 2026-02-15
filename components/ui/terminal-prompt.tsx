"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useReducedMotion } from "@/components/character-creation/hooks/use-reduced-motion";

interface TerminalPromptProps {
  /** The prompt symbol (default: ">") */
  symbol?: string;
  /** The command/path prefix */
  prefix?: string;
  /** Content after the prompt */
  children?: React.ReactNode;
  /** CSS class for the container */
  className?: string;
  /** Whether to animate the prompt appearing */
  animate?: boolean;
  /** Animation delay in seconds */
  animationDelay?: number;
}

export function TerminalPrompt({
  symbol = ">",
  prefix,
  children,
  className,
  animate: shouldAnimate = true,
  animationDelay = 0,
}: TerminalPromptProps) {
  const prefersReducedMotion = useReducedMotion();
  const skipAnimation = prefersReducedMotion || !shouldAnimate;

  const content = (
    <div
      className={cn(
        "flex items-start gap-2 font-mono text-terminal-green",
        className
      )}
    >
      {prefix && (
        <span className="text-terminal-amber shrink-0">{prefix}</span>
      )}
      <span className="text-terminal-green shrink-0">{symbol}</span>
      <span className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-terminal-text">{children}</span>
    </div>
  );

  if (skipAnimation) {
    return content;
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: 0.3,
        delay: animationDelay,
        ease: [0.4, 0, 0.2, 1],
      }}
    >
      {content}
    </motion.div>
  );
}

interface TerminalOutputProps {
  /** Output content */
  children: React.ReactNode;
  /** CSS class for the container */
  className?: string;
  /** Output type for styling */
  type?: "default" | "success" | "error" | "warning" | "info";
}

export function TerminalOutput({
  children,
  className,
  type = "default",
}: TerminalOutputProps) {
  const typeStyles = {
    default: "text-terminal-text",
    success: "text-terminal-green",
    error: "text-red-400",
    warning: "text-terminal-amber",
    info: "text-blue-400",
  };

  return (
    <div
      className={cn(
        "font-mono pl-6 text-sm opacity-80",
        typeStyles[type],
        className
      )}
    >
      {children}
    </div>
  );
}

interface TerminalBlockProps {
  /** Title for the block */
  title?: string;
  /** Block content */
  children: React.ReactNode;
  /** CSS class for the container */
  className?: string;
}

export function TerminalBlock({
  title,
  children,
  className,
}: TerminalBlockProps) {
  return (
    <div
      className={cn(
        "rounded-lg bg-terminal-bg/80 border border-terminal-border shadow-sm p-4 font-mono",
        className
      )}
    >
      {title && (
        <div className="mb-3 text-xs uppercase tracking-wider text-terminal-green font-semibold">
          {title}
        </div>
      )}
      <div className="text-terminal-text">{children}</div>
    </div>
  );
}

