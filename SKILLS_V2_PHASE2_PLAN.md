# Seline Skills & Agent Discovery — V2 Phase 2 Production Plan

> **Date:** 2026-02-15  
> **Depends on:** `docs/SKILLS_V1_DESIGN_PLAN.md` (V1 baseline)  
> **Planning Mode:** Planning-only (no implementation in this document)  
> **Goal:** Ship all deferred V2 product features (Tracks A-E) with production-safe runtime, UX, and rollout discipline aligned to this codebase.

---

## 1) Problem Statement

The prior rewrite improved production rigor but accidentally dropped core Phase 2 product scope from the original roadmap (Track B skill sharing, Track C gamification-lite, Track D template expansion, Track E visual skill builder).

This corrected plan restores the full product roadmap and adds implementation-ready detail so engineering, QA, and product can execute without ambiguity.

---

## 2) Phase 1 Exit Gate (Must Pass Before Phase 2)

Before any Phase 2 work starts, all V1 foundations must be healthy.

| V1 Deliverable | Validation |
|---|---|
| `skills` schema + CRUD routes | Create/read/update/delete works via `/api/skills` |
| `createSkill` tool in chat | User can save a skill from chat flow |
| `listSkills` tool in chat | User can list skills for current agent |
| `runSkill` tool in chat | User can execute by name/id safely |
| Skills prompt injection | Agent sees skills in system prompt |
| Skill-schedule bridge | Scheduled skill runs execute and record stats |
| Template baseline available | Existing template registry works |
| Default Seline agent bootstrap | First run auto-agent behavior works |
| Skills tab/settings entrypoint | User can access/manage skills UI |
| Template picker/hire flow | User can create from templates |

**Phase 2 block rule:** if any row fails, fix V1 first.

---

## 3) Architecture Constraints (Source of Truth)

This plan must follow existing app mechanics:

- Tool registration lifecycle: `lib/ai/tool-registry/tool-definitions.ts`
- Plan semantics contract: `lib/ai/tools/update-plan-tool.ts`
- Plan panel behavior (sticky + collapsed local storage): `components/assistant-ui/plan-panel.tsx`
- Tool call result UX (compact/success/error): `components/assistant-ui/plan-tool-ui.tsx`

### 3.1 Required Plan Semantics (Do Not Drift)

- `updatePlan` supports `mode: "replace" | "merge"`
- Session plan is persisted under `sessions.metadata.plan`
- Merge updates prioritize `id`; fallback by exact `text` only where applicable
- Warning propagation is first-class (not silent)
- Compact result UX remains supported for success + warning contexts

### 3.2 UX Behavior Constraints

- Plan panel collapse state persists locally and must survive refresh
- Error rendering should match current compact error card style
- Warnings should be visible but non-blocking
- Recovery path must be obvious (retry/refresh/re-run)

---

## 4) Scope, Goals, Non-Goals, Assumptions, Dependencies

### 4.1 Scope (Phase 2)

- Track A: Smarter Skills
- Track B: Skill Sharing Between Agents
- Track C: Agent Gamification Lite
- Track D: Template Expansion
- Track E: Visual Skill Builder (lightweight)
- Cross-cutting: rollout safety, telemetry, QA matrix, compatibility

### 4.2 Goals

- Restore all deferred product capabilities from original Phase 2 roadmap
- Keep implementations simple and shippable by track
- Add production-safe behavior for failure modes and stale/update conflicts
- Provide measurable acceptance criteria and Definition of Done per milestone

### 4.3 Non-Goals

- No multi-agent execution chains in V2
- No public marketplace/community sharing in V2
- No heavy gamification economy (XP, levels, badges)
- No full visual drag-and-drop node editor

### 4.4 Assumptions

- Current chat runtime tool injection stays as integration path
- Session metadata remains canonical for active plan state
- Existing DB migration mechanism remains available for additive changes

### 4.5 Dependencies

- SQLite schema/migration support for additive columns/tables
- Tool registry updates and agent tool enablement UI flow
- Localization updates (`locales/en.json`, `locales/tr.json`)
- Existing scheduler/run history data for stats surfaces

---

