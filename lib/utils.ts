import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Estimate token count for a message (rough approximation)
 * Uses ~4 characters per token as a reasonable estimate for English text
 */
export function estimateMessageTokens(message: { content: unknown }): number {
  const content = message.content;

  if (typeof content === "string") {
    return Math.ceil(content.length / 4);
  }

  if (Array.isArray(content)) {
    return content.reduce((total, part) => {
      if (typeof part === "string") {
        return total + Math.ceil(part.length / 4);
      }
      if (part && typeof part === "object") {
        const typedPart = part as { text?: unknown };
        if (typeof typedPart.text === "string") {
          return total + Math.ceil(typedPart.text.length / 4);
        }
        try {
          return total + Math.ceil(JSON.stringify(part).length / 4);
        } catch {
          return total + 10;
        }
      }
      return total + 10; // Default estimate for other content types
    }, 0);
  }

  // For objects, stringify and estimate
  if (content && typeof content === "object") {
    return Math.ceil(JSON.stringify(content).length / 4);
  }

  return 10; // Default minimum
}

/**
 * Helper to extract initials from a character name
 */
export function getCharacterInitials(name: string): string {
  if (!name) return "??";
  const words = name.trim().split(/\s+/);
  if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase();
  }
  return (words[0][0] + (words[words.length - 1][0] || "")).toUpperCase();
}
