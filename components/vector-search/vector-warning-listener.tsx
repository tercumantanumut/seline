"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

const VECTOR_DIMENSION_PATTERNS = [
  /No vector column found.*dimension/i,
  /embedding.*mismatch/i,
  /dimension.*mismatch/i,
  /different dimensions/i,
  /vector dimension/i,
];

/**
 * Listens for runtime vector issues and nudges users with plain-language recovery guidance.
 */
export function VectorWarningListener() {
  const lastToastAtRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // In Electron builds, keep using native critical log events.
    if (window.electronAPI?.logs) {
      const electron = window.electronAPI;
      electron.logs.subscribe();
      electron.logs.onCritical((data: { type: string; message: string }) => {
        if (data.type === "dimension_mismatch") {
          if (Date.now() - lastToastAtRef.current < 30_000) {
            return;
          }
          lastToastAtRef.current = Date.now();
          toast.warning(
            "Search index mismatch detected. If results seem off, refresh synced folders in Agent Settings.",
            { duration: 9000 }
          );
        }
      });

      return () => {
        electron.logs.unsubscribe();
        electron.logs.removeListeners();
      };
    }

    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      originalError(...args);

      const message = args
        .map((arg) => {
          if (typeof arg === "string") return arg;
          if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
          try {
            return JSON.stringify(arg);
          } catch {
            return String(arg);
          }
        })
        .join(" ");

      if (VECTOR_DIMENSION_PATTERNS.some((pattern) => pattern.test(message))) {
        if (Date.now() - lastToastAtRef.current < 30_000) {
          return;
        }
        lastToastAtRef.current = Date.now();
        toast.warning(
          "Search index mismatch detected. If results seem off, refresh synced folders in Agent Settings.",
          { duration: 9000 }
        );
      }
    };

    return () => {
      console.error = originalError;
    };
  }, []);

  return null;
}
