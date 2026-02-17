# Skills Runtime Unification Plan (RunSkill + UpdateSkill Only)

## Status
Planning only. No implementation in this document.

## Objective
Build a single, coherent skills runtime for agents with a minimal tool surface:
- `runSkill`
- `updateSkill`

This runtime must:
1. Execute both DB skills and plugin skills through one unified path.
2. Return full skill content to the agent through `runSkill` (no silent truncation).
3. Support patch-style iterative skill updates (line-based/diff-based), not full rewrites.
4. Keep tool-first behavior explicit for agents while still supporting standard skill management flows.
5. Reduce context/tool bloat by consolidating skill operations into these two tools.

## Research Findings (Current State)
1. Agent DB skills and plugin skills are split:
- `listSkills` and `runSkill` currently operate on DB skills only.
- Plugin skills are discovered via prompt summary (`getPluginSkillsForPrompt`) and not truly unified with `runSkill`.
- References:
  - `lib/ai/tools/list-skills-tool.ts`
  - `lib/ai/tools/run-skill-tool.ts`
  - `lib/plugins/skill-loader.ts`
  - `app/api/chat/route.ts` (plugin skills summary injection)

2. Prompt bloat source:
- Plugin skills are appended as full command list lines in system prompt.
- Reference: `lib/plugins/skill-loader.ts`

3. Update model is coarse-grained:
- `updateSkill` updates full fields (e.g., full `promptTemplate`) with versioning, but not patch workflows.
- Reference: `lib/ai/tools/update-skill-tool.ts`, `lib/skills/queries.ts`

4. Patch-capable patterns already exist in filesystem tools:
- Fuzzy patch/edit, dry-run, diagnostics, line-numbered diffs.
- References:
  - `lib/ai/tools/edit-file-tool.ts`
  - `lib/ai/tools/patch-file-tool.ts`
  - `lib/ai/filesystem/diff-utils.ts`

5. Plugin skill persistence constraint:
- Plugin skill content is in `plugins.components` JSON.
- `plugin_files` stores metadata only (no content), so plugin file patching cannot rely on DB file content today.
- References:
  - `lib/db/sqlite-plugins-schema.ts`
  - `lib/plugins/registry.ts`

## Non-Negotiable Requirements
1. `runSkill` must deliver full skill content to agent runtime (no silent truncation markers for skill payloads).
2. Skill editing must be iterative and patch-first with line-oriented outputs.
3. Runtime should be minimal: two skill tools only for agent-facing operation (`runSkill`, `updateSkill`).
4. Tool-first skill usage must be explicit in agent guidance.
5. Standard skill management remains supported, but agent runtime actions should still route through the two tools.

## Target Runtime Architecture
## A. Unified Skill Catalog Service (Internal)
Create internal `SkillCatalogService` used by both tools.

Providers:
1. DB skill provider (`skills` table).
2. Plugin skill provider (agent-scoped enabled plugins + workflow-shared plugin scope).

Canonical runtime descriptor:
- `canonicalId`: `db:<skillId>` or `plugin:<pluginId>:<namespacedName>`
- `source`: `db` | `plugin`
- `name`
- `displayName`
- `description`
- `plugin`: `{ pluginId, pluginName, version }` when source is plugin
- `editable`: boolean
- `modelInvocationAllowed`: boolean (`disableModelInvocation` inverse)
- `versionRef`: DB version or plugin revision token
- `contentLocator`: pointer to full content source

Deterministic dedupe:
- Primary key: `canonicalId`
- Name collisions: resolved by explicit ambiguity errors, never silent pick.

## B. Minimal Toolset Contract
Agent runtime skill operations are consolidated into two tools only.

### 1) `runSkill` (discover + inspect + execute)
`runSkill` gets action-based input:
- `action: "list" | "inspect" | "run"`

Actions:
1. `list`
- Returns compact catalog entries from unified service.
- Supports filters (`source`, `query`, `limit`, `activeOnly`).

2. `inspect`
- Returns full skill content and metadata for a selected skill.
- Must provide line-numbered view (`contentWithLineNumbers`) and raw full content.
- No truncation of skill body.

3. `run`
- Existing behavior retained for DB skills.
- Plugin skill path added via unified resolver.
- Returns full rendered skill prompt/instructions and resolved parameters.
- If `modelInvocationAllowed` is false, returns explicit blocked result with reason.

### 2) `updateSkill` (create + patch + metadata + lifecycle)
`updateSkill` gets action-based input:
- `action: "create" | "patch" | "replace" | "metadata" | "copy" | "archive"`

Actions:
1. `create`
- Creates DB skill records (consolidates former `createSkill` behavior).

2. `patch`
- Primary update mode.
- Inputs:
  - `skillRef` (canonical id)
  - `target` (`promptTemplate` or plugin skill source content)
  - `patchFormat` (`unifiedDiff` or structured edits)
  - `expectedVersionRef` (optimistic concurrency)
  - `dryRun` optional
- Outputs:
  - apply status,
  - line-numbered before/after diff,
  - warnings and diagnostics.

3. `replace`
- Full replacement when patch is intentionally not used.

4. `metadata`
- Update description, triggers, category, tool hints, status.

5. `copy`
- Consolidates former `copySkill`.

6. `archive`
- Soft archive/deactivate.

