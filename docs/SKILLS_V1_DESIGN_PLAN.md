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
| **UI location** | Agent Settings → Memory | Agent Settings → Skills |

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

Available from: Agent Settings → Skills → "+ New Skill"

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
| **Offline first** | Templates ship as JSON files bundled with the app (`data/templates/*.json`) |
| **Users get a full copy** | "Hire" = clone template → user owns it → can change name, add skills, add knowledge |
| **Auto-create "You" on first launch** | On first boot, create a default personal assistant agent automatically |
| **Server-based later** | Template sync from server is a v2 feature when volume grows |

### Template Format (JSON)

Each template file looks like:

```json
{
  "slug": "lead-gen-assistant",
  "name": "Lead Gen Assistant",
  "tagline": "Finds and qualifies potential customers",
  "purpose": "Help users find leads by searching the web, analyzing company profiles, and creating outreach drafts.",
  "icon": "🎯",
  "category": "sales",
  "defaultTools": ["webSearch", "webBrowse", "scheduleTask"],
  "requiredIntegrations": [],
  "exampleUseCases": [
    "Find 10 SaaS companies in Berlin with under 50 employees",
    "Research a company before a sales call",
    "Draft a cold outreach email"
  ],
  "exampleSkills": [
    {
      "name": "Weekly Lead Search",
      "description": "Search for new companies matching your criteria every week",
      "promptTemplate": "Search the web for {{industry}} companies in {{location}} that match these criteria: {{criteria}}. Create a list with company name, website, size, and why they're a good fit.",
      "inputParameters": [
        {"name": "industry", "type": "text", "default": "SaaS"},
        {"name": "location", "type": "text", "default": ""},
        {"name": "criteria", "type": "text", "default": "under 50 employees, B2B"}
      ],
      "toolHints": ["webSearch", "webBrowse"]
    }
  ]
}
```

### V1 Templates to Ship (3-5)

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

### New Table: `agent_templates`

```sql
CREATE TABLE agent_templates (
  id              TEXT PRIMARY KEY,
  slug            TEXT UNIQUE NOT NULL,

  -- Identity
  name            TEXT NOT NULL,
  tagline         TEXT,
  purpose         TEXT NOT NULL,
  icon            TEXT,
  category        TEXT DEFAULT 'general',

  -- Config
  default_tools   TEXT DEFAULT '[]',    -- JSON: tool IDs
  example_skills  TEXT DEFAULT '[]',    -- JSON: SkillTemplate[]
  example_use_cases TEXT DEFAULT '[]',  -- JSON: string[]

  -- Display
  is_featured     INTEGER DEFAULT 0,
  sort_order      INTEGER DEFAULT 0,

  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);
```

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
| Create `skills` table + migration | Small | Follow `sqlite-schedule-schema.ts` pattern |
| Create `agent_templates` table + migration | Small | Simple table |
| Create CRUD API routes for skills | Medium | `app/api/skills/` — GET, POST, PATCH, DELETE |
| Create `createSkill` tool | Medium | Follow `schedule-task-tool.ts` pattern exactly |
| Create `listSkills` tool | Small | Query skills table, return formatted list |
| Add `skillId` column to `scheduled_tasks` | Small | Migration + update schedule-task-tool |
| Ship 3-5 template JSON files | Small | `data/templates/` folder |
| Template seeding on first boot | Medium | Load JSONs → insert into `agent_templates` |
| Auto-create "You" agent on first launch | Medium | Check if user has agents, create default if not |

### Week 2: UX & Integration

| Task | Effort | Details |
|------|--------|---------|
| `formatSkillsForPrompt()` function | Medium | Inject skill names+descriptions into system prompt |
| Skill creation flow in chat (clickable options) | Medium | Agent asks 2-3 questions with button options |
| `runSkill` tool | Medium | Execute a skill on demand |
| Skills list in Agent Settings UI | Medium | New tab: "Skills" alongside existing Memory tab |
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
> 3. Say "save this as a skill" → agent asks 2-3 quick questions → done
> 4. Say "run this every Monday" → it's scheduled
> 5. Results show up in chat, Slack, WhatsApp, or email
>
> The whole experience should be so clean that users want to screenshot it and share on social media.