## 5) Phase 2 Track Overview (Restored)

| Track | Window | Outcome |
|---|---|---|
| A: Smarter Skills | Week 1-2 | Auto-triggering, better extraction, feedback-based improvement |
| B: Skill Sharing | Week 1-2 | Copy skill across agents + cross-agent skill library |
| C: Gamification Lite | Week 2-3 | Agent cards with stats + lightweight performance dashboard |
| D: Template Expansion | Week 2-3 | More templates, categories, future remote registry prep |
| E: Visual Skill Builder | Week 3-4 | Skill detail/edit UI + optional step flow visualization |

---

## 6) Detailed Track Plans

## Track A — Smarter Skills (Week 1-2)

### A1) Auto-Triggering (Skill Matching)

**Problem:** Users must manually request skill execution.

**Plan:** Improve prompt + skill metadata so the agent can invoke `runSkill` when a request matches a skill.

**Implementation tasks:**
- Add trigger matching guidance to character prompt assembly
- Extend skill prompt formatter to include trigger examples
- Add `trigger_examples` column (JSON text) to skills schema
- Update `createSkill` conversational flow to ask trigger intent examples

**Edge cases:**
- Multiple skills semantically match: ask clarifying question or pick highest-confidence with transparent note
- Low confidence: do not auto-run, ask user confirmation
- Empty/invalid `trigger_examples`: fallback to `description`

**Acceptance criteria (DoD):**
- At least 3 manual prompts auto-trigger the intended skill without explicit "run skill"
- Ambiguous prompts do not silently run wrong skill
- Telemetry records auto-triggered vs manual runs

### A2) Skill Improvement Loop

**Problem:** Skills stay static after creation.

**Plan:** Add an `updateSkill` tool and optional version history support.

**Implementation tasks:**
- New tool: `updateSkill` (`lib/ai/tools/update-skill-tool.ts`)
- Register tool metadata + availability in tool registry
- Add `version` column to skills
- Optional `skill_versions` table for history snapshots
- Post-run prompt pattern: user feedback can patch skill prompt/description/tool hints

**Edge cases:**
- Concurrent updates: reject stale version writes or merge safely with warning
- No-op updates: return success with explicit "no changes"
- Invalid update field keys: structured validation error

**Acceptance criteria (DoD):**
- User feedback in same session can modify skill and increment version
- Next run reflects updated behavior
- Optional history table stores old versions when enabled

### A3) Better Skill Extraction from Chat

**Problem:** Skill extraction misses tool-chain details.

**Plan:** Analyze recent session tool calls to infer reusable pattern.

**Implementation tasks:**
- Add extraction helpers (`lib/skills/extraction.ts`)
- Parse recent messages/tool calls and infer ordered tool hints
- Identify dynamic user variables vs static constants
- Integrate extracted data into `createSkill` flow

**Edge cases:**
- No recent tool calls: fallback extraction path
- Mixed unrelated tasks in recent messages: scope by recency and intent
- Overlong extraction payload: truncate with warning

**Acceptance criteria (DoD):**
- Complex multi-step user workflow yields a usable skill with ordered tool hints
- Extraction confidence warnings shown when uncertain

---

## Track B — Skill Sharing Between Agents (Week 1-2)

### B1) Copy Skill to Another Agent

**Problem:** Skills are isolated per agent.

**Plan:** Implement copy semantics (clone, not linked sync).

**Implementation tasks:**
- Add endpoint: `POST /api/skills/:id/copy`
- Accept target agent (`targetCharacterId` or resolved name)
- Add UI action in skills list: "Copy to..."
- Add agent-callable tool: `copySkill`
- Store provenance fields (`copied_from_skill_id`, `copied_from_character_id`)

**Guardrails:**
- Copy creates independent skill snapshot; no live two-way sync
- Duplicate name collision in target agent resolved by suffix or conflict prompt
- Permission checks prevent copying to agents not owned by user

**Acceptance criteria (DoD):**
- User can copy skill A->B from UI and tool path
- Copied skill runs under target agent with no source mutation
- Provenance fields populated for audit

### B2) Skill Library View (Cross-Agent)

**Problem:** Users cannot browse all skills across agents.