Versioning:
- DB skills keep existing version snapshots.
- Plugin skill updates require plugin-side revisioning support (see Section D).

## C. Tool Consolidation Strategy
Deprecate agent-facing use of:
- `listSkills`
- `createSkill`
- `copySkill`

These operations become `runSkill`/`updateSkill` actions.
The runtime prompt/instructions should reference only `runSkill` and `updateSkill` for skills.

## D. Plugin Skill Editability Model
To patch plugin skills safely, plugin content must be edit-addressable with revision control.

Required additions:
1. Persist editable plugin skill source with revision tokens.
2. Provide stable lookup by `pluginId + namespacedName`.
3. Record edit history for plugin skill updates.

Implementation direction:
1. Add `plugin_skill_revisions` (or equivalent) table:
- `pluginId`
- `namespacedName`
- `content`
- `version`
- `changeReason`
- `createdAt`

2. On import, seed current plugin skill content into revision store.
3. `updateSkill action="patch"` for plugin skills updates revision store and refreshes runtime component projection.

This avoids rewriting whole plugin manifests and enables iterative line-based edits.

## E. No-Truncation Guarantee for RunSkill Payloads
Guarantee: when `runSkill` returns skill content or rendered prompt, content is not silently truncated.

Required policy changes:
1. Exempt `runSkill` skill-content payloads from projection limiter paths.
2. Ensure progress projection does not replace/clip runSkill skill bodies.
3. If payload is extremely large, use explicit chunked retrieval protocol (multi-part), not truncation.

Allowed behavior:
- Explicit pagination/chunking with complete reconstruction.

Disallowed behavior:
- Silent clipping + marker-only output for skill body.

## F. Agent Guidance Policy (Tool-First, Standard-Compatible)
Prompt guidance must state:
1. Use `runSkill` first for discovery/inspect/execute.
2. Use `updateSkill` for any skill modifications via patch.
3. Do not rewrite whole skill content when patching can be used.
4. Standard/manual management exists, but agent runtime actions should still go through these two tools.

Prompt bloat reduction:
1. Remove plugin skill line dump from system prompt.
2. Keep only minimal instruction: skills are available via `runSkill` and editable via `updateSkill`.
3. Discovery happens by tool call, not by static prompt payload.

## Implementation Plan (Phased)
## Phase 1: Unified Catalog Backbone
1. Add internal `SkillCatalogService`.
2. Merge DB + plugin skill entries into canonical descriptors.
3. Add deterministic resolution and ambiguity handling.

## Phase 2: RunSkill Unification
1. Convert `runSkill` to action-based contract (`list`/`inspect`/`run`).
2. Integrate plugin skill resolution and execution path.
3. Return full skill content in `inspect`/`run`.
4. Add no-truncation guardrails for runSkill payload handling.

## Phase 3: UpdateSkill Patch Runtime
1. Convert `updateSkill` to action-based patch-first contract.
2. Port filesystem patch semantics (dry-run, fuzzy patch, line-numbered diff, diagnostics) to skill text fields.
3. Keep DB versioning semantics and stale-write prevention.

## Phase 4: Plugin Skill Revision Support
1. Add plugin skill revision persistence.
2. Seed from installed plugin components.
3. Wire `updateSkill.patch` for plugin skills.
4. Ensure plugin runtime projection reflects latest revision.

## Phase 5: Prompt + Tool Surface Cleanup
1. Remove plugin skill dump from system prompt.
2. Keep only `runSkill` + `updateSkill` in skill guidance.
3. De-emphasize and retire separate agent-facing skill tools in registry output.

## Validation Plan
1. Unit tests:
- Catalog merge/dedupe and scoped visibility.
- Name/canonicalId resolution with ambiguity paths.
- Patch application engine for DB and plugin skills.
- No-truncation assertions for `runSkill` payload paths.

2. Integration tests:
- Agent can `runSkill list/inspect/run` for DB + plugin skills.
- Plugin assignment scope respected.
- `updateSkill patch` updates DB skills with version increments and diffs.
- `updateSkill patch` updates plugin skill revisions and subsequent `runSkill inspect` sees latest content.

3. Regression tests:
- Prompt token reduction after removing plugin skill dumps.
- No silent runSkill payload truncation markers.
- No duplicate skill entries returned in unified catalog.

## Risks and Mitigations
1. Risk: context overflow from large full skill payloads.
- Mitigation: explicit chunked retrieval protocol for extreme payloads; no silent truncation.

2. Risk: plugin content edit conflicts.
- Mitigation: revision tokens + optimistic concurrency checks.

3. Risk: behavior drift from tool consolidation.
- Mitigation: action contracts with strict schema validation and compatibility test suite.

4. Risk: ambiguous skill names across sources.
- Mitigation: canonical id-first flow, explicit ambiguity errors.

## Acceptance Criteria
1. Agents use only `runSkill` and `updateSkill` for runtime skill operations.
2. `runSkill` supports list/inspect/run for both DB and plugin skills in one path.
3. Skill bodies returned by `runSkill` are complete (no silent truncation).
4. `updateSkill` supports patch-first iterative edits with line-numbered diffs and version checks.
5. Plugin skill edits are revisioned and visible immediately to runtime execution.
6. System prompt no longer dumps full plugin skill catalogs.
