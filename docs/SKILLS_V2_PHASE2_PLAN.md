# Seline Skills & Agent Discovery — V2 Phase 2 Plan

> **Date:** February 8, 2026  
> **Depends on:** V1 Phase 1 (docs/SKILLS_V1_DESIGN_PLAN.md)  
> **Goal:** Everything that was explicitly deferred from V1 — skill sharing, gamification, visual polish, smarter triggering, and the features that turn Seline from "functional" to "people want to share it on social media."

---

## What Phase 1 (V1) Completion Looks Like

Before Phase 2 starts, **all of this must be working:**

| V1 Deliverable | Status Check |
|----------------|-------------|
| `skills` table exists and has CRUD API routes | Can create, read, update, delete skills via `/api/skills/` |
| `createSkill` tool works in chat | User says "save as skill" → agent asks clickable questions → skill saved |
| `listSkills` tool works in chat | User says "what are my skills?" → agent lists them |
| `runSkill` tool works in chat | User says "run my weekly report skill" → agent executes it |
| Skills injected into system prompt | Agent sees skill names+descriptions automatically |
| Skill → Schedule bridge works | User can schedule a skill and it runs via existing scheduler |
| Template system enhanced | 3-5 templates ship with the app (extends existing `lib/characters/templates/`) |
| Auto-create default agent | First-time users get "Seline" agent automatically (already exists!) |
| Skills tab in Agent Settings | Users can see and manage their agent's skills |
| Template browser in Agent Picker | Users can "hire" pre-built agents |

**If any of the above is broken or incomplete, fix it before starting Phase 2.**

---

## What We Discovered: More Exists Than We Thought

During the audit for this plan, we found that the **template system already exists** and is more mature than assumed:

| What | Where | Status |
|------|-------|--------|
| Template type definitions | `lib/characters/templates/types.ts` | ✅ Working |
| Template registry with Map | `lib/characters/templates/index.ts` | ✅ Working |
| Default "Seline" template | `lib/characters/templates/seline-default.ts` | ✅ Working |
| Auto-create default agent on first launch | `ensureDefaultAgentExists()` | ✅ Working |
| `createAgentFromTemplate()` function | `lib/characters/templates/index.ts` | ✅ Working |
| Template memory seeding | `seedTemplateMemories()` | ✅ Working |
| Template sync folder configuration | `configureSyncFolders()` | ✅ Working |
| Platform context memories | `lib/characters/templates/platform-memories.ts` | ✅ Working |

**This means V1's "template" work is mostly adding new template files to the existing system, not building a template system from scratch.** Phase 2 can build on this directly.

---

## Phase 2 Overview: What Are We Building?

Phase 2 has **5 tracks** that can be worked on somewhat in parallel:

```
┌─────────────────────────────────────────────────────────────┐
│                     PHASE 2 TRACKS                           │
│                                                               │
│  Track A: Smarter Skills (Week 1-2)                          │
│  → Auto-triggering, better extraction, skill improvement     │
│                                                               │
│  Track B: Skill Sharing (Week 1-2)                           │
│  → Copy skills between agents, skill library                 │
│                                                               │
│  Track C: Agent Gamification (Week 2-3)                      │
│  → Agent cards with stats, performance tracking              │
│                                                               │
│  Track D: Template Expansion (Week 2-3)                      │
│  → More templates, server-based registry, community          │
│                                                               │
│  Track E: Visual Skill Builder (Week 3-4)                    │
│  → Optional visual flow view, skill editing UI               │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Track A: Smarter Skills (Week 1-2)

### What This Solves

In V1, skill creation is basic: the agent extracts a prompt template and saves it. In V2, we make skills **smarter** — they trigger automatically, improve over time, and the extraction is more accurate.

### A1. Auto-Triggering (Skill Matching)

**The problem:** In V1, the user has to explicitly say "run my skill" or the skill has to be scheduled. In V2, the agent should **automatically recognize** when a user's request matches a skill and use it.

**How it works:**

The skill `description` field (which already exists in the V1 schema) is the trigger. When a user sends a message:

1. The agent already sees skill names + descriptions in the system prompt (V1)
2. We add a small instruction block telling the agent: *"If a user's request matches one of your skills, use the `runSkill` tool to execute it instead of doing the task from scratch"*
3. The agent decides whether to use the skill or handle it fresh

**What to build:**

| Task | File | Effort |
|------|------|--------|
| Add skill-matching instruction to system prompt | `lib/ai/character-prompt.ts` | Small |
| Enhance `formatSkillsForPrompt()` to include trigger examples | `lib/skills/prompt-injection.ts` (new) | Small |
| Add `triggerExamples` field to skills table | Migration | Small |
| Update `createSkill` tool to ask "what kinds of requests should trigger this?" | `lib/ai/tools/create-skill-tool.ts` | Medium |

**Example of enhanced prompt injection:**

```
## Your Skills

