"use client";

import type { FC } from "react";
import { useState, useEffect, useRef, memo, useMemo, useCallback } from "react";
import ShikiHighlighter, { type ShikiHighlighterProps } from "react-shiki";
import type { SyntaxHighlighterProps as AUIProps } from "@assistant-ui/react-markdown";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme/theme-provider";
import { getGenerativeUISpecFromResult } from "@/lib/ai/generative-ui/payload";
import { OpenJsonUIRenderer } from "./open-json-ui-renderer";

/**
 * Props for the SyntaxHighlighter component
 */
export type HighlighterProps = Omit<
  ShikiHighlighterProps,
  "children" | "theme"
> & {
  theme?: ShikiHighlighterProps["theme"];
} & Pick<AUIProps, "node" | "components" | "language" | "code">;

// Base styles for code blocks
const baseCodeStyles =
  "overflow-x-auto rounded-lg p-4 text-sm font-mono whitespace-pre";

function extractJsonCodeFence(rawCode: string): string {
  const trimmed = rawCode.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (match) {
    return match[1].trim();
  }
  return trimmed;
}

// Minimum code length for syntax highlighting (skip tiny snippets)
const MIN_HIGHLIGHT_LENGTH = 100;

interface StreamingHighlighterProps extends HighlighterProps {
  bgClass: string;
  textClass: string;
}

/**
 * StreamingCodeHighlighter - Fully optimized for zero-freeze streaming
 *
 * Strategy:
 * 1. Plain text: 0ms render, always visible/laid out
 * 2. Shiki: Mounts ONLY after 800ms stable code + idle time
 * 3. Overlay swap: No layout shifts/artifacts
 * 4. Skips tiny code blocks (<100 chars)
 */
const StreamingCodeHighlighter: FC<StreamingHighlighterProps> = memo(
  ({
    code,
    language,
    theme = "github-dark",
    className,
    addDefaultStyles = false,
    showLanguage = false,
    bgClass,
    textClass,
    node: _node,
    components: _components,
    ...props
  }) => {
    const [shikiReady, setShikiReady] = useState(false);
    const [shouldRenderShiki, setShouldRenderShiki] = useState(false);
    const shikiContainerRef = useRef<HTMLDivElement>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const debounceRef = useRef<any>(null);
    const idleCallbackRef = useRef<number | null>(null);
    const lastCodeRef = useRef(code);

    const trimmedCode = useMemo(() => code.trim(), [code]);
    const skipHighlighting = trimmedCode.length < MIN_HIGHLIGHT_LENGTH;

    // Optional assistant JSON uiSpec parser: if assistant text emits a JSON code block
    // containing a valid Open-JSON-UI spec, render visual UI directly.
    const maybeParsedJsonSpec = useMemo(() => {
      const normalizedLanguage = (language || "").toLowerCase();
      if (normalizedLanguage !== "json") return undefined;

      const candidate = extractJsonCodeFence(code);
      if (!candidate) return undefined;

      try {
        const parsed = JSON.parse(candidate);
        const extracted = getGenerativeUISpecFromResult(parsed);
        if (extracted.spec) {
          return {
            spec: extracted.spec,
            meta: extracted.meta,
          };
        }
      } catch {
        // Keep normal code rendering when JSON parse fails.
      }

      return undefined;
    }, [code, language]);

    if (maybeParsedJsonSpec) {
      return (
        <div className={cn("my-1", className)}>
          <OpenJsonUIRenderer
            toolName="assistant-json"
            spec={maybeParsedJsonSpec.spec}
            meta={maybeParsedJsonSpec.meta}
          />
        </div>
      );
    }

    // Check if Shiki has rendered content - stable callback
    const checkRendered = useCallback((): boolean => {
      const container = shikiContainerRef.current;
      const preElement = container?.querySelector("pre");
      if (preElement?.textContent && preElement.textContent.length > 0) {
        requestAnimationFrame(() => setShikiReady(true));
        return true;
      }
      return false;
    }, []);

    // Aggressive debounce: 800ms stable before mounting Shiki
    useEffect(() => {
      lastCodeRef.current = trimmedCode;

      // Clear pending timers
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      if (idleCallbackRef.current && "cancelIdleCallback" in window) {
        cancelIdleCallback(idleCallbackRef.current);
        idleCallbackRef.current = null;
      }

      // Reset on code change
      setShikiReady(false);
      setShouldRenderShiki(false);

      // Skip highlighting for tiny blocks
      if (skipHighlighting) return;

      // Schedule mount with requestIdleCallback for idle-first scheduling
      const scheduleMount = () => {
        if (typeof requestIdleCallback !== "undefined") {
          idleCallbackRef.current = requestIdleCallback(
            () => {
              if (lastCodeRef.current === trimmedCode) {
                setShouldRenderShiki(true);
              }
            },
            { timeout: 800 }
          );
        } else {
          // Fallback for browsers without requestIdleCallback
          debounceRef.current = setTimeout(() => {
            if (lastCodeRef.current === trimmedCode) {
              setShouldRenderShiki(true);
            }
          }, 800);
        }
      };

      // Initial debounce before even trying to schedule
      debounceRef.current = setTimeout(scheduleMount, 800);

      return () => {
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
        }
        if (idleCallbackRef.current && "cancelIdleCallback" in window) {
          cancelIdleCallback(idleCallbackRef.current);
        }
      };
    }, [trimmedCode, skipHighlighting]);

    // MutationObserver: Detect Shiki content ready
    useEffect(() => {
      if (!shouldRenderShiki || !shikiContainerRef.current || skipHighlighting) {
        return;
      }

      // Check immediately in case Shiki rendered synchronously
      if (checkRendered()) return;

      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
            if (checkRendered()) {
              observer.disconnect();
              break;
            }
          }
        }
      });

      observer.observe(shikiContainerRef.current, {
        childList: true,
        subtree: true,
        characterData: true,
      });

      // Extended fallback timeout
      const fallbackTimer = setTimeout(() => {
        checkRendered();
        observer.disconnect();
      }, 1000);

      return () => {
        observer.disconnect();
        clearTimeout(fallbackTimer);
      };
    }, [shouldRenderShiki, skipHighlighting, checkRendered]);

    // Simple conditional: show plain code OR Shiki, not both
    if (shikiReady && shouldRenderShiki && !skipHighlighting) {
      // Shiki is ready - show highlighted code
      return (
        <div
          ref={shikiContainerRef}
          className={cn(
            "aui-shiki-base",
            "[&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:p-4 [&_pre]:text-sm",
            `[&_pre]:${bgClass}`,
            className
          )}
        >
          <ShikiHighlighter
            {...props}
            language={language ?? "plaintext"}
            theme={theme}
            addDefaultStyles={addDefaultStyles}
            showLanguage={showLanguage}
            delay={400}
          >
            {trimmedCode}
          </ShikiHighlighter>
        </div>
      );
    }

    // Plain code fallback (during streaming or while Shiki loads)
    return (
      <>
        <pre
          className={cn(baseCodeStyles, bgClass, textClass, className)}
        >
          <code>{trimmedCode}</code>
        </pre>

        {/* Hidden Shiki container for pre-rendering */}
        {shouldRenderShiki && !skipHighlighting && (
          <div
            ref={shikiContainerRef}
            className="sr-only"
            aria-hidden="true"
          >
            <ShikiHighlighter
              {...props}
              language={language ?? "plaintext"}
              theme={theme}
              addDefaultStyles={addDefaultStyles}
              showLanguage={showLanguage}
              delay={400}
            >
              {trimmedCode}
            </ShikiHighlighter>
          </div>
        )}
      </>
    );
  }
);
StreamingCodeHighlighter.displayName = "StreamingCodeHighlighter";

