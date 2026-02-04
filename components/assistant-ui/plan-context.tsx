"use client";

import { createContext, useContext, useState, type FC, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// Types (mirrored from server-side PlanState — keep in sync)
// ---------------------------------------------------------------------------

export interface PlanStep {
  id: string;
  text: string;
  status: "pending" | "in_progress" | "completed" | "canceled";
}

export interface PlanState {
  version: number;
  steps: PlanStep[];
  explanation?: string;
  updatedAt?: string;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface PlanContextValue {
  plan: PlanState | null;
  setPlan: (plan: PlanState | null) => void;
}

const PlanContext = createContext<PlanContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface PlanProviderProps {
  children: ReactNode;
  /** Initial plan loaded from session metadata on page load. */
  initialPlan?: PlanState | null;
}

export const PlanProvider: FC<PlanProviderProps> = ({ children, initialPlan = null }) => {
  const [plan, setPlan] = useState<PlanState | null>(initialPlan);

  return (
    <PlanContext.Provider value={{ plan, setPlan }}>
      {children}
    </PlanContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Use inside a PlanProvider. Throws if provider is missing. */
export function usePlanContext(): PlanContextValue {
  const ctx = useContext(PlanContext);
  if (!ctx) {
    throw new Error("usePlanContext must be used within a <PlanProvider>");
  }
  return ctx;
}

/** Safe variant — returns null when no provider is present. */
export function useOptionalPlan(): PlanContextValue | null {
  return useContext(PlanContext);
}