**Plan:** New cross-agent library with filters and copy actions.

**Implementation tasks:**
- Extend skills query endpoint for cross-agent mode (`?all=true`)
- Build library UI (`components/skills/skill-library.tsx`)
- Add filters: agent/category/status
- Add in-list copy affordance and quick run/open actions
- Localize labels and empty/error states

**Edge cases:**
- Large skill count: pagination/virtualization planning
- Agent deleted but skills remain orphaned: show fallback owner label
- Filter + search no-results state should be explicit and friendly

**Acceptance criteria (DoD):**
- User can view and filter all skills across owned agents
- Copy flow can be launched from library view
- Empty, loading, error states are fully localized

---

## Track C — Agent Gamification Lite (Week 2-3)

### C1) Agent Cards with Stats

**Problem:** Agent cards are informationally thin.

**Plan:** Show meaningful activity metrics.

**Implementation tasks:**
- Add endpoint: `GET /api/characters/:id/stats`
- Aggregate: skill count, run count, success rate, last active, active since
- Update agent card UI in picker with compact stat display
- Add locale labels/tooltips

**Edge cases:**
- New agent with no runs: show graceful zero state
- Partial stats query failure: card renders base info + stats warning icon
- Timezone-safe date formatting for active windows

**Acceptance criteria (DoD):**
- Agent picker shows stats with no major layout regressions desktop/mobile
- Metrics are consistent with scheduler/run records

### C2) Lightweight Performance Dashboard

**Problem:** No quick overview of "team activity".

**Plan:** Simple dashboard for agents + recent runs + upcoming runs.

**Implementation tasks:**
- Add dashboard page/panel (`app/dashboard/page.tsx` or equivalent)
- Query recent executions and upcoming scheduled runs
- Add navigation entrypoint from sidebar/picker

**Edge cases:**
- No schedules configured: show clear onboarding CTA
- Delayed run ingestion: display timestamp + data freshness note

**Acceptance criteria (DoD):**
- User can open one page and understand recent and upcoming activity in <10 seconds

---

## Track D — Template Expansion (Week 2-3)

### D1) Expand Template Catalog

**Plan:** Add 7+ new templates using existing template architecture.

**Target templates (initial):**
- Social Media Manager
- Meeting Notes Assistant
- Data Analyst
- Customer Support Agent
- Personal Finance Tracker
- Learning Coach
- Project Manager

**Implementation tasks:**
- Add template files under `lib/characters/templates/`
- Register templates in template map
- Extend template type for `exampleSkills`
- Seed template example skills during `createAgentFromTemplate()`

**Edge cases:**
- Missing tool in user environment: fallback capability note in template
- Skill seeding partial failure: agent still created; surface warnings

**Acceptance criteria (DoD):**
- 8-12 total templates available with valid metadata
- Hiring a template provisions example skills where defined

### D2) Template Categories + Browser Filtering

**Plan:** Add categories and search to prevent picker overload.

**Implementation tasks:**
- Add `category` field to template type
- Add category chips/filters in template browser
- Add search by name/tagline/use case

**Acceptance criteria (DoD):**
- User can narrow from full list to target template in <=3 interactions

### D3) Remote Registry Preparation (Not Activated in V2)

**Plan:** Prep data format and stub endpoint only.

**Implementation tasks:**
- Define template export/import format
- Add remote registry stub endpoint
- Add template version field for future update detection

**Acceptance criteria (DoD):**
- Local templates remain source of truth in V2
- Remote prep artifacts are inert and documented

---

## Track E — Visual Skill Builder (Week 3-4)

### E1) Skill Detail + Edit View (Priority)

**Plan:** Introduce full detail view for single skill management.

**Implementation tasks:**
- Build skill detail component/page
- Edit prompt template, variables, tool hints
- Add "Run now" action
- Show per-skill execution history

**Edge cases:**
- Invalid prompt update: inline validation + field-level errors
- Missing referenced tools in hints: warn and allow save

**Acceptance criteria (DoD):**
- User can view, edit, test-run, and inspect execution history in one place

### E2) Skill Steps Visualization (Optional)

**Plan:** Read-only linear flow from tool hints.