/**
 * SyntaxHighlighter component using react-shiki with streaming optimization
 * Provides syntax highlighting for code blocks in assistant messages
 * Uses dark terminal background with light text
 */
export const SyntaxHighlighter: FC<HighlighterProps> = (props) => (
  <SyntaxHighlighterInner {...props} />
);
SyntaxHighlighter.displayName = "SyntaxHighlighter";

const SyntaxHighlighterInner: FC<HighlighterProps> = (props) => {
  const { resolvedTheme } = useTheme();
  const shikiTheme = resolvedTheme === "dark" ? "github-light" : "github-dark";

  return (
    <StreamingCodeHighlighter
      {...props}
      theme={props.theme ?? shikiTheme}
      bgClass="bg-terminal-dark"
      textClass="text-terminal-cream"
    />
  );
};
SyntaxHighlighterInner.displayName = "SyntaxHighlighterInner";

/**
 * UserSyntaxHighlighter - For user messages (dark background)
 * Uses a lighter semi-transparent background with light text
 */
export const UserSyntaxHighlighter: FC<HighlighterProps> = (props) => (
  <UserSyntaxHighlighterInner {...props} />
);
UserSyntaxHighlighter.displayName = "UserSyntaxHighlighter";

const UserSyntaxHighlighterInner: FC<HighlighterProps> = (props) => {
  const { resolvedTheme } = useTheme();
  const shikiTheme = resolvedTheme === "dark" ? "github-light" : "github-dark";

  return (
    <StreamingCodeHighlighter
      {...props}
      theme={props.theme ?? shikiTheme}
      bgClass="bg-terminal-cream/10"
      textClass="text-terminal-cream"
    />
  );
};
UserSyntaxHighlighterInner.displayName = "UserSyntaxHighlighterInner";
