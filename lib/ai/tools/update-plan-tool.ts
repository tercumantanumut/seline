/**
 * Update Plan Tool
 *
 * Creates or updates a visible, stateful task plan for the user.
 * First call creates the plan; subsequent calls update it.
 * Plan persists in sessions.metadata across messages and page refreshes.
 */

import { tool, jsonSchema } from "ai";
import { getSession, updateSession } from "@/lib/db/queries";

// ---------------------------------------------------------------------------
// Types
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
  updatedAt: string;
}

interface UpdatePlanInput {
  steps: Array<{
    id?: string;
    text: string;
    status?: "pending" | "in_progress" | "completed" | "canceled";
  }>;
  explanation?: string;
  mode?: "replace" | "merge";
}

// ---------------------------------------------------------------------------
// Constraints
// ---------------------------------------------------------------------------

const MAX_STEPS = 20;
const MAX_TEXT_LENGTH = 120;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deterministic short hash of a string (djb2 → base36) */
function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // 32-bit
  }
  return Math.abs(hash).toString(36);
}

/** Generate a stable id from text + positional index */
function generateStepId(text: string, index: number): string {
  return `step_${simpleHash(text)}_${index}`;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a list of steps: enforce constraints, generate missing ids,
 * clamp at most one in_progress. Returns the normalized steps and any warnings.
 */
function normalizeSteps(
  steps: Array<{ id?: string; text: string; status?: string }>,
  baseIndex = 0
): { steps: PlanStep[]; warnings: string[] } {
  const warnings: string[] = [];

  // --- truncate to MAX_STEPS ---
  if (steps.length > MAX_STEPS) {
    warnings.push(`Plan truncated to ${MAX_STEPS} steps (${steps.length} provided).`);
    steps = steps.slice(0, MAX_STEPS);
  }

  let inProgressSeen = false;

  const normalized: PlanStep[] = steps.map((step, i) => {
    // Truncate text
    let text = step.text;
    if (text.length > MAX_TEXT_LENGTH) {
      text = text.slice(0, MAX_TEXT_LENGTH - 3) + "...";
      warnings.push(`Step "${text.slice(0, 40)}…" text truncated to ${MAX_TEXT_LENGTH} chars.`);
    }

    // Default status
    let status: PlanStep["status"] = (step.status as PlanStep["status"]) ?? "pending";

    // Enforce single in_progress
    if (status === "in_progress") {
      if (inProgressSeen) {
        status = "pending";
        warnings.push(`Multiple in_progress steps detected; only the first is kept as in_progress.`);
      } else {
        inProgressSeen = true;
      }
    }

    // Generate id if missing
    const id = step.id || generateStepId(text, baseIndex + i);

    return { id, text, status };
  });

  return { steps: normalized, warnings };
}

/**
 * Apply merge mode: update existing steps by id (or exact text), append new ones,
 * preserve unmatched existing steps in original order.
 */
function mergeSteps(
  existing: PlanStep[],
  incoming: Array<{ id?: string; text: string; status?: string }>
): { steps: Array<{ id?: string; text: string; status?: string }>; warnings: string[] } {
  const warnings: string[] = [];
  // Typed as the loose intermediate shape — normalizeSteps tightens types after merge
  const result: Array<{ id?: string; text: string; status?: string }> = [...existing];
  const matchedIndices = new Set<number>(); // which existing steps were updated

  for (const inc of incoming) {
    // Try match by id first
    let matchIdx = inc.id ? result.findIndex((s, i) => !matchedIndices.has(i) && s.id === inc.id) : -1;

    // Fall back to exact text match
    if (matchIdx === -1) {
      matchIdx = result.findIndex((s, i) => !matchedIndices.has(i) && s.text === inc.text);
    }

    if (matchIdx !== -1) {
      // Update matched step (preserve id from existing)
      matchedIndices.add(matchIdx);
      result[matchIdx] = {
        id: result[matchIdx].id,
        text: inc.text,
        status: inc.status ?? result[matchIdx].status,
      };
    } else {
      // Append new step
      result.push({ id: inc.id, text: inc.text, status: inc.status });
    }
  }

  return { steps: result, warnings };
}

// ---------------------------------------------------------------------------
// Tool Factory
// ---------------------------------------------------------------------------

export function createUpdatePlanTool({ sessionId }: { sessionId: string }) {
  return tool({
    description: `Create or update a visible task plan for the user.

**First call creates the plan. Subsequent calls update it.**
- No plan yet? Call with steps — a plan card and sticky panel appear immediately.
- Plan exists? Use mode="merge" to update specific steps by id. Use mode="replace" to redo entirely.

The plan persists across messages and page refreshes.`,

    inputSchema: jsonSchema<UpdatePlanInput>({
      type: "object",
      title: "UpdatePlanInput",
      description: "Input for creating or updating a task plan",
      properties: {
        steps: {
          type: "array",
          description: "Array of plan steps",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Stable step identifier. Omit on first creation — one will be generated and returned. Use the returned id in subsequent merge calls to target this step.",
              },
              text: {
                type: "string",
                description: "One-sentence step description (max 120 chars).",
              },
              status: {
                type: "string",
                enum: ["pending", "in_progress", "completed", "canceled"],
                description: 'Step status. Default: "pending". At most one step may be "in_progress" at a time — extras are auto-downgraded to "pending".',
              },
            },
            required: ["text"],
            additionalProperties: false,
          },
        },
        explanation: {
          type: "string",
          description: "Brief reason for this plan change. Shown in the UI as a note, not as a step.",
        },
        mode: {
          type: "string",
          enum: ["replace", "merge"],
          description: '"replace" (default) — swap entire plan with the provided steps. "merge" — update existing steps matched by id or text, append unrecognised steps, preserve unmentioned steps.',
        },
      },
      required: ["steps"],
      additionalProperties: false,
    }),

    execute: async ({ steps, explanation, mode = "replace" }: UpdatePlanInput) => {
      if (sessionId === "UNSCOPED") {
        return { status: "error" as const, error: "updatePlan requires an active session." };
      }

      // 1. Read current plan from session metadata
      const session = await getSession(sessionId);
      const metadata = (session?.metadata || {}) as Record<string, unknown>;
      const currentPlan = (metadata.plan as PlanState | undefined) ?? { version: 0, steps: [] as PlanStep[] };

      // 2. Resolve steps based on mode
      let resolvedSteps: Array<{ id?: string; text: string; status?: string }>;
      const mergeWarnings: string[] = [];

      if (mode === "merge" && Array.isArray(currentPlan.steps) && currentPlan.steps.length > 0) {
        const merged = mergeSteps(currentPlan.steps, steps);
        resolvedSteps = merged.steps;
        mergeWarnings.push(...merged.warnings);
      } else {
        resolvedSteps = steps;
      }

      // 3. Normalize (truncation, id generation, single in_progress)
      const { steps: normalizedSteps, warnings: normalizeWarnings } = normalizeSteps(resolvedSteps);
      const allWarnings = [...mergeWarnings, ...normalizeWarnings];

      // 4. Build new plan state
      const newVersion = currentPlan.version + 1;
      const newPlan: PlanState = {
        version: newVersion,
        steps: normalizedSteps,
        explanation,
        updatedAt: new Date().toISOString(),
      };

      // 5. Persist to session metadata
      await updateSession(sessionId, {
        metadata: {
          ...metadata,
          plan: newPlan,
        },
      });

      // 6. Return
      return {
        status: "success" as const,
        plan: newPlan,
        warnings: allWarnings,
      };
    },
  });
}