**Constraint:** if >3 implementation days, defer to V3.

**Acceptance criteria (DoD):**
- If shipped, visualization accurately reflects tool sequence
- If deferred, E1 still ships with no blockers

---

## 7) Data Model and API Additions (Planned)

### 7.1 Skills table additions

```sql
ALTER TABLE skills ADD COLUMN trigger_examples TEXT DEFAULT '[]';
ALTER TABLE skills ADD COLUMN version INTEGER DEFAULT 1;
ALTER TABLE skills ADD COLUMN category TEXT DEFAULT 'general';
ALTER TABLE skills ADD COLUMN copied_from_skill_id TEXT REFERENCES skills(id) ON DELETE SET NULL;
ALTER TABLE skills ADD COLUMN copied_from_character_id TEXT REFERENCES characters(id) ON DELETE SET NULL;
```

### 7.2 Optional version history

```sql
CREATE TABLE skill_versions (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  prompt_template TEXT NOT NULL,
  input_parameters TEXT DEFAULT '[]',
  tool_hints TEXT DEFAULT '[]',
  change_reason TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### 7.3 Template type extension

```ts
export interface AgentTemplateSkill {
  name: string;
  description: string;
  promptTemplate: string;
  inputParameters: { name: string; type: string; default?: string }[];
  toolHints: string[];
}

