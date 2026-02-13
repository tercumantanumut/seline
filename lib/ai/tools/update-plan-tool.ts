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
    text?: string;
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

/** Compute which step IDs changed between old and new plan steps */
function computeChangedStepIds(oldSteps: PlanStep[], newSteps: PlanStep[]): string[] {
  const oldMap = new Map(oldSteps.map((s) => [s.id, s]));
  const changed: string[] = [];
  for (const step of newSteps) {
    const old = oldMap.get(step.id);
    if (!old || old.text !== step.text || old.status !== step.status) {
      changed.push(step.id);
    }
  }
  return changed;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a list of steps: enforce constraints, generate missing ids,
 * clamp at most one in_progress. Returns the normalized steps and any warnings.
 *
 * DEFENSIVE: Handles undefined/null/non-array `steps` gracefully — LLMs
 * occasionally emit malformed tool-call arguments.
 */
function normalizeSteps(
  steps: Array<{ id?: string; text?: string; status?: string }>,
  baseIndex = 0
): { steps: PlanStep[]; warnings: string[] } {
  const warnings: string[] = [];

  // --- Guard against undefined/null/non-array steps (LLM malformed args) ---
  if (!Array.isArray(steps) || steps.length === 0) {
    return { steps: [], warnings: ["Steps array was empty or invalid."] };
  }

  // --- Filter out malformed step objects ---
  // Steps must have text OR an id (merge-mode status-only updates have text
  // filled in by mergeSteps before reaching here).
  const validSteps = steps.filter((step) => {
    if (!step || typeof step !== "object") return false;
    const hasText = typeof step.text === "string" && step.text.trim().length > 0;
    if (!hasText) return false;
    return true;
  });

  if (validSteps.length < steps.length) {
    warnings.push(`${steps.length - validSteps.length} malformed step(s) were filtered out.`);
  }

  if (validSteps.length === 0) {
    return { steps: [], warnings: [...warnings, "No valid steps remaining after filtering."] };
  }

  // --- truncate to MAX_STEPS ---
  let stepsToProcess = validSteps;
  if (stepsToProcess.length > MAX_STEPS) {
    warnings.push(`Plan truncated to ${MAX_STEPS} steps (${stepsToProcess.length} provided).`);
    stepsToProcess = stepsToProcess.slice(0, MAX_STEPS);
  }

  let inProgressSeen = false;

  const normalized: PlanStep[] = stepsToProcess.map((step, i) => {
    // Truncate text (text is guaranteed non-empty by filter above)
    let text = step.text!;
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
  incoming: Array<{ id?: string; text?: string; status?: string }>
): { steps: Array<{ id?: string; text?: string; status?: string }>; warnings: string[] } {
  const warnings: string[] = [];

  // Guard: if incoming is not a valid array, just return existing steps unchanged
  if (!Array.isArray(incoming) || incoming.length === 0) {
    warnings.push("Merge called with empty or invalid incoming steps; keeping existing plan.");
    return { steps: [...(existing || [])], warnings };
  }

  // Typed as the loose intermediate shape — normalizeSteps tightens types after merge
  const result: Array<{ id?: string; text?: string; status?: string }> = [...(existing || [])];
  const matchedIndices = new Set<number>(); // which existing steps were updated

  for (const inc of incoming) {
    // Skip malformed entries — must have at least an id or text
    if (!inc || typeof inc !== "object") continue;
    if (!inc.id && typeof inc.text !== "string") continue;

    // Try match by id first
    let matchIdx = inc.id ? result.findIndex((s, i) => !matchedIndices.has(i) && s.id === inc.id) : -1;

    // Fall back to exact text match (only when text is provided)
    if (matchIdx === -1 && typeof inc.text === "string") {
      matchIdx = result.findIndex((s, i) => !matchedIndices.has(i) && s.text === inc.text);
    }

    if (matchIdx !== -1) {
      // Update matched step — preserve existing text when incoming text is omitted
      matchedIndices.add(matchIdx);
      result[matchIdx] = {
        id: result[matchIdx].id,
        text: inc.text ?? result[matchIdx].text,
        status: inc.status ?? result[matchIdx].status,
      };
    } else {
      // Append new step — requires text
      if (!inc.text) {
        warnings.push(`Step with id "${inc.id}" not found in existing plan and has no text — skipped.`);
        continue;
      }
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
- No plan yet? Call with steps and text for each — a plan card appears immediately.
- Plan exists? Use mode="merge" with just step id + new status. Text is optional in merge mode — existing text is preserved.
- Redo entirely? Use mode="replace" with new steps (text required for each).

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
                description: "One-sentence step description (max 120 chars). Required for new steps. Optional in merge mode when updating by id — existing text is preserved.",
              },
              status: {
                type: "string",
                enum: ["pending", "in_progress", "completed", "canceled"],
                description: 'Step status. Default: "pending". At most one step may be "in_progress" at a time — extras are auto-downgraded to "pending".',
              },
            },
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

    execute: async (rawInput: UpdatePlanInput) => {
      try {
        // Destructure with safe defaults — LLMs sometimes send malformed args
        const {
          steps = [],
          explanation,
          mode = "replace",
        } = (rawInput && typeof rawInput === "object" ? rawInput : {}) as UpdatePlanInput;

        if (sessionId === "UNSCOPED") {
          return { status: "error" as const, error: "updatePlan requires an active session." };
        }

        // Validate steps is actually an array (LLM may send string, object, etc.)
        const safeSteps = Array.isArray(steps) ? steps : [];
        if (safeSteps.length === 0 && mode !== "merge") {
          return {
            status: "error" as const,
            error: "No valid steps provided. The `steps` parameter must be a non-empty array of objects with a `text` field.",
          };
        }

        // In replace mode, every step must have text (text is only optional in merge mode)
        if (mode !== "merge") {
          const textlessCount = safeSteps.filter(
            (s) => !s.text || (typeof s.text === "string" && s.text.trim().length === 0)
          ).length;
          if (textlessCount > 0) {
            return {
              status: "error" as const,
              error: `In replace mode, every step must have a "text" field. ${textlessCount} step(s) are missing text.`,
            };
          }
        }

        // 1. Read current plan from session metadata
        const session = await getSession(sessionId);
        const metadata = (session?.metadata || {}) as Record<string, unknown>;
        const currentPlan = (metadata.plan as PlanState | undefined) ?? { version: 0, steps: [] as PlanStep[] };

        // 2. Resolve steps based on mode
        let resolvedSteps: Array<{ id?: string; text?: string; status?: string }>;
        const mergeWarnings: string[] = [];
        const isMergeUpdate = mode === "merge" && Array.isArray(currentPlan.steps) && currentPlan.steps.length > 0;

        if (isMergeUpdate) {
          const merged = mergeSteps(currentPlan.steps, safeSteps);
          resolvedSteps = merged.steps;
          mergeWarnings.push(...merged.warnings);
        } else {
          resolvedSteps = safeSteps;
        }

        // 3. Normalize (truncation, id generation, single in_progress)
        const { steps: normalizedSteps, warnings: normalizeWarnings } = normalizeSteps(resolvedSteps);
        const allWarnings = [...mergeWarnings, ...normalizeWarnings];

        // If normalization filtered out everything, return an error instead of saving empty plan
        if (normalizedSteps.length === 0) {
          return {
            status: "error" as const,
            error: "All steps were invalid or empty after validation. Each step must have a non-empty `text` field.",
            warnings: allWarnings,
          };
        }

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

        // 6. Return — compact result for merge updates, full plan for replace/creation
        if (isMergeUpdate) {
          const changedStepIds = computeChangedStepIds(currentPlan.steps, normalizedSteps);
          return {
            status: "success" as const,
            version: newPlan.version,
            stepCount: newPlan.steps.length,
            updatedStepIds: changedStepIds,
            warnings: allWarnings.length > 0 ? allWarnings : undefined,
          };
        }
        return {
          status: "success" as const,
          plan: newPlan,
          warnings: allWarnings.length > 0 ? allWarnings : undefined,
        };
      } catch (error) {
        // CRITICAL: Never let tool execution crash the stream.
        // Return a structured error so the LLM can recover and the UI stays intact.
        console.error("[updatePlan] Unexpected error during execution:", error);
        return {
          status: "error" as const,
          error: `Plan update failed: ${error instanceof Error ? error.message : "Unknown error"}. Please retry with a valid steps array.`,
        };
      }
    },
  });
}
