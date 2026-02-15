# Seline Skills & Agent Discovery — V1 Design Plan

> **Date:** February 8, 2026  
> **Inputs:** Codebase audit, Duhan's team answers, Anthropic's SKILL.md pattern, Jordan's UX vision  
> **Goal:** A concrete, buildable v1 plan. No fluff.

---

## What Already Exists (Don't Rebuild These)

Before building anything new, here's what Seline already has:

| What | Where | Status |
|------|-------|--------|
| Agent creation wizard | `components/character-creation/terminal-wizard.tsx` | ✅ Working |
| Agent picker UI | `locales/en.json` → `picker` section | ✅ Working |
| Agent database (characters table) | `lib/db/sqlite-character-schema.ts` | ✅ Working |
| Agent memory system | `lib/agent-memory/` → `memories.json`, `memory.md` | ✅ Working |
| Tool registry (40+ tools) | `lib/ai/tool-registry/tool-definitions.ts` | ✅ Working |
| Schedule task tool | `lib/ai/tools/schedule-task-tool.ts` | ✅ Working |
| Scheduler service (cron/interval/once) | `lib/scheduler/scheduler-service.ts` | ✅ Working |
| Task queue with retries | `lib/scheduler/task-queue.ts` | ✅ Working |
| Delivery routing (session/slack/email/webhook/channel) | `lib/scheduler/delivery.ts` | ✅ Working |
| Multi-channel connections (WhatsApp/Telegram/Slack/Discord) | `sqlite-character-schema.ts` → `channelConnections` | ✅ Working |
| System prompt builder with memory injection | `lib/ai/character-prompt.ts` | ✅ Working |

**Bottom line: ~70% of the infrastructure exists. We're building the glue, not the engine.**

---

## Part 1: What is a "Skill"?

### Simple Definition

A Skill is a **recipe card** for the agent. It tells the agent:
- **WHAT** to do (the instructions)
- **WHEN** to do it (the trigger — user asks, or scheduled)
- **WITH WHAT** tools (web search, browse, etc.)
- **WHERE** to send the result (chat, Slack, WhatsApp, email)

### Real Example

```
┌─────────────────────────────────────────────────┐
│  📋 Skill: "Weekly Competitor Check"            │
│                                                  │
│  Description: Search for competitor news and     │
│  summarize findings. Use when user asks about    │
│  competitors or weekly market updates.           │
│                                                  │
│  Instructions:                                   │
│  1. Search web for news about {{competitors}}    │
│     from the past week                           │
│  2. Browse top 3 results per competitor          │
│  3. Summarize in bullet points                   │
│  4. Highlight launches, funding, partnerships    │
│                                                  │
│  Fill-in-the-blanks:                             │
│  • competitors: ["Acme", "Globex", "Initech"]   │
│  • delivery: Slack #market-updates               │
│                                                  │
│  Tools needed: webSearch, webBrowse              │
│  Runs: Every Monday 9am                          │
└─────────────────────────────────────────────────┘
```

### How It's Different From Memories

This distinction MUST be clear in the UI:

| | 🧠 Memories | ⚡ Skills |
|---|---|---|
| **What** | Things the agent remembers | Things the agent does |
| **Example** | "User prefers bullet points" | "Write weekly newsletter" |
| **When active** | Always (injected into every conversation) | On-demand or scheduled |
| **Created by** | Agent extracts from chat automatically | User says "save this as a skill" |
| **UI location** | Agent memory page (`/agents/[id]/memory`) | Agent skills page (`/agents/[id]/skills`) |

**UI hint:** Use different icons. 🧠 for memories, ⚡ for skills. Never mix them in the same list.

### Inspired by Anthropic's SKILL.md Pattern

Anthropic's official approach uses a 3-level loading system. We adapt it:

| Level | What | When it loads | Cost |
|-------|------|---------------|------|
| **Name + Description** | Always visible to agent | On startup | Tiny (~50 tokens) |
| **Full Instructions** | Only when the skill matches user's request | When triggered | Under 2,000 tokens |
| **Referenced files/data** | Only if instructions say "check this" | As needed | Zero until used |

This means an agent can have 20 skills but only pay the token cost for the one that's actually being used.

---

## Part 2: How Users Create Skills