export interface AgentTemplate {
  // existing fields...
  category?: string;
  exampleSkills?: AgentTemplateSkill[];
}
```

### 7.4 New API/tool surface

- `POST /api/skills/:id/copy`
- `GET /api/skills?all=true`
- `GET /api/characters/:id/stats`
- Tool: `updateSkill`
- Tool: `copySkill`

---

## 8) Plan Tooling Alignment and Edge-Case Rules

These rules are mandatory in V2 when skills use plan updates.

### 8.1 Merge vs Replace Behavior

- `replace`: full authoritative plan payload
- `merge`: targeted updates only; do not resend full plan unless explicit replace
- Stable step IDs must be created once and reused across updates

### 8.2 Failure and Warning Handling

- Missing/invalid step ID in merge: skip + warning
- Stale plan version (if expected version contract is enabled): structured stale error + recovery hint
- Multiple `in_progress` states: normalize to one, emit warning
- Oversized step text or >20 steps: deterministic truncation + warning

### 8.3 Persistence and Refresh Continuity

- Session metadata plan is source of truth
- Refresh should rehydrate plan state with latest version
- Panel collapse state remains local preference and must not mutate server plan

### 8.4 Tool Result UX Consistency

- Success: compact or expanded card behavior preserved
- Warning: visible indicator with expandable details
- Error: compact error card with actionable next step (retry/refresh/recreate)

---

## 9) Milestones, Sequence, and Definition of Done

## Milestone M1 (Week 1): Track A foundation + Track B copy API

**Deliver:** A1 + A3 baseline, B1 API/tool skeleton

**DoD:**
- Auto-trigger prompts work in controlled manual tests
- Skill extraction uses recent tool-call context
- Copy API creates independent clone with provenance

## Milestone M2 (Week 2): Track B library + Track C stats

**Deliver:** B2 library and C1 card stats

**DoD:**
- Cross-agent library with filters works
- Agent cards show stable metrics without blocking loads

## Milestone M3 (Week 3): Track D templates + C2 dashboard

**Deliver:** New templates, categories/search, lightweight dashboard

**DoD:**
- Template hire flow seeds skills where defined
- Dashboard shows recent and upcoming activity

## Milestone M4 (Week 4): Track E and reliability hardening

**Deliver:** E1 detail editor (required), E2 optional, full QA + rollout controls

**DoD:**
- Skill detail edit/test/history works
- Optional flow view shipped or formally deferred
- Release checklist complete and signed off

---

## 10) Week-by-Week Execution Matrix

| Week | Backend | Runtime/Tools | UI | Localization | QA |
|---|---|---|---|---|---|
| 1 | trigger/version/provenance schema, copy API | `updateSkill`/`copySkill` scaffolds, extraction hooks | initial copy action | baseline keys | unit tests for matching/copy/extraction |
| 2 | cross-agent queries, stats endpoint | tool registry metadata alignment | skill library, agent card stats | complete B/C strings | integration tests + manual flows |
| 3 | dashboard queries, template seeding | template version/category fields | dashboard + template filters | D/C strings | e2e hire/template/stats |
| 4 | reliability fixes, telemetry enrichments | plan+skills edge-case hardening | skill detail editor (+ optional flow) | final pass | full regression + canary checklist |

---

## 11) Testing Strategy (Implementation-Ready)

### 11.1 Unit

- Skill match ranking and ambiguity handling
- Copy logic and ownership checks
- Version increment and optional history snapshots
- Extraction parser for recent tool call sequences
- Plan merge/replace warning behavior for skill-driven plan updates

### 11.2 Integration

- Chat runtime with enabled skill tools and prompt injection
- Skill copy via API and tool path
- Library filtering across agents
- Stats endpoint consistency with run records
- Plan continuity across refresh/session reload

### 11.3 E2E

- Create -> run -> feedback -> update skill loop
- Copy skill between two agents then run from target
- Hire template with example skills and execute one
- Dashboard renders recent/upcoming activity for multi-agent user

### 11.4 Manual Prompt Scripts (QA/Product)

1. **Auto-trigger test**  
   "What changed with our competitors this week?"  
   Expected: matching skill auto-runs or asks clarification when ambiguous.

2. **Improve skill test**  
   "That output was too long. Update this skill to always return 5 bullets max."  
   Expected: `updateSkill` applies change and next run reflects it.

3. **Copy skill test**  
   "Copy my newsletter skill to my Content Writer agent."  
   Expected: copy succeeds, target agent can list/run it.

4. **Library test**  
   "Show all my skills across agents and filter to Marketing."  
   Expected: cross-agent list + filter behavior works.

5. **Plan merge test**  
   "Update only step id `<step-id>` to completed using merge."  
   Expected: single-step update, no unintended plan replacement.

6. **Plan stale/error path**  
   "Retry with an older plan version and show recovery guidance."  
   Expected: structured stale error, clear retry path.

7. **Refresh continuity test**  
   Start a plan-linked skill run, refresh page, confirm plan state persists.

---

## 12) Rollout Safety, Observability, Fallback, Rollback

### 12.1 Observability

Track at minimum:
- Skill auto-trigger rate
- Wrong-skill correction rate (user overrides)
- Skill copy success/failure rate
- Stats/dashboard query latency
- Plan warning/error/stale rates for skill-driven updates

### 12.2 Rollout Strategy

- Feature flags by track (A/B/C/D/E independently)
- Cohort rollout: internal -> 5% -> 25% -> 100%
- Hold points between cohorts with QA sign-off

### 12.3 Fallback

- Disable per-track flags without schema rollback
- Revert to manual run-only behavior if auto-trigger quality drops
- Hide optional E2 visualization without affecting E1 editor

### 12.4 Rollback Triggers

- P0 data corruption in skills or session plan state
- >2x baseline API/tool failure for 30 minutes
- >5% user task completion drop attributable to skill matching/copy/update regressions

---

## 13) Migration and Compatibility Notes

- All schema changes are additive and backward-compatible
- Existing sessions without plan metadata initialize lazily
- Existing skills remain runnable if new fields are absent/defaulted
- Existing templates continue functioning if `category`/`exampleSkills` are missing
- If optional `skill_versions` is deferred, `version` still increments on base skill row

---

## 14) Release Checklist

- [ ] V1 exit gate re-validated
- [ ] Track A minimums pass acceptance criteria
- [ ] Track B copy + library pass acceptance criteria
- [ ] Track C card stats visible and accurate
- [ ] Track D templates + filters pass smoke tests
- [ ] Track E1 editor is production-stable (E2 shipped or formally deferred)
- [ ] Tool registry metadata and availability reviewed
- [ ] Localization complete (`en`, `tr`, others as required)
- [ ] Telemetry dashboards/alerts configured
- [ ] Rollback owner + incident channel assigned

---

## 15) Phase 2 Success Criteria

### Must Have (Implementation-Ready Spec)

The following four items are required for Phase 2 completion. Each item includes architecture, UX, rollout, and acceptance criteria aligned to current runtime/tooling patterns.

#### 15.1 Cross-Agent Skill Library with Advanced Filtering

**Product intent**
- Let users discover skills across all owned agents quickly, then run/copy/open with minimal typing.
- Keep discovery broad, but execution safe (no accidental cross-agent wrong-skill runs).

**Scope**
- Global skills library page/panel with advanced filters and ranking.
- Quick actions: open skill, copy to agent, run in current chat (safe path only).

**Non-goals**
- No cross-user sharing.
- No automatic cross-agent execution by fuzzy name alone.

**Dependencies and rollout order**
- Depends on Track B copy semantics and provenance fields.
- Ship in phases: read-only listing -> advanced filters -> quick actions -> ranking refinements.

**Backend/data and query contracts**
- Extend skills listing API for cross-agent queries (user-scoped):
  - `GET /api/skills?all=true&agentId=&category=&q=&usageBucket=&successBucket=&updatedFrom=&updatedTo=&sort=&cursor=&limit=`
- Add/confirm indexed fields for low-cost queries:
  - `character_id`, `updated_at`, `run_count`, `success_count`, `name` (search support via LIKE/FTS strategy).
- Return stable identifiers to avoid ambiguity:
  - always include `skillId`, `characterId`, `name`, `description`, `version`, `runStats`.

```ts
// Planning-level response contract
interface SkillLibraryItem {
  skillId: string;
  characterId: string;
  characterName: string;
  name: string;
  description: string;
  category: string | null;
  version: number;
  runCount30d: number;
  successRate30d: number | null;
  updatedAt: string;
}
```

**Ranking, sorting, pagination**
- Default sort: `updatedAt desc` (predictable freshness).
- If `q` exists: relevance first, then `successRate30d desc`, then `runCount30d desc`, then `updatedAt desc`.
- Pagination: cursor-based (`cursor` + `limit`) to keep stable results under concurrent updates.

**Runtime/tool touchpoints (critical alignment)**
- `app/api/chat/route.ts`: keep `skillSummaries` hydration scoped to current agent by default.
- `lib/ai/character-prompt.ts` `buildCharacterSystemPrompt`: keep current-agent shaping for auto-use; cross-agent library is discovery UI, not implicit prompt expansion.
- `lib/ai/tools/run-skill-tool.ts`: execution uses `skillId` when launched from library. Name/fuzzy fallback remains chat-only with safeguards.

```ts
// Safety rule for library-launched execution
if (selection.skillId) {
  runSkill({ skillId: selection.skillId });
} else {
  // Never execute from global library by fuzzy name only
  requireUserDisambiguation();
}
```

**UX behavior (desktop + mobile)**
- Desktop: left filter rail + result list + sticky quick chips (`Agent`, `Category`, `Success`, `Updated`).
- Mobile: filter bottom sheet + chip row + compact cards.
- Empty states:
  - no skills yet: CTA to create/import.
  - no filter matches: clear-filters action + query hint.
- Error state: compact retry card style consistent with `plan-tool-ui` patterns.
- Success confirmations: inline receipt after copy/run (`Skill copied to X`, `Running skill Y`).

**Edge cases**
- Duplicate skill names across agents: show `name + agentName` and require explicit skillId action.
- Fuzzy match collisions: no auto-run from list-level text input.
- Permission boundaries: only owned agents included.
- Stale references (deleted skill after listing): action returns explicit stale error and refresh suggestion.

**Observability, risks, fallback**
- Track: filter usage, zero-result rate, copy/run conversion, stale-action error rate.
- Risk: wrong-skill execution due to ambiguous name; mitigation is skillId-first action path.
- Fallback: disable advanced facets and keep `agent + q + updated` only.

**Acceptance criteria**
- User can find target skill in <= 3 interactions for common tasks.
- All run actions from library use `skillId` path.
- Duplicate names never cause silent wrong-skill execution.

#### 15.2 Lightweight Team Dashboard

**Product intent**
- Give a fast “how are my agents performing?” view with low query cost and clear drill-ins.

**Scope**
- One lightweight dashboard for activity/performance trends across owned agents.
- Metrics: runs, success rate, top skills, trend windows.

**Non-goals**
- No heavy BI, custom chart builder, or real-time streaming.

**Dependencies and rollout order**
- Depends on trustworthy run stats from scheduler/tool execution.
- Ship order: KPI cards -> trend rows -> drill-ins.

**Data freshness and aggregation cadence**
- Window presets: `24h`, `7d`, `30d`.
- Freshness target: <= 5 minutes lag (cached aggregation acceptable).
- Include `asOf` timestamp on response for transparency.

```ts
interface DashboardSummary {
  asOf: string;
  window: "24h" | "7d" | "30d";
  totalRuns: number;
  successRate: number | null;
  topSkills: Array<{ skillId: string; name: string; runs: number; successRate: number | null }>;
  trend: Array<{ day: string; runs: number; failures: number }>;
}
```

**Low-cost query plan**
- Prefer pre-aggregated daily buckets (or lightweight materialized table refreshed on run completion).
- Fallback to bounded window scans with indexes on `created_at`, `skill_id`, `character_id`.

**Drill-in behavior and execution alignment**
- Clicking a top skill opens filtered history and offers `Run again` using existing `runSkill` behavior.
- Failure drill-in shows compact reason + link to skill detail/history.

**UX behavior (desktop + mobile)**
- Desktop: KPI strip (runs, success, failures, top skill), trend chart, top-skill table, recent failures list.
- Mobile: stacked KPI cards, compact trend sparkline, tap-to-expand tables.
- Empty states:
  - no runs in window: onboarding text + CTA to run/create/schedule a skill.
  - no failures: positive confirmation (`No failures in selected window`).
- Error state: partial rendering allowed (show cards from cached data, inline warning for failed widget).

**Edge cases**
- Sparse data windows: show statistically safe labels (`insufficient data`).
- Clock/timezone drift: aggregate by UTC day and format by local timezone in UI.
- Metric disagreement due to delayed ingestion: show `asOf` + refresh action.

**Observability, risks, fallback**
- Track: dashboard load latency, widget error rate, drill-in CTR, stale-data age.
- Risk: expensive queries on large histories; mitigate with pre-aggregation and capped windows.
- Fallback: disable trend series and keep KPI totals only.

**Acceptance criteria**
- Dashboard first paint <= 2.5s for typical dataset.
- Drill-in from top skill to history executes in <= 2 clicks.
- Users can identify top failing skill in <= 10 seconds.

```ts
// Planning-level drill-in contract
interface DashboardDrillInRequest {
  window: "24h" | "7d" | "30d";
  skillId?: string;
  characterId?: string;
  status?: "success" | "failure";
}
```

#### 15.3 Read-Only Skill Flow Visualization

**Product intent**
- Help users understand how a skill executes without exposing risky mutation controls.

**Scope**
- Read-only flow view derived from skill definition (`tool_hints`, template steps, inferred sequence).
- Affordances: copy flow summary and export as text/JSON snapshot.

**Non-goals**
- No drag/drop editing.
- No direct mutation controls from flow canvas.

**Dependencies and rollout order**
- Depends on stable skill detail page from Track E1.
- Ship order: linear list view -> grouped step cards -> optional mini-map for large flows.

**View model and rendering contract**
- Build deterministic step model from current skill payload and optional recent execution metadata.
- Mark missing/unknown steps as warnings, never block render.

```ts
interface SkillFlowStepVM {
  stepId: string;
  title: string;
  toolName: string | null;
  inputSummary: string;
  outputSummary?: string;
  status: "defined" | "inferred" | "missing";
}
```

**UX behavior (desktop + mobile)**
- Desktop: vertical timeline with sticky legend (`defined`, `inferred`, `missing`).
- Mobile: accordion cards with step index and truncated summaries.
- Loading: skeleton for timeline/cards.
- Error state: fallback to plain text flow summary.
- Success confirmation: `Copied flow summary` toast/receipt.

**Edge cases**
- Partial/missing `tool_hints`: render inferred step with warning badge.
- Large flows (>50 steps): virtualized list + collapsed-by-default groups.
- Unknown tools in hints: show `Unavailable tool` tag, keep row visible.

**Observability, risks, fallback**
- Track: flow view opens, copy/export actions, missing-step incidence.
- Risk: users interpret inferred steps as guaranteed logic; mitigate with explicit `inferred` label.
- Fallback: disable visualization panel and keep text summary only.

**Acceptance criteria**
- 100% of skills with valid definitions render at least one flow representation.
- Read-only constraint is strict: no save/mutate actions in this view.
- Large-flow rendering remains responsive (no blocking UI on >50-step skills).

#### 15.4 Optional Historical Skill Version Browser UI

**Product intent**
- Provide confidence when skills evolve by allowing users to inspect past versions and diffs.

**Scope**
- Version list and side-by-side diff for prompt/template/tool hints.
- Feature is optional and gated.

**Non-goals**
- Direct restore in V2 (explicitly out of scope for safety).
- No branch/merge model.

**Dependencies and rollout order**
- Depends on `version` semantics (Track A2) and optional `skill_versions` snapshots.
- Ship order: gated read-only list -> compare view -> optional `Copy as new skill` helper.

**Retention and semantics**
- If history table enabled: retain last N versions (default 20) per skill, oldest trimmed.
- If history table disabled: show current version only + explanatory empty state.
- Diff granularity: field-level (`prompt_template`, `input_parameters`, `tool_hints`, `description`).

```ts
interface SkillVersionSnapshot {
  skillId: string;
  version: number;
  createdAt: string;
  changeReason?: string;
  promptTemplate: string;
  inputParameters: unknown[];
  toolHints: string[];
}
```

**UX behavior (desktop + mobile)**
- Desktop: left version rail + right diff pane.
- Mobile: version selector sheet + tabbed diff sections.
- Empty states:
  - no history captured: explain feature flag or retention policy.
  - selected versions unavailable: stale snapshot message + reload action.
- Error state: compact inline card with retry.

**Edge cases**
- Missing historical rows due to earlier app versions: degrade gracefully, no crash.
- Diff payload too large: collapse unchanged sections and lazy-load long fields.
- Concurrent updates while viewing: show `newer version available` banner.

**Rollout gating, observability, fallback**
- Gate via feature flag (`skills.versionBrowser.enabled`).
- Track: open rate, compare actions, large-diff render time, missing-history rate.
- Fallback: disable compare pane and keep version list summary.

**Acceptance criteria**
- When enabled, users can compare any two available versions in <= 3 interactions.
- Missing history is always explained with a clear reason.
- No restore button appears in V2.

## 15.5 MUST-Have Rollout Sequence and Validation Matrix

**Phased rollout order**
1. Ship cross-agent library read-only + filters + safe `skillId` actioning.
2. Ship dashboard KPIs + trend + drill-ins.
3. Ship read-only flow visualization in skill detail.
4. Enable version browser behind flag; expand gradually.

**Prompt-level QA scripts (manual, immediate use)**
- Library discovery: `Show all my skills, filter to Marketing, then sort by success rate.`
- Ambiguity safety: `Run my newsletter skill.` (with duplicate names across two agents) -> expected disambiguation.
- Dashboard diagnosis: `Which skill failed most in the last 7 days?` -> expected drill-in path.
- Flow view: `Show me the flow for <skill name>.` -> expected read-only timeline + copy action.
- Version compare: `Compare version 3 and version 5 of <skill name>.` -> expected diff or clear missing-history reason.

**Definition of done for MUST-Have block**
- All four features pass acceptance criteria and manual prompt scripts.
- Error/empty/loading states validated on desktop and mobile.
- Telemetry dashboards include new MUST-have metrics.
- Feature flags and rollback toggles documented and tested once.


### Explicitly Out of Scope (V3)

- Multi-agent chains/pipelines
- Public skill marketplace
- Heavy gamification economy
- Full node-based visual workflow editor
- Full remote template marketplace activation

---

## 16) Guiding Principle

> "Keep it simple, learn from real usage, stay ready for the next version."

Phase 2 ships independently by track. If one track slips (especially optional E2), the others still release on schedule.