When a user's request matches one of these skills, use the runSkill tool.

- ⚡ **Weekly Competitor Check** — Use when: user asks about competitors, market updates, or competitive analysis
- ⚡ **AI News Summary** — Use when: user asks for news, weekly digest, or industry updates
- ⚡ **Draft Cold Email** — Use when: user asks to write outreach, cold emails, or sales messages
```

**Success criteria:** User says "what's new with our competitors?" → agent automatically uses the "Weekly Competitor Check" skill without being told.

---

### A2. Skill Improvement Loop

**The problem:** Skills are static after creation. If the user gives feedback ("that was too long" or "add more detail"), the skill doesn't learn.

**How it works:**

After a skill runs, the agent asks: *"How was that? Want me to update the skill?"* If the user gives feedback, the agent updates the skill's `prompt_template` with the improvement.

**What to build:**

| Task | File | Effort |
|------|------|--------|
| Add `updateSkill` tool (agent-callable) | `lib/ai/tools/update-skill-tool.ts` (new) | Medium |
| Register in tool definitions | `lib/ai/tool-registry/tool-definitions.ts` | Small |
| Add `version` column to skills table | Migration | Small |
| Store previous versions in `skill_versions` table (optional) | `lib/db/sqlite-skills-schema.ts` | Medium |
| Post-execution feedback prompt | System prompt update | Small |

**Success criteria:** User runs skill → gives feedback → agent updates skill → next run uses improved version.

---

### A3. Better Skill Extraction from Chat

**The problem:** V1 extraction is basic — the agent guesses what to save. V2 makes this smarter by analyzing the actual tool calls that happened during the conversation.

**How it works:**

When the user says "save as skill," the `createSkill` tool now:
1. Queries the current session's messages to find recent tool calls
2. Extracts which tools were used and in what order
3. Identifies what was the user's input vs. what was dynamic
4. Generates a better `prompt_template` with accurate `tool_hints`

**What to build:**

| Task | File | Effort |
|------|------|--------|
| Add session message analysis to `createSkill` tool | `lib/ai/tools/create-skill-tool.ts` | Medium |
| Query recent tool calls from messages table | `lib/skills/extraction.ts` (new) | Medium |
| Extract variable patterns from tool call parameters | `lib/skills/extraction.ts` | Medium |

**Success criteria:** User does a complex 5-step task → says "save as skill" → the saved skill accurately captures all 5 steps including which tools to use.

---

## Track B: Skill Sharing Between Agents (Week 1-2)

### What This Solves

Duhan said: *"It can give that to other agents but be careful about volume of exchanges."* Users should be able to copy a skill from Agent A to Agent B.

### B1. Copy Skill to Another Agent

**How it works:**

Simple copy operation. No shared references (that's too complex). When you "share" a skill, it creates a **new copy** owned by the target agent.

**What to build:**

| Task | File | Effort |
|------|------|--------|
| `POST /api/skills/:id/copy` endpoint | `app/api/skills/[id]/copy/route.ts` (new) | Small |
| Accept `targetCharacterId` in body | Same | Small |
| UI: "Copy to..." button in Skills list | `components/agent-settings/skills-tab.tsx` | Medium |
| Agent picker dropdown for target selection | Same component | Small |
| `copySkill` tool (agent-callable) | `lib/ai/tools/copy-skill-tool.ts` (new) | Medium |

**Key constraint (per Duhan):** No real-time sync between copies. If you update the original, the copy doesn't change. This keeps it simple and avoids "volume of exchanges" issues.

**Success criteria:** User says "give my newsletter skill to the Content Writer agent" → skill is copied → Content Writer agent now has it.

---

### B2. Skill Library View

**The problem:** Once you have skills across multiple agents, you need a way to see all of them.

**How it works:**

A new page/panel: "My Skills" — shows all skills across all agents, filterable by agent.

**What to build:**

| Task | File | Effort |
|------|------|--------|
| `GET /api/skills?all=true` endpoint (cross-agent) | `app/api/skills/route.ts` | Small |
| Skills library page/panel | `components/skills/skill-library.tsx` (new) | Medium |
| Filter by agent, category, status | Same | Small |
| Locale strings | `locales/en.json` | Small |

**Success criteria:** User can see all their skills in one place, filter by agent, and copy skills between agents from this view.

---

## Track C: Agent Gamification — Lite (Week 2-3)

### What This Solves

Jordan's vision: *"your team doing tasks for you, improve them, recruit new."*
Duhan's constraint: *"try to be simple, be ready for new version."*

### C1. Agent Cards with Stats

**The problem:** Agent cards in the picker show name + tagline only. They should show what the agent has been doing.

**How it works:**

Each agent card shows:
- Number of skills
- Total runs this week/month
- Success rate
- "Active since" date
- Last active timestamp

**What to build:**

| Task | File | Effort |
|------|------|--------|
| `GET /api/characters/:id/stats` endpoint | `app/api/characters/[id]/stats/route.ts` (new) | Medium |
| Query skills count, run count, success rate from DB | Same | Medium |
| Enhanced agent card component | `components/character-picker/` (existing) | Medium |
| Show stats on hover or always-visible | Same | Small |
| Locale strings for stats | `locales/en.json` | Small |

**Example card:**

```
┌─────────────────────────────────────┐
│  🎯 Lead Gen Assistant              │
│  "Finds and qualifies leads"        │
│                                      │
│  ⚡ 3 skills  │  📊 47 runs          │
│  ✅ 94% success │  🕐 Active 2 weeks │
└─────────────────────────────────────┘
```

**Success criteria:** Agent picker shows meaningful stats that make users feel their agents are "working for them."

---

### C2. Agent Performance Dashboard (Simple)

**The problem:** No way to see what your agents have been doing at a glance.

**How it works:**

A simple dashboard accessible from the sidebar or agent picker that shows:
- All agents with their stats
- Recent skill executions (last 10)
- Upcoming scheduled runs (next 5)

This is NOT the full "Team Dashboard" — it's a lightweight view using existing data.

**What to build:**

| Task | File | Effort |
|------|------|--------|
| Dashboard page | `app/dashboard/page.tsx` or panel component | Medium |
| Recent executions query | Query `scheduled_task_runs` table | Small |
| Upcoming runs query | Query `scheduled_tasks` where `nextRunAt` > now | Small |
| Sidebar link | Sidebar component update | Small |

**Success criteria:** User opens dashboard → sees all agents + what they've done recently + what's coming up. Takes 2 seconds to understand.

---

## Track D: Template Expansion (Week 2-3)

### What This Solves

V1 ships 3-5 templates. V2 makes the template system richer and prepares for server-based distribution.

### D1. More Templates (5-10 additional)

**How it works:**

Add new template files to `lib/characters/templates/` following the existing pattern. Each template includes:
- Name, tagline, purpose
- Default tools
- Pre-seeded memories
- Example skills (new in V2 — skills that come with the template)

**New templates to create:**

| Template | Category | Key Tools |
|----------|----------|-----------|
| Social Media Manager | marketing | webSearch, webBrowse, scheduleTask |
| Meeting Notes Assistant | productivity | speakAloud, transcribe, scheduleTask |
| Data Analyst | analytics | calculator, webBrowse, executeCommand |
| Customer Support Agent | support | docsSearch, webSearch |
| Personal Finance Tracker | personal | calculator, webSearch, scheduleTask |
| Learning Coach | education | webSearch, webBrowse |
| Project Manager | productivity | updatePlan, scheduleTask, webSearch |

**What to build:**

| Task | File | Effort |
|------|------|--------|
| 7 new template files | `lib/characters/templates/*.ts` | Medium |
| Register in TEMPLATES map | `lib/characters/templates/index.ts` | Small |
| Add `exampleSkills` to AgentTemplate type | `lib/characters/templates/types.ts` | Small |
| Seed example skills when template is "hired" | `lib/characters/templates/index.ts` → `createAgentFromTemplate()` | Medium |

**Success criteria:** User opens agent picker → sees 8-12 template options across categories → hires one → gets a fully configured agent with pre-loaded skills.

---

### D2. Template Categories & Browsing UI

**The problem:** With 10+ templates, you need categories and search.

**What to build:**

| Task | File | Effort |
|------|------|--------|
| Add `category` field to AgentTemplate type | `lib/characters/templates/types.ts` | Small |
| Category filter in template browser | Agent picker component | Medium |
| Search/filter templates | Same | Small |
| Category icons/colors | Same | Small |

**Categories:** Productivity, Sales, Marketing, Creative, Analytics, Personal, Support

---

### D3. Server-Based Template Registry (Preparation)

**Per Duhan:** *"Offline for first steps, server if volume is high."*

**What to build now (preparation only, don't ship):**

| Task | File | Effort |
|------|------|--------|
| Define template JSON export format | `lib/characters/templates/format.ts` (new) | Small |
| `GET /api/templates/remote` stub endpoint | `app/api/templates/remote/route.ts` (new) | Small |
| Template version field for update detection | Type update | Small |

**This is NOT active in V2.** We're just making sure the data format supports remote distribution so V3 doesn't require a rewrite.

---

## Track E: Visual Skill Builder (Week 3-4)

### What This Solves

Jordan's "record a flow" vision. Duhan said: *"If it's fast to build, good. If not, fine."*

### E1. Skill Detail/Edit View

**The problem:** V1 skills are created in chat and managed as a list. Users need a way to view and edit skill details.

**What to build:**

| Task | File | Effort |
|------|------|--------|
| Skill detail panel/page | `components/skills/skill-detail.tsx` (new) | Medium |
| Edit prompt template | Same | Medium |
| Edit variables | Same | Medium |
| Edit tool hints (checkboxes from tool registry) | Same | Medium |
| Test run button ("run now") | Same | Small |
| Execution history for this skill | Same | Medium |

**Success criteria:** User clicks a skill → sees full details → can edit any part → can test run it → can see past executions.

---

### E2. Skill Steps Visualization (Optional — only if fast)

**The problem:** Users can't "see" what a skill does. A visual representation would help.

**How it works:**

NOT a node-based editor. Just a **read-only step visualization** that shows the skill's tool chain as a simple flow:

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│ 🔍 Web   │ ──→ │ 🌐 Browse│ ──→ │ 📝 Write │
│  Search  │     │  Results │     │  Summary │
└──────────┘     └──────────┘     └──────────┘
```

**What to build:**

| Task | File | Effort |
|------|------|--------|
| Step flow component | `components/skills/skill-flow.tsx` (new) | Medium |
| Parse tool_hints into visual steps | Same | Small |
| Show in skill detail view | Integration | Small |

**Decision point:** If this takes more than 3 days, skip it for V2. The skill detail view (E1) is the priority.

---

## Database Changes for Phase 2

### Modify `skills` table (from V1)

```sql
-- New columns for Phase 2
ALTER TABLE skills ADD COLUMN trigger_examples TEXT DEFAULT '[]';  -- JSON: ["when user asks about X", ...]
ALTER TABLE skills ADD COLUMN version INTEGER DEFAULT 1;
ALTER TABLE skills ADD COLUMN category TEXT DEFAULT 'general';
ALTER TABLE skills ADD COLUMN copied_from_skill_id TEXT REFERENCES skills(id) ON DELETE SET NULL;
ALTER TABLE skills ADD COLUMN copied_from_character_id TEXT REFERENCES characters(id) ON DELETE SET NULL;
```

### New table: `skill_versions` (optional, for Track A2)

```sql
CREATE TABLE skill_versions (
  id              TEXT PRIMARY KEY,
  skill_id        TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  version         INTEGER NOT NULL,
  prompt_template TEXT NOT NULL,
  input_parameters TEXT DEFAULT '[]',
  tool_hints      TEXT DEFAULT '[]',
  change_reason   TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);
```

### Modify `AgentTemplate` type

```typescript
// lib/characters/templates/types.ts — additions
export interface AgentTemplateSkill {
  name: string;
  description: string;
  promptTemplate: string;
  inputParameters: { name: string; type: string; default?: string }[];
  toolHints: string[];
}

export interface AgentTemplate {
  // ... existing fields ...
  category?: string;                    // NEW
  exampleSkills?: AgentTemplateSkill[]; // NEW
}
```

---

## New Tools for Phase 2

### Tool: `updateSkill` (Track A2)

```
Location: lib/ai/tools/update-skill-tool.ts
Registry: tool-definitions.ts (category: "utility", deferred)
Input: { skillId | skillName, updates: { promptTemplate?, description?, toolHints? }, reason }
```

### Tool: `copySkill` (Track B1)

```
Location: lib/ai/tools/copy-skill-tool.ts
Registry: tool-definitions.ts (category: "utility", deferred)
Input: { skillId | skillName, targetCharacterId | targetAgentName }
```

---

## Week-by-Week Build Order

### Week 1: Smarter Skills + Sharing Foundation

| Day | Track | Task | Files |
|-----|-------|------|-------|
| Mon | A1 | Add trigger_examples to skills schema + migration | `lib/db/sqlite-skills-schema.ts` |
| Mon | A1 | Update `formatSkillsForPrompt()` with trigger matching instructions | `lib/skills/prompt-injection.ts` |
| Tue | A3 | Build skill extraction from session messages | `lib/skills/extraction.ts` |
| Tue | A3 | Enhance `createSkill` tool to analyze recent tool calls | `lib/ai/tools/create-skill-tool.ts` |
| Wed | A2 | Build `updateSkill` tool | `lib/ai/tools/update-skill-tool.ts` |
| Wed | A2 | Add version column + skill_versions table | Migration |
| Thu | B1 | Build `POST /api/skills/:id/copy` endpoint | `app/api/skills/[id]/copy/route.ts` |
| Thu | B1 | Build `copySkill` tool | `lib/ai/tools/copy-skill-tool.ts` |
| Fri | B2 | Build cross-agent skills query endpoint | `app/api/skills/route.ts` |
| Fri | -- | Testing: auto-trigger, extraction, copy flows | Tests |

### Week 2: Gamification + Templates

| Day | Track | Task | Files |
|-----|-------|------|-------|
| Mon | C1 | Build agent stats endpoint | `app/api/characters/[id]/stats/route.ts` |
| Mon | C1 | Enhanced agent card with stats | Character picker components |
| Tue | C2 | Simple dashboard page | `app/dashboard/page.tsx` |
| Tue | C2 | Recent executions + upcoming runs queries | Same |
| Wed | D1 | Create 3-4 new template files | `lib/characters/templates/` |
| Wed | D1 | Add exampleSkills to template type + seeding | Type + `createAgentFromTemplate()` |
| Thu | D1 | Create 3-4 more template files | `lib/characters/templates/` |
| Thu | D2 | Category filter in template browser | Agent picker component |
| Fri | -- | Locale strings for all new UI | `locales/en.json` |
| Fri | -- | Testing: stats, dashboard, templates | Tests |

### Week 3: Visual Polish + Integration

| Day | Track | Task | Files |
|-----|-------|------|-------|
| Mon | E1 | Skill detail/edit panel | `components/skills/skill-detail.tsx` |
| Tue | E1 | Edit prompt template, variables, tool hints | Same |
| Wed | E1 | Execution history per skill | Same |
| Wed | E1 | "Run now" test button | Same |
| Thu | B2 | Skill library view (all skills across agents) | `components/skills/skill-library.tsx` |
| Thu | E2 | Skill steps visualization (if time allows) | `components/skills/skill-flow.tsx` |
| Fri | -- | End-to-end testing all Phase 2 features | Tests |
| Fri | -- | Polish, bug fixes, documentation | Various |

### Week 4 (Buffer)

| Task | Notes |
|------|-------|
| Overflow from weeks 1-3 | Anything that slipped |
| User testing feedback | Deploy to test users, collect feedback |
| Performance optimization | Skill loading speed, prompt size |
| Documentation update | Update `docs/AI_PIPELINES.md` with skills system |
| D3 preparation | Template export format for future server registry |

---

## Success Criteria for Phase 2

### Must Have (Phase 2 is not done without these)

- [ ] Skills auto-trigger when user's request matches a skill description
- [ ] Users can update/improve skills after execution
- [ ] Users can copy skills between their agents
- [ ] Agent cards show meaningful stats (skills count, run count, success rate)
- [ ] 8-12 agent templates available with categories
- [ ] Templates include pre-built example skills
- [ ] Skill detail view with edit capability

### Nice to Have (do if time allows)

- [ ] Skill library view across all agents
- [ ] Simple dashboard with recent/upcoming executions
- [ ] Visual skill steps flow
- [ ] Skill versioning history
- [ ] Template search/filter

### Explicitly NOT in Phase 2

- ❌ Multi-agent skill chains (Agent A output → Agent B input) — V3
- ❌ Server-based template marketplace — V3
- ❌ Heavy gamification (XP, levels, badges, leaderboards) — V3
- ❌ n8n/Make integration — V3
- ❌ Visual node-based skill editor (drag-and-drop) — V3
- ❌ Skill marketplace (share with other users) — V3

---

## Key Principle (Repeated from Duhan)

> *"V1 is for us to understand how people want something. Through this feedback we will make the next iteration. Try to be simple, easy, and be ready for new version."*

Phase 2 follows the same philosophy: **add the features users asked for after V1, stay flexible, don't over-commit.** Every feature here should be shippable independently — if Track E slips, Tracks A-D still ship.
