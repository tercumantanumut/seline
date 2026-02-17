# Tool Result History No-Truncation Resolution Plan

## Status
Planning only. No implementation in this document.

## Problem Statement
Current backend behavior can truncate tool results before they become canonical session history. This creates mismatches such as:
- Tool call markers remaining while full result payload is missing or reduced.
- Agents re-reading files or re-running tools because prior result detail is no longer present.
- Provider/backend cache value being reduced due to unnecessary repeated tool calls.
- Backend/frontend history drift when transport-safe truncation is confused with canonical persistence.

## Confirmed Current Truncation Surfaces
1. Canonical tool-result normalization applies truncation:
- `lib/ai/tool-result-utils.ts`
- `normalizeToolResultOutput()` calls `limitToolOutput()` for most tools.

2. Final assistant message persistence stores normalized (possibly truncated) outputs:
- `app/api/chat/route.ts` in `recordToolResultChunk()`
- `app/api/chat/route.ts` in `onFinish`/`onAbort` tool-result assembly

3. Progress stream truncation for SSE payload safety:
- `lib/background-tasks/progress-content-limiter.ts`
- Emits warning with text equivalent to truncating tool-result parts.

4. Truncated-content fallback is ephemeral:
- `lib/ai/truncated-content-store.ts` (in-memory, TTL-bound)
- Not durable canonical history.

## Resolution Goals
1. Never truncate or remove canonical tool results in backend history.
2. Keep tool-call/tool-result pairing complete and stable.
3. Ensure frontend and backend represent the same logical history.
4. Restrict truncation to transport/model-input projections only (never canonical storage).
5. Keep compaction as the only intentional long-horizon history reduction mechanism.
6. Preserve provider-agnostic behavior (same policy for all providers).

## Non-Goals
1. No change to product-level choice of when to compact sessions.
2. No change to MCP ephemeral policy unless separately requested.
3. No immediate historical backfill in this first rollout (define separately).

## Target Architecture
## A. Canonical vs Projection Split
Introduce an explicit contract:
- Canonical history: full, durable, lossless tool outputs.
- Projection history: derived representation for model send and/or SSE transport.

Canonical data must never be mutated by token-limiting utilities.

## B. Storage Rule
When persisting assistant/tool messages:
- Persist raw tool output as the canonical `tool-result.result`.
- Do not run `limitToolOutput()` in canonical persistence path.

## C. Model Input Rule
When building model-bound messages:
- Apply provider/context shaping at send-time only.
- If size controls are needed, use deterministic summaries in projection layer.
- Keep stable traceability markers so projected summaries reference canonical result IDs.

## D. Streaming/SSE Rule
Keep `progress-content-limiter` but make it explicitly display/transport-only:
- Must never feed back into canonical message writes.
- Add metadata flags clarifying limited preview vs canonical full result.

## E. Compaction Rule
Compaction may summarize older turns for context-window control, but must:
- Preserve call/result linkage and key identifiers.
- Never create a state where call exists and canonical result is null/missing due to auto-truncation.

## Phased Plan
## Phase 1: Invariant Definition + Guards
1. Define invariants in code comments/docs:
- `canonical_tool_result_is_lossless`
- `transport_truncation_must_not_mutate_canonical_history`

2. Add runtime assertions/logging when any canonical write includes truncation markers (`truncated`, `truncatedContentId`, truncation banners).

3. Add observability counters:
- canonical writes with truncation marker (target: zero)
- tool-result missing rate
- tool refetch rate due to missing outputs

## Phase 2: Pipeline Separation
1. Split normalization paths into two modes:
- canonical persistence normalization (schema/type cleanup only, no output limiting)
- model/transport projection normalization (allowed to summarize/limit)

2. Update all persistence entry points in `app/api/chat/route.ts` and `lib/messages/tool-enhancement.ts` to canonical mode.

3. Keep projection limiting in send-time extraction path only.

## Phase 3: Sync Integrity
1. Ensure DB -> UI conversion always hydrates from canonical results first.
2. Ensure no null replacement occurs where canonical result exists.
3. Ensure refetch logic is only used when canonical result truly does not exist, not because projected payload was limited.

## Phase 4: Compaction Alignment
1. Validate compaction consumes canonical history but produces separate summary state.
2. Ensure compaction does not introduce orphan tool-calls or orphan tool-results.
3. Ensure compaction summaries preserve pointers needed for continuity (tool name, call IDs, log IDs where relevant).

## Phase 5: Rollout Safety
1. Add feature flag for no-truncation canonical mode.
2. Shadow metrics period: compare old vs new path in logs/telemetry.
3. Gradual rollout and removal of old truncating canonical path after stability window.

## Data/Compatibility Considerations
1. Existing truncated historical messages remain readable; mark as legacy-truncated when detected.
2. Optional backfill can be considered later only where durable source exists (for example command logs with `logId`).
3. Do not rely on `truncated-content-store` for canonical continuity since it is in-memory and TTL-based.

## Test Plan (Required Before Merge)
1. Unit tests
- Canonical persistence path never applies `limitToolOutput()`.
- Projection path may apply limits without mutating canonical objects.

2. Integration tests
- Long tool result round-trip: call -> persisted full result -> next turn consumes without rerun.
- Frontend refresh/reload: tool results remain present and paired.
- SSE oversized progress still truncates display payload while DB keeps full result.

3. Regression tests
- No increase in orphan tool calls/results.
- Reduced refetch/re-execution frequency in long sessions.

## Acceptance Criteria
1. Canonical message history contains full tool results with no automatic truncation markers added by persistence pipeline.
2. Agent can continue in very long sessions without re-reading due to missing prior tool content.
3. Frontend and backend stay in sync for tool-result existence and pairing.
4. Transport safety warnings may still appear for SSE/model projection, but canonical history remains lossless.
5. Compaction remains the only intentional history-reduction mechanism.

## Suggested Work Items by File (Implementation Map)
1. `lib/ai/tool-result-utils.ts`
- Introduce explicit mode separation (canonical vs projection).

2. `app/api/chat/route.ts`
- Persistence writes use canonical mode.
- Model send/extract path uses projection mode.

3. `lib/messages/tool-enhancement.ts`
- Persisted fallback/refetch outputs must use canonical mode.

4. `lib/background-tasks/progress-content-limiter.ts`
- Keep as transport-only limiter; strengthen metadata to avoid history confusion.

5. `lib/messages/converter.ts` and related hydrators
- Prefer canonical DB tool results; never downgrade existing canonical result to null-like placeholders.

6. `components/assistant-ui/context-window-indicator.tsx` and `components/assistant-ui/thread.tsx`
- Keep context threshold visibility always on once status data exists.
- Replace shorthand threshold text (for example `W75% C90% H95%`) with explicit labels and tooltip explanation.

## Risks and Mitigations
1. Risk: DB growth from full outputs.
- Mitigation: enforce compaction and optional archival strategy, not destructive truncation.

2. Risk: model context overflow if projection path misses limiting.
- Mitigation: keep projection limits and pre-flight context checks unchanged.

3. Risk: rollout regressions in message ordering/hydration.
- Mitigation: add ordering + hydration integration tests before enabling flag globally.