### Primary Flow: Teach by Talking (for everyone)

This is the main way. No forms. Just chat.

```
┌─────────────────────────────────────────────────────────┐
│                                                          │
│  User: "Search for AI news this week and summarize it"   │
│                                                          │
│  Agent: [does the task — searches, browses, summarizes]  │
│                                                          │
│  User: "Save this as a skill"                            │
│                                                          │
│  Agent: "Got it! Let me understand what you want to      │
│          save. Quick questions:"                         │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  What should I call this skill?                  │    │
│  │  [AI News Summary] [Weekly Research] [Custom...] │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  What changes each time you run this?            │    │
│  │  [✓] The topic to search for                     │    │
│  │  [✓] The time period                             │    │
│  │  [ ] The number of results                       │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Want to schedule this?                          │    │
│  │  [Every Monday] [Every Day] [Not now]            │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  Agent: "✅ Skill saved! 'AI News Summary' will run      │
│          every Monday at 9am and post to this chat."     │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Key rules from Duhan:**
- Questions should be answered by **clicking options, not typing**
- Don't waste the user's time — 2-3 quick questions max
- The whole flow should take under 30 seconds

### Secondary Flow: Manual Creation (for power users)

Available from: Agent Skills page (`/agents/[id]/skills`) -> "+ New Skill"

A simple form with:
- Name
- Description (when should the agent use this?)
- Instructions (step-by-step, plain text)
- Variables (fill-in-the-blanks)
- Tools to use (checkboxes from tool registry)

This is the escape hatch, not the default.

---

## Part 3: Agent Templates ("Hiring")

### How It Works

```
┌───────────────────────────────────────────────────┐
│                Agent Picker (enhanced)              │
│                                                     │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ │
│  │ 🤖 You  │ │ 📊 Lead │ │ 🔬 Deep │ │ + New   │ │
│  │ Personal│ │   Gen   │ │Research │ │  Agent  │ │
│  │ (active)│ │ (hire?) │ │ (hire?) │ │         │ │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ │
│                                                     │
│  ── Your Agents ──────────────────────────────────  │
│  ── Available Templates ──────────────────────────  │
│                                                     │
└───────────────────────────────────────────────────┘
```

### Team Decisions Applied

| Decision | Implementation |
|----------|---------------|
| **Offline first** | Templates are bundled in code under `lib/characters/templates/*.ts` (current system) |
| **Users get a full copy** | "Hire" = clone template -> user owns it -> can change name, add skills, add knowledge |
| **Auto-create "You" on first launch** | Already implemented via `ensureDefaultAgentExists()` in `app/api/characters/route.ts` |
| **Server-based later** | Template sync from server remains a v2 feature when volume grows |

### Template Format (TypeScript, current system)

Templates are currently defined as TS objects under `lib/characters/templates/`.

```ts
export const LEAD_GEN_TEMPLATE: AgentTemplate = {
  id: "lead-gen-assistant",
  name: "Lead Gen Assistant",
  tagline: "Finds and qualifies potential customers",
  purpose:
    "Help users find leads by searching the web, analyzing company profiles, and creating outreach drafts.",
  isDefault: false,
  isDeletable: true,
  enabledTools: ["webSearch", "webBrowse", "scheduleTask"],
  syncFolders: [
    {
      pathVariable: "${USER_WORKSPACE}",
      displayName: "Leads Workspace",
      includeExtensions: ["md", "txt", "csv"],
      excludePatterns: ["node_modules", ".git"],
      isPrimary: false,
    },
  ],
  memories: [
    {
      category: "workflow_patterns",
      content: "Prioritize concise lead qualification summaries.",
      reasoning: "Default behavior for this template.",
    },
  ],
};
```

### V1 Templates to Ship (3-5) We can have default and after implementations we will manually create agents, you don't have to add all 5. Default agent is fine. 

1. **You** (Personal Assistant) — auto-created, general purpose
2. **Research Assistant** — deep research, web browsing, summarization
3. **Lead Gen Assistant** — find companies, research prospects
4. **Content Writer** — blog posts, newsletters, social media
5. **Code Helper** — code review, debugging, documentation

---

## Part 4: Database Changes

### New Table: `skills`

```sql
CREATE TABLE skills (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id    TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,

  -- Identity
  name            TEXT NOT NULL,
  description     TEXT,          -- WHEN to use this skill (key for auto-triggering)
  icon            TEXT,          -- emoji

  -- The Recipe
  prompt_template TEXT NOT NULL, -- instructions with {{variable}} placeholders
  input_parameters TEXT DEFAULT '[]',  -- JSON: [{name, type, description, default}]
  tool_hints      TEXT DEFAULT '[]',   -- JSON: ["webSearch", "webBrowse"]

  -- Where this came from
  source_type     TEXT DEFAULT 'conversation', -- 'conversation' | 'manual' | 'template'
  source_session_id TEXT REFERENCES sessions(id),

  -- Stats (updated after each run)
  run_count       INTEGER DEFAULT 0,
  success_count   INTEGER DEFAULT 0,
  last_run_at     TEXT,

  -- Status
  status          TEXT DEFAULT 'active',  -- 'draft' | 'active' | 'archived'

  -- Timestamps
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);
```

### Template Storage (Corrected for Current Codebase)

**No new `agent_templates` DB table in V1.**

Template system already exists and is production-wired:
- `lib/characters/templates/types.ts`
- `lib/characters/templates/index.ts`
- `lib/characters/templates/seline-default.ts`
- `app/api/characters/route.ts` (`ensureDefaultAgentExists()`)

V1 template work is to add more template TS files and register them in the existing map.

### Modify Existing: `scheduled_tasks`

Add one column to link schedules to skills:

```sql
ALTER TABLE scheduled_tasks ADD COLUMN skill_id TEXT REFERENCES skills(id) ON DELETE SET NULL;
```

---

## Part 5: New Tools to Build

### Tool 1: `createSkill` (agent-callable)

The agent calls this when the user says "save as skill." Follows the exact same pattern as the existing `scheduleTask` tool.

```
Location: lib/ai/tools/create-skill-tool.ts
Registry: tool-definitions.ts (category: "utility")
Loading: deferred (discovered via searchTools)
```

What it does:
1. Takes: name, description, promptTemplate, inputParameters, toolHints
2. Gets sessionId from context (for source tracking)
3. Inserts into `skills` table
4. Returns confirmation to user

### Tool 2: `listSkills` (agent-callable)

So the agent can say "here are your skills" when asked.

```
Location: lib/ai/tools/list-skills-tool.ts
```

### Tool 3: `runSkill` (agent-callable)

So the user can say "run my weekly report skill" and the agent executes it.

```
Location: lib/ai/tools/run-skill-tool.ts
```

What it does:
1. Looks up the skill by name or ID
2. Resolves variables (asks user if needed, or uses defaults)
3. Executes the prompt template with the agent's full tool access
4. Optionally schedules it (calls existing `scheduleTask`)

---

## Part 6: How Skills Plug Into the System Prompt

Skills get injected into the agent's system prompt the same way memories do — via `character-prompt.ts`.

Current flow:
```
buildCharacterSystemPrompt()
  → Agent identity (name, purpose)
  → Agent memories (via formatMemoriesForPrompt)   ← EXISTING
  → Universal guidelines
  → Temporal context
```

New flow:
```
buildCharacterSystemPrompt()
  → Agent identity (name, purpose)
  → Agent memories (via formatMemoriesForPrompt)   ← EXISTING
  → Agent skills summary (via formatSkillsForPrompt) ← NEW
  → Universal guidelines
  → Temporal context
```

The skills summary is **just names + descriptions** (Level 1 from Anthropic's pattern). Full instructions load only when triggered. This keeps token cost low.

Example injection:
```
## Your Skills

You have the following skills available. When a user's request matches a skill, use it.

- **Weekly Competitor Check**: Search for competitor news and summarize. Use when user asks about competitors or market updates.
- **AI News Summary**: Search for AI news and create a digest. Use when user asks for news or weekly updates.
- **Draft Cold Email**: Write outreach emails for leads. Use when user asks to draft emails or outreach.
```

~150 tokens for 3 skills. Scales well to 10-20 skills.

---

## Part 7: Scheduling Integration

Skills and scheduling connect like this:

```
Skill (the recipe)
  ↓
  "Schedule this skill"
  ↓
Scheduled Task (existing system)
  - skillId → points to the skill
  - initialPrompt → resolved from skill's promptTemplate
  - cronExpression → from user's choice
  - deliveryMethod → session/slack/whatsapp/email
  ↓
Scheduler Service (existing, unchanged)
  ↓
Task Queue (existing, unchanged)
  ↓
Chat API (existing, unchanged)
  ↓
Delivery Router (existing, unchanged)
```

**Nothing changes in the scheduler.** We just add `skillId` as a foreign key so we can track which schedule came from which skill.

---

## Part 8: What We're NOT Building in V1

Per Duhan's decisions:

| Feature | Status | Why |
|---------|--------|-----|
| Skill sharing between agents | ❌ v2 | "Be careful about volume of exchanges" |
| Multi-agent skill chains | ❌ v2/v3 | "Second generation, second direction" |
| Team Dashboard | ❌ v2 | "Existing is fine for now" |
| n8n/Make integration | ❌ v2 | "Not our primary option" |
| Heavy gamification (XP, levels, badges) | ❌ v2 | "Try to be simple, be ready for new version" |
| Visual flow recorder | ❌ v2 | "If it's fast, good. If not, fine" |
| Server-based template registry | ❌ v2 | "Offline for first steps" |
| Skill versioning | ❌ v2 | Keep it simple |

---

## Part 9: Build Order (Week by Week)

### Week 1: Foundation

| Task | Effort | Details |
|------|--------|---------|
| Create `skills` table + migration | Small | Add in `sqlite-client.ts` and Drizzle schema exports |
| Create CRUD API routes for skills | Medium | `app/api/skills/` — GET, POST, PATCH, DELETE |
| Create `createSkill` tool | Medium | Follow `schedule-task-tool.ts` pattern exactly |
| Create `listSkills` tool | Small | Query skills table, return formatted list |
| Add `skillId` column to `scheduled_tasks` | Small | Migration + update schedule-task-tool |
| Add `runSkill` tool | Medium | Execute skills on demand + update run stats |
| Ship 3-5 TS templates | Small | Add files in `lib/characters/templates/` |
| Register templates in existing map | Small | Update `lib/characters/templates/index.ts` |

### Week 2: UX & Integration

| Task | Effort | Details |
|------|--------|---------|
| `formatSkillsForPrompt()` function | Medium | Inject skill names+descriptions into system prompt |
| Skill creation flow in chat (clickable options) | Medium | Agent asks 2-3 questions with button options |
| `runSkill` tool | Medium | Execute a skill on demand |
| Skills page UI (`/agents/[id]/skills`) | Medium | New sibling page to memory/schedules with quick-link entry |
| Template browser in Agent Picker | Medium | "Available Templates" section with "Hire" button |
| "Hire" flow (clone template → customize) | Medium | Pre-fill wizard with template data |
| Clear UI distinction: Skills vs Memories | Small | Different icons, labels, sections |
| Locale strings for all new UI | Small | Add to `locales/en.json` |

### Week 3: Polish & Test

| Task | Effort | Details |
|------|--------|---------|
| Skill → Schedule flow ("schedule this skill") | Medium | Connect createSkill output to scheduleTask |
| Conversation length limits for scheduled runs | Small | Cap exchanges per Duhan's concern |
| Skill stats tracking (run count, success rate) | Small | Update after each scheduled run |
| Agent card enhancements (show skill count) | Small | Query skills count per agent |
| Testing: full flow teach → save → schedule → deliver | Large | End-to-end testing |
| Error handling & edge cases | Medium | Empty skills, failed runs, etc. |

---

## Part 10: Naming Decision

Duhan said "no idea" on naming. Here's my recommendation:

**Keep "Skill"** — it's:
- ✅ Short (1 syllable)
- ✅ Already used by Anthropic (industry alignment)
- ✅ Implies capability ("this agent has skills")
- ✅ Works with gamification later ("level up your agent's skills")
- ✅ Clear difference from "Memory"

Alternatives if the team prefers:
- "Routine" — good for scheduled/repeated tasks, but sounds boring
- "Playbook" — good for business users, but too long
- "Recipe" — fun, but might confuse non-English speakers

---

## Summary: The 30-Second Pitch

> **Seline already has the engine (scheduler, tools, channels, memory). We're adding the steering wheel (Skills) and the showroom (Templates).**
>
> Users will be able to:
> 1. Pick a pre-built agent or create their own
> 2. Chat with it to do a task
> 3. Say "save this as a skill" -> agent asks 2-3 quick questions -> done
> 4. Say "run this every Monday" -> it's scheduled
> 5. Results show up in chat, Slack, WhatsApp, or email
>
> The whole experience should be so clean that users want to screenshot it and share on social media.

---

## Part 11: V1 Implementation-Ready Addendum (Codebase-Aligned)

> **Audit date:** February 15, 2026
> **Purpose:** Turn this plan into an implementation-ready blueprint with exact integration points from the current codebase.

### 11.1 Critical Corrections from Full Review

These are mandatory plan corrections discovered during implementation review:

1. **Template system is already live**
   - Existing: `lib/characters/templates/index.ts`, `lib/characters/templates/types.ts`, `lib/characters/templates/seline-default.ts`
   - Existing auto-default behavior: `ensureDefaultAgentExists()` called in `app/api/characters/route.ts`
   - **Action:** Do **not** build `agent_templates` DB table in V1. Extend existing template registry instead.

2. **Skill scheduling must integrate in two DB layers**
   - Drizzle schema layer: `lib/db/sqlite-schedule-schema.ts`
   - SQLite bootstrap/migration layer: `lib/db/sqlite-client.ts`
   - **Action:** adding `skill_id` only in one place will break runtime consistency.

3. **Prompt injection must cover both normal and cacheable flows**
   - Non-cacheable: `buildCharacterSystemPrompt()` in `lib/ai/character-prompt.ts`
   - Cacheable: `buildCacheableCharacterPrompt()` in same file
   - **Action:** inject skills into both, or behavior diverges by provider/caching mode.

4. **New tools require 5-way integration (not just tool file + registry)**
   - Tool implementation in `lib/ai/tools/`
   - Tool registry in `lib/ai/tool-registry/tool-definitions.ts`
   - Chat runtime wiring in `app/api/chat/route.ts` (`refetchTools` + context-aware `tools` overrides)
   - Agent creation capabilities UI in `components/character-creation/terminal-pages/capabilities-page.tsx`
   - Agent picker tool editor list in `components/character-picker.tsx` (`BASE_TOOLS`)
   - Locale strings in `locales/en.json`

5. **Agent settings IA is page-based today**
   - Current pages: `app/agents/[id]/memory/page.tsx`, `app/agents/[id]/schedules/page.tsx`
   - Sidebar quick links are in `components/chat/chat-sidebar/index.tsx`
   - **Action:** ship Skills as a sibling page: `app/agents/[id]/skills/page.tsx` and add quick link.

### 11.2 Final V1 Architecture (Approved)

```text
User chat request
  -> Chat API (`app/api/chat/route.ts`)
    -> Character prompt build (`lib/ai/character-prompt.ts`)
      -> Memory injection (`lib/agent-memory/...`)
      -> Skill summary injection (`lib/skills/prompt-injection.ts`) [NEW]
    -> AI tool calls
      -> createSkill/listSkills/runSkill tools [NEW]
      -> scheduleTask tool (existing, extended with skill linkage)
    -> Skills API (`app/api/skills/...`) [NEW]
      -> Skills persistence (`skills` table) [NEW]
      -> Ownership/auth checks via dbUser.id

Scheduled execution
  -> `scheduled_tasks.skill_id` link [NEW]
  -> Scheduler (`lib/scheduler/scheduler-service.ts`)
  -> Task Queue (`lib/scheduler/task-queue.ts`)
  -> Delivery router (`lib/scheduler/delivery/router.ts`)
  -> Skill run counters update [NEW]
```

### 11.3 Final Database Plan (V1)

#### A) New table: `skills`

```sql
CREATE TABLE skills (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id      TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,

  name              TEXT NOT NULL,
  description       TEXT,
  icon              TEXT,

  prompt_template   TEXT NOT NULL,
  input_parameters  TEXT NOT NULL DEFAULT '[]',
  tool_hints        TEXT NOT NULL DEFAULT '[]',

  source_type       TEXT NOT NULL DEFAULT 'conversation',
  source_session_id TEXT REFERENCES sessions(id),

  run_count         INTEGER NOT NULL DEFAULT 0,
  success_count     INTEGER NOT NULL DEFAULT 0,
  last_run_at       TEXT,

  status            TEXT NOT NULL DEFAULT 'active',

  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_skills_user_character ON skills(user_id, character_id, status);
CREATE INDEX idx_skills_character_name ON skills(character_id, name);
```

#### B) Extend `scheduled_tasks` with skill linkage

```sql
ALTER TABLE scheduled_tasks
ADD COLUMN skill_id TEXT REFERENCES skills(id) ON DELETE SET NULL;

CREATE INDEX idx_scheduled_tasks_skill_id ON scheduled_tasks(skill_id);
```

#### C) Implementation note (mandatory)

These changes must be mirrored in:
- `lib/db/sqlite-schedule-schema.ts` (Drizzle model)
- `lib/db/sqlite-client.ts` (raw bootstrap + runtime data migration)
- `lib/db/sqlite-schema.ts` exports (if new schema file is introduced)

### 11.4 Auth, Ownership, and Safety Rules

All Skills endpoints/tools must follow existing ownership pattern:

1. Resolve auth user via `requireAuth(req)`
2. Resolve DB user via `getOrCreateLocalUser(...)`
3. Query/mutate with **db user id** (`dbUser.id`), not raw auth external id
4. Validate `character_id` ownership before create/update/delete/run/schedule
5. Never allow cross-character reads without matching `user_id`

### 11.5 API Surface for V1 (Final)

#### Skills API (new)

1. `GET /api/skills?characterId=<id>&status=active|archived|draft`
2. `POST /api/skills`
3. `PATCH /api/skills/[id]`
4. `DELETE /api/skills/[id]`
5. `POST /api/skills/[id]/run`
6. `POST /api/skills/[id]/schedule`

#### Schedule API (existing, extend payload)

- Existing routes under `app/api/schedules/` continue unchanged in shape.
- Add optional `skillId` support in create/update paths so schedules created from skills are first-class.

#### Character API (existing, extend payload)

- Keep `GET /api/characters` and `GET /api/characters/[id]` unchanged.
- Add optional skill summaries/counts only if needed for efficient UI cards.

### 11.6 Tool Contract Design (V1)

#### Tool: `createSkill`

- File: `lib/ai/tools/create-skill-tool.ts`
- Input:
  - `name`
  - `description`
  - `promptTemplate`
  - `inputParameters` (JSON array)
  - `toolHints` (JSON array)
  - `icon` (optional)
- Behavior:
  1. Validate payload + normalize arrays.
  2. Confirm character ownership.
  3. Insert skill with `source_type='conversation'`, `source_session_id=sessionId`.
  4. Return receipt message suitable for clickable follow-up options.

#### Tool: `listSkills`

- File: `lib/ai/tools/list-skills-tool.ts`
- Input:
  - `characterId` (optional; defaults to current character)
  - `status` (optional)
- Behavior:
  1. Query scoped skills.
  2. Return concise list for chat rendering.
  3. Include enough metadata for next-step actions (`run`, `schedule`, `edit`).

#### Tool: `runSkill`

- File: `lib/ai/tools/run-skill-tool.ts`
- Input:
  - `skillId` or `skillName`
  - `parameters` (object)
  - `schedule` (optional inline config to bridge to schedule flow)
- Behavior:
  1. Resolve unique skill by id or exact/near name.
  2. Validate required variables.
  3. Materialize final prompt from `prompt_template` + variables.
  4. Execute against chat pipeline with current character tools.
  5. Update run stats (`run_count`, `success_count`, `last_run_at`).
  6. If scheduling requested, call scheduling bridge path.

### 11.7 Prompt Injection Spec (V1)

#### New file

- `lib/skills/prompt-injection.ts`
  - `formatSkillsForPrompt(characterId: string): { markdown: string; tokenEstimate: number; skillCount: number }`

#### Injection points

1. `buildCharacterSystemPrompt()` in `lib/ai/character-prompt.ts`
2. `buildCacheableCharacterPrompt()` in `lib/ai/character-prompt.ts`

#### Rules

- Inject only `name + description` in default prompt.
- Keep total skill block under soft budget (for example 300-500 tokens).
- If too many skills, truncate list and add hint: "Use listSkills tool to inspect full catalog."

### 11.8 Scheduling Bridge Spec (V1)

When user says "schedule this skill":

1. Resolve skill and required params.
2. Render `initial_prompt` from skill template.
3. Create schedule with `skill_id` set.
4. Preserve existing scheduler semantics (cron/interval/once, timezone, delivery).
5. On execution completion in task queue:
   - increment `run_count`
   - increment `success_count` on succeeded runs
   - set `last_run_at`

### 11.9 UX Integration Map (Pages + Components)

#### New pages

1. `app/agents/[id]/skills/page.tsx`
   - Mirrors memory/schedules page style.
   - Lists skills for selected agent.
   - CTA: "New Skill" (manual fallback).

2. `app/agents/[id]/skills/new/page.tsx` (optional in V1 if manual creation shipped)

#### Existing components to update

1. `components/chat/chat-sidebar/index.tsx`
   - Add quick link to `agents/[id]/skills`.

2. `components/character-picker.tsx`
   - Add `createSkill`, `listSkills`, `runSkill` to `BASE_TOOLS`.

3. `components/character-creation/terminal-pages/capabilities-page.tsx`
   - Add same tools in wizard capability set.

4. `locales/en.json`
   - Add tool labels/descriptions
   - Add skills page labels, empty states, button text, errors

### 11.10 Templates Plan (V1, corrected)

V1 template work should extend current in-code registry, not add DB table:

1. Add template files under `lib/characters/templates/`:
   - `research-assistant.ts`
   - `lead-gen-assistant.ts`
   - `content-writer.ts`
   - `code-helper.ts`

2. Update `lib/characters/templates/types.ts`
   - Add optional fields needed for picker presentation and seedable starter skills (if included in V1 scope).

3. Register templates in `lib/characters/templates/index.ts`
   - Extend `TEMPLATES` map.

4. Ensure `createAgentFromTemplate()` seeds:
   - purpose
   - enabled tools
   - memories
   - optional sync folders
   - optional starter skills (if V1 includes starter skill seeding)

### 11.11 Full File-by-File Change Plan (V1)

#### Database and schema

1. `lib/db/sqlite-skills-schema.ts` (new)
   - Skills table + types + relations.

2. `lib/db/sqlite-schema.ts`
   - Re-export skills schema.

3. `lib/db/sqlite-schedule-schema.ts`
   - Add `skillId` column in Drizzle model.

4. `lib/db/sqlite-client.ts`
   - Create `skills` table if missing.
   - Add migration for `scheduled_tasks.skill_id` if missing.
   - Add indexes.

#### Queries/domain layer

5. `lib/skills/queries.ts` (new)
   - CRUD, lookup by name/id, stats update helpers, ownership checks.

6. `lib/skills/prompt-injection.ts` (new)
   - Skills summary formatter for system prompts.

#### AI tools and registry

7. `lib/ai/tools/create-skill-tool.ts` (new)
8. `lib/ai/tools/list-skills-tool.ts` (new)
9. `lib/ai/tools/run-skill-tool.ts` (new)
10. `lib/ai/tool-registry/tool-definitions.ts`
    - Register all 3 tools (deferred loading, utility category).
11. `app/api/chat/route.ts`
    - Add tool instances to `refetchTools` and context-aware `tools` object.

#### Prompt system

12. `lib/ai/character-prompt.ts`
    - Inject skills in both prompt builders.

#### API routes

13. `app/api/skills/route.ts` (new)
14. `app/api/skills/[id]/route.ts` (new)
15. `app/api/skills/[id]/run/route.ts` (new)
16. `app/api/skills/[id]/schedule/route.ts` (new)

#### Scheduler integration

17. `lib/scheduler/scheduler-service.ts`
    - Ensure skill-linked schedule handling remains neutral.
18. `lib/scheduler/task-queue.ts`
    - Update skill stats after execution result persistence.

#### Frontend pages/components

19. `app/agents/[id]/skills/page.tsx` (new)
20. `components/skills/skills-list.tsx` (new)
21. `components/skills/skill-form.tsx` (new, if manual creation in V1)
22. `components/chat/chat-sidebar/index.tsx`
    - Add "Skills" quick link.
23. `components/character-picker.tsx`
    - Add new tools to `BASE_TOOLS`.
24. `components/character-creation/terminal-pages/capabilities-page.tsx`
    - Add new tools to wizard list.

#### Templates

25. `lib/characters/templates/types.ts`
26. `lib/characters/templates/index.ts`
27. `lib/characters/templates/research-assistant.ts` (new)
28. `lib/characters/templates/lead-gen-assistant.ts` (new)
29. `lib/characters/templates/content-writer.ts` (new)
30. `lib/characters/templates/code-helper.ts` (new)

#### Localization

31. `locales/en.json`
    - Tool labels/desc + Skills UX copy.

#### Tests

32. `lib/ai/__tests__/character-prompt.test.ts`
    - Verify skills block injection and token guard behavior.
33. `lib/skills/__tests__/queries.test.ts` (new)
34. `app/api/skills/__tests__/route.test.ts` (new)
35. `lib/ai/tools/__tests__/run-skill-tool.test.ts` (new)

### 11.12 Implementation Sequence (No Gaps)

#### Phase A - Data model and migrations

1. Add skills schema and exports.
2. Add sqlite bootstrap + migration logic.
3. Add schedule `skill_id` linkage.
4. Verify app boots with existing DBs (migration idempotency).

#### Phase B - Backend domain and APIs

1. Build `lib/skills/queries.ts`.
2. Implement `/api/skills` routes.
3. Add run/schedule endpoints.
4. Add auth/ownership tests.

#### Phase C - Tools and chat runtime

1. Implement three skill tools.
2. Register tools in tool registry.
3. Wire in chat route (`refetchTools` + active tool map).
4. Verify deferred discovery via `searchTools` works.

#### Phase D - Prompt and scheduler bridge

1. Implement `formatSkillsForPrompt()`.
2. Inject into both prompt builders.
3. Implement skill stats updates for direct run + scheduled runs.
4. End-to-end verify: create -> run -> schedule -> deliver -> stats.

#### Phase E - Frontend and templates

1. Ship skills page/list UI.
2. Add sidebar quick link.
3. Expose skill tools in picker/wizard.
4. Add 3-5 templates via existing registry.
5. Add locale strings and empty/error states.

### 11.13 End-to-End Acceptance Checklist (V1)

A. **Teach and save**
- User performs a task in chat and says "save as skill".
- Agent asks short clickable follow-up questions.
- Skill appears in `/agents/[id]/skills`.

B. **List and run**
- User asks "what are my skills?".
- `listSkills` returns scoped skill list.
- User runs one by name; execution succeeds.

C. **Schedule from skill**
- User says "run this every Monday 9am".
- Schedule is created with `skill_id` populated.
- Scheduler triggers at due time and delivers result.

D. **Stats correctness**
- `run_count`, `success_count`, `last_run_at` update on run completion.
- Works for manual run and scheduled run.

E. **Prompt behavior**
- System prompt contains skill summary in both normal and cacheable paths.
- Prompt remains bounded with many skills.

F. **Template hiring**
- Multiple templates visible from existing template registry path.
- Hiring clones into a user-owned agent with configured tools/memories.

### 11.14 Out-of-Scope Guardrails (Reconfirmed)

Still excluded from V1:

- Skill copy/share between agents (V2)
- Skill versioning/history tables (V2)
- Auto-trigger matching by trigger_examples (V2)
- Visual flow builder (V2)
- Marketplace/server template registry (V2+)

### 11.15 Risks and Mitigations

1. **Migration drift risk**
   - Mitigation: keep Drizzle + sqlite-client bootstrap in lockstep; add startup assertions.

2. **Tool visibility mismatch under deferred loading**
   - Mitigation: ensure registry metadata + chat route wiring + UI tool lists are updated together.

3. **Prompt bloat with many skills**
   - Mitigation: strict formatter cap + fallback instruction to use `listSkills`.

4. **Ownership leaks in skill run/schedule APIs**
   - Mitigation: enforce `user_id` + `character_id` checks in all mutations.

5. **Stats not updating for scheduler path**
   - Mitigation: centralize stats updates in task queue completion pipeline.

<!-- END_V1_IMPLEMENTATION_READY_ADDENDUM -->
