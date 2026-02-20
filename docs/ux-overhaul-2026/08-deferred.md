# 08 — Deferred Items (Future Sprint)

These topics came up in the meeting and are important, but are explicitly NOT part of the current implementation sprint. They are documented here so nothing is lost.

---

## D1 — Node Graph Workflow Editor

**Meeting quote:**
> "So what we need to make it better — we can think of how maybe ComfyUI handles this where they connect the nodes that will communicate with each other."

**What it is:** Replace the current dropdown-based workflow creation (select main agent, select sub-agents one by one) with a visual canvas editor where agents are nodes and connections are drag-drawn edges.

**Why deferred:** Major UI component requiring a canvas library (reactflow, d3, or custom SVG). Does not block any current feature.

**Prior art to reference:**
- [React Flow](https://reactflow.dev) — most established, good docs
- ComfyUI's node editor
- n8n's workflow builder

**Engineering blockers to resolve before starting:**

1. **Schema migration required.** The current schema has no position data. `agent_workflows` has only `id`, `userId`, `name`, `initiatorId`, `status`, `metadata`, timestamps. `agent_workflow_members` has only `workflowId`, `agentId`, `role`, `sourcePath`, `metadataSeed`. A migration adding a `layout` JSON column to `agent_workflows` (for canvas zoom/pan state) and a `position` JSON column to `agent_workflow_members` (for per-node x/y) is required.

2. **One-workflow-per-agent constraint.** `assertAgentNotInActiveWorkflow` (`lib/agents/workflows.ts:387`) throws if an agent is already in an active workflow. A node graph that allows the same agent node to appear in multiple canvases simultaneously requires removing or relaxing this constraint at the backend level.

3. **Existing CSS tree visualization.** Lines 1568-1611 in `character-picker.tsx` render an initiator-to-subagents tree with CSS borders. A canvas editor would either replace this in a new route (`/workflows/[id]`) or coexist — either way the current visualization needs a plan.

4. **Folder sync latency.** Connecting agents in the graph triggers `createManualWorkflow`/`addSubagentToWorkflow` which runs folder sync operations. The UI must account for this latency (loading state, or defer sync to an explicit "Apply" step).

**When to pick up:** After doc 01-06 home page UX stabilizes. Estimate: next major sprint.

---

## D2 — Plugin Marketplace Content

**Meeting quote:**
> "I think there is an opportunity to provide them with easy to install plugins — this might not be a hard task to just gather 300-500 folders of plugins from the internet."
> "Who coming to an agentic framework would expect plugins to work."

**What it is:** Populate the existing (currently empty) marketplace with real, curated plugins.

**Current state of the marketplace:**
- The marketplace UI and infrastructure exist
- The one-click "Install" button (`components/plugins/marketplace-browser.tsx` lines 175-178) is **stubbed** — it shows a toast instructing the user to manually download and upload the zip. The download-from-source pipeline (fetching from GitHub, URL, npm, pip) is not implemented. Engineering work is needed beyond "1-2 days to wire up an endpoint."

**Plugin format requirement for Duhan's content work:**
Plugins must conform to the Anthropic Claude Code plugin standard. Any content gathered from GitHub/AutoGPT/LangChain that lacks a `.claude-plugin/plugin.json` manifest or `SKILL.md` file will be **rejected** by the import parser. A conversion/wrapping step is needed for most "found" plugins.

**Catalog format for Duhan:** The marketplace catalog must be a valid `MarketplaceManifest` JSON object (defined in `lib/plugins/types.ts`). Deliver as a `marketplace.json` file, not a spreadsheet.

**Duhan's task (non-engineering):**
Research and compile a database of 50-100 initial plugins. For each entry in `marketplace.json`:
- `name` (string, required)
- `description` (1-2 sentences, optional but important for UI)
- `version` (optional)
- `category` (research / productivity / social / finance / code / image)
- `tags` (array, optional)
- `source` (GitHub URL or direct .zip URL)

**Engineering tasks before marketplace content can ship:**
1. Build the download-from-source pipeline (fetch zip from GitHub/URL → pipe to import parser)
2. Add auto-fetch mechanism (there is currently no cron/background job to update catalog)
3. Reserve a name for the Seline default marketplace (unique constraint on name per user)

**Sources for Duhan to research:**
- Claude Code's skill/slash command ecosystem
- GitHub public repositories tagged with relevant topics
- Agent frameworks: AutoGPT, CrewAI, LangChain tools
- Custom Seline skills created internally (Umut's use cases: researcher, worktree, social media bot, AI girlfriend agent, real estate analyzer)

**When to pick up:** Duhan can start content curation in parallel. Engineering pipeline: next sprint after current UX sprint.

---

## D3 — Agent-Driven Onboarding

**Meeting quote:**
> "What the talk is: we have a primary agent that is all preconfigured and user comes, starts chatting — and you will create the agent, you will set the tools, the agent will be persisted and ready to use in the future."
> "Is it going to be an agent-driven process or a human-driven process?"

**What it is:** A conversational onboarding where the user chats with a meta-agent ("Seline Setup") that asks questions and automatically creates a configured agent for them. No wizard UI at all.

**Prior art:** Claude's own onboarding, ChatGPT's "Create a GPT" flow.

**Engineering gaps larger than originally noted:**

1. **No agent-callable tools for creating agents.** The full tool registry (`lib/ai/tools.ts`) has no `createAgent`, `setAgentTools`, `setAgentSyncFolder`, or `setAgentSystemPrompt` tools. These must be authored from scratch before any meta-agent can build agents.

2. **The existing `quick-create` endpoint is not reusable.** It's a one-shot HTTP call using `generateObject`. An agent-driven flow requires multi-turn streaming chat via `POST /api/chat`.

3. **Security escalation risk.** An agent that can create agents and assign tools is a privilege escalation vector. Required mitigations before building:
   - Tool creation calls must require human-in-the-loop approval (similar to memory approval flow)
   - The meta-agent's own `enabledTools` must be restricted to agent-management tools only (no shell execution, no file write)
   - Default to a safe tool set for newly created agents; require explicit user confirmation before enabling file/network tools

**When to pick up:** After D2's download pipeline is built (pre-populated agents from marketplace make D3 compelling). Needs a detailed security spec before implementation begins.

---

## D4 — Unified Per-Agent Settings Hub

**Meeting quote:**
> "We should definitely combine the plugins, skills into a consistent page — both for customizing per-agents and both for seeing the marketplaces — manage them all in one place."
> "Currently if you go to edit one of them there is basic info, custom prompt — again all these are necessary but it should be put a bit further behind in a more unionized compact form."

**What it is:** A single `/agents/[id]/settings` page with tabs:
- Identity (name, tagline, purpose, avatar, system prompt)
- Tools (capabilities, MCP)
- Knowledge (sync folders, vector search)
- Skills & Plugins
- Memory
- Schedules

**Why deferred:** The backend data is already accessible via individual routes. The work is UI reorganization — complex but not urgent for launch.

**What actually exists today:**
- `app/agents/[id]/memory/page.tsx` ✓
- `app/agents/[id]/schedules/page.tsx` ✓
- `app/agents/[id]/skills/page.tsx` ✓
- `app/agents/[id]/page.tsx` ✗ (missing — no index page)
- `app/agents/[id]/settings/page.tsx` ✗ (missing)
- `app/agents/[id]/layout.tsx` ✗ (missing — no shared tab bar)

**Migration complexity:**
- Six separate dialogs in `character-picker.tsx` (tool editor, identity editor, folder manager, MCP, plugin, delete) would migrate into tabs
- Internal links from `chat-sidebar`, `thread.tsx`, `schedule-list.tsx` point to old routes — need redirects or updates
- `Knowledge` tab has no existing route — must be built from scratch
- `Skills & Plugins` tab has no existing route — must be built from scratch

**When to pick up:** After launch stabilizes. Estimate: 2-3 weeks post-launch.

---

## D5 — Sharing Use Cases & Demo Agents

**Meeting quote:**
> "We need screenshots, we need use case showcases, we need results, we need tests and we need comparisons with other agents."

**Known use cases to document:**
1. **Researcher agent** (Umut) — Codebase research + web research
2. **Git worktree parallel agent** (Umut) — Multiple tasks in parallel GitHub work trees
3. **AI persona agent** (Umut) — Personal assistant on phone, sends videos, has memory, assigns tasks
4. **Social media automation** (Umut) — Monitors social platforms, converses with users overnight
5. **Real estate analyzer** (Duhan) — Scrapes listings, analyzes images, renovation recommendations
6. **Meeting notes** — Transcribe + summarize meetings (template agent)

**Duhan's task:** Record screen demos of items 5 and 6. Write 2-3 sentence descriptions for each use case for website/social content.

**Engineering gap:** There is no shareable agent export format. An agent's full config (tools, sync folders, system prompt, memory, schedules) cannot be exported to a file without bundling it as a plugin. If the use-case page is meant to let users "clone" a demo agent, this feature must be built separately. The existing plugin import system (`app/api/plugins/import/route.ts`) supports `PluginAgentEntry` definitions, which could be used as a workaround.

There is also no `/examples` or `/use-cases` page in the app. Assets in `seline-web/` consist only of `README.md`, `index.html`, `demo.gif`. Building a use-cases gallery or landing page page is a separate project.

**When to pick up:** In parallel with launch preparation.

---

## D6 — Launch Plan (Non-Engineering)

**Meeting decisions:**
- Launch target: March 4, 2026 (Product Hunt day — see doc 09)
- Need: budget allocation, platform list, content assets

See `09-launch-marketing-plan.md` for the full launch plan with corrected details.

---

## Dependencies Between Deferred Items

| | D1 | D2 | D3 | D4 | D5 |
|---|---|---|---|---|---|
| **D1** | — | — | — | — | — |
| **D2** download pipeline | — | — | Enables D3 | — | — |
| **D3** | — | Benefits from D2 content | — | — | — |
| **D4** | — | — | — | — | — |
| **D5** | — | — | — | — | — |

D2's download pipeline is the highest-leverage deferred engineering task — it unblocks D3's compelling demo and makes the marketplace actually usable.
