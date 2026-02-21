/**
 * Tool Definitions
 *
 * Register all tools with the ToolRegistry along with their metadata.
 * This centralizes tool configuration and enables the Tool Search pattern.
 *
 * LOADING STRATEGY (optimized for token efficiency):
 * - alwaysLoad: true  → Core tools that must always be available:
 *   - searchTools, listAllTools: Required for discovering other tools
 *   - compactSession: Explicit agent-controlled context compaction
 *   - describeImage: Essential for virtual try-on workflows
 * - deferLoading: true → All other tools (discovered on-demand via searchTools)
 *
 * CRITICAL: searchTools and listAllTools MUST have alwaysLoad: true.
 * Without them, the AI cannot discover other tools and will output raw
 * function call syntax as plain text instead of executing tools.
 *
 * This saves ~2,500 tokens per request by deferring tool descriptions until needed.
 * Tools are discoverable via searchTools and loaded dynamically when the AI needs them.
 */

import { tool, jsonSchema } from "ai";
import { ToolRegistry } from "./registry";
import type { ToolMetadata } from "./types";
import { createToolSearchTool, createListToolsTool } from "./search-tool";
import {
  createImageEditTool,
  createDescribeImageTool,
  createFlux2GenerateTool,
  createWan22ImagenTool,
  createWan22VideoTool,
  createWan22PixelVideoTool,
  createVideoAssemblyTool,
  createDocsSearchTool,
  createRetrieveFullContentTool,
  // OpenRouter Image Tools
  createOpenRouterFlux2FlexGenerate,
  createOpenRouterFlux2FlexEdit,
  createOpenRouterFlux2FlexReference,
  createOpenRouterGpt5ImageMiniGenerate,
  createOpenRouterGpt5ImageMiniEdit,
  createOpenRouterGpt5ImageMiniReference,
  createOpenRouterGpt5ImageGenerate,
  createOpenRouterGpt5ImageEdit,
  createOpenRouterGpt5ImageReference,
  createOpenRouterGemini25FlashImageGenerate,
  createOpenRouterGemini25FlashImageEdit,
  createOpenRouterGemini25FlashImageReference,
  createOpenRouterGemini3ProImageGenerate,
  createOpenRouterGemini3ProImageEdit,
  createOpenRouterGemini3ProImageReference,
} from "../tools";
import { createWebSearchTool } from "../web-search";
import { createVectorSearchToolV2 } from "../vector-search";
import { createReadFileTool } from "../tools/read-file-tool";
import { createFirecrawlCrawlTool } from "../firecrawl";
import { createWebBrowseTool, createWebQueryTool } from "../web-browse";
import { createLocalGrepTool } from "../ripgrep";
import { createExecuteCommandTool } from "../tools/execute-command-tool";
import { createEditFileTool } from "../tools/edit-file-tool";
import { createWriteFileTool } from "../tools/write-file-tool";
import { createPatchFileTool } from "../tools/patch-file-tool";
import { createZImageGenerateTool } from "../tools/zimage-generate-tool";
import {
  createFlux2Klein4BGenerateTool,
  createFlux2Klein4BEditTool,
  createFlux2Klein4BReferenceTool,
} from "../tools/flux2-klein-4b-generate-tool";
import {
  createFlux2Klein9BGenerateTool,
  createFlux2Klein9BEditTool,
  createFlux2Klein9BReferenceTool,
} from "../tools/flux2-klein-9b-generate-tool";
import { createScheduleTaskTool } from "../tools/schedule-task-tool";
import { createRunSkillTool } from "../tools/run-skill-tool";
import { createUpdateSkillTool } from "../tools/update-skill-tool";
import { createMemorizeTool } from "../tools/memorize-tool";
import { createCalculatorTool } from "../tools/calculator-tool";
import { createUpdatePlanTool } from "../tools/update-plan-tool";
import { createSpeakAloudTool } from "../tools/speak-aloud-tool";
import { createTranscribeTool } from "../tools/transcribe-tool";
import { createSendMessageToChannelTool } from "../tools/channel-tools";
import { createDelegateToSubagentTool } from "../tools/delegate-to-subagent-tool";
import { createCompactSessionTool } from "../tools/compact-session-tool";
import { createWorkspaceTool } from "../tools/workspace-tool";

/**
 * Register all tools with the registry
 * Call this once during app initialization
 */
export function registerAllTools(): void {
  const registry = ToolRegistry.getInstance();

  // ============================================================
  // CORE UTILITY TOOLS - Always loaded (required for tool discovery)
  // ============================================================

  // Tool Search - MUST be alwaysLoad to enable tool discovery
  registry.register(
    "searchTools",
    {
      displayName: "Search Tools",
      category: "utility",
      keywords: [
        "search",
        "discover",
        "tools",
        "capabilities",
        "list",
        "exploration",
      ],
      shortDescription:
        "Search for available tools and discover capabilities like image generation or docs search",
      loading: { alwaysLoad: true }, // CRITICAL: Must always be available to discover other tools
      requiresSession: false,
    } satisfies ToolMetadata,
    () => createToolSearchTool()
  );

  // List All Tools - Deferred for token efficiency (discover via searchTools)
  registry.register(
    "listAllTools",
    {
      displayName: "List All Tools",
      category: "utility",
      keywords: ["list", "tools", "catalog", "capabilities", "inventory", "all tools", "exploration"],
      shortDescription:
        "List all available tools organized by category with availability status",
      loading: { deferLoading: true }, // Optimized: Discoverable via searchTools
      requiresSession: false,
    } satisfies ToolMetadata,
    () => createListToolsTool()
  );

  // Retrieve Full Content - allows AI to access full untruncated content
  // This tool is always loaded because truncation notices reference it directly
  registry.register(
    "retrieveFullContent",
    {
      displayName: "Retrieve Full Content",
      category: "utility",
      keywords: [
        "retrieve",
        "full",
        "content",
        "truncated",
        "expand",
        "complete",
        "text",
      ],
      shortDescription:
        "⚠️ NOT for file reading! Only retrieves truncated content with trunc_XXXXXXXX IDs. Use readFile for actual files.",
      loading: { deferLoading: true }, // Only visible when truncation occurs in session
      requiresSession: true, // Requires session to retrieve stored content
    } satisfies ToolMetadata,
    // Placeholder factory - real instance with sessionId is created in chat route
    () =>
      createRetrieveFullContentTool({
        sessionId: "UNSCOPED",
      })
  );

  // Compact Session - explicit, agent-controlled context compaction
  registry.register(
    "compactSession",
    {
      displayName: "Compact Session",
      category: "utility",
      keywords: [
        "compact",
        "compaction",
        "context",
        "context window",
        "token budget",
        "summarize history",
        "free tokens",
      ],
      shortDescription:
        "Run explicit session compaction to free context tokens before long workflows",
      loading: { alwaysLoad: true },
      requiresSession: true,
    } satisfies ToolMetadata,
    ({ sessionId }) =>
      createCompactSessionTool({
        sessionId: sessionId || "UNSCOPED",
      })
  );

  // Agent Docs Search (configurable per-agent - knowledge feature)
  registry.register(
    "docsSearch",
    {
      displayName: "Search Agent Documents",
      category: "knowledge",
      keywords: [
        "docs",
        "documents",
        "knowledge",
        "pdf",
        "markdown",
        "html",
        "rag",
        "manual",
        "policy",
      ],
      shortDescription:
        "Search an agent's attached documents and knowledge base for relevant passages",
      loading: { deferLoading: true },
      // Requires an agent/user context to be meaningful, but can exist without a session
      requiresSession: false,
    } satisfies ToolMetadata,
    // NOTE: This factory creates a placeholder instance without user/agent context.
    // The chat route instantiates a fully scoped docsSearch tool with userId/characterId
    // for actual use. Here we only need a concrete tool instance so it appears in
    // the registry and can be discovered via searchTools/listAllTools.
    () =>
      createDocsSearchTool({
        userId: "UNSCOPED",
        characterId: null,
      })
  );

  // Vector Search Tool V2 (LLM-powered intelligent search over synced folders)
  registry.register(
    "vectorSearch",
    {
      displayName: "Vector Search (AI-Powered)",
      category: "knowledge",
      keywords: [
        "vector",
        "vectorSearch",
        "semantic",
        "search",
        "similarity",
        "embeddings",
        "folders",
        "files",
        "local",
        "rag",
        "lancedb",
        "code",
        "codebase",
        "intelligent",
        "exploration",
        "analysis",
        "structure",
        "file structure",
        "hierarchy",
        "tree",
        // Cross-category keywords for better discovery
        "grep",
        "find",
        "locate",
        "project",
        "source",
      ],
      shortDescription:
        "Intelligent semantic search across your codebase with AI-powered result synthesis",
      fullInstructions: `## Vector Search (AI-Powered Codebase Search)

Semantic + keyword hybrid search with AI synthesis. Finds code by concept, not just text.

**Query format:** Always phrase as a short question with keywords.
- Good: "Where is getUserById implemented?" / "How are errors handled in API routes?"
- Bad: "getUserById" (bare keyword) or "database issue" (vague)
- Max 5 searches per request; stop once you have context.

**Tips:**
- Default maxResults=50 is fastest; increase to 150 only for broad coverage
- Higher minScore = more precise, fewer results
- Use follow-up questions to refine; check suggested refinements`,
      loading: { deferLoading: true },
      requiresSession: true,  // Needs session for LLM synthesis
    } satisfies ToolMetadata,
    ({ sessionId }) =>
      createVectorSearchToolV2({
        sessionId: sessionId || "UNSCOPED",
        userId: "UNSCOPED",
        characterId: null,
      })
  );

  // Read File Tool (read files from Knowledge Base documents or synced folders)
  registry.register(
    "readFile",
    {
      displayName: "Read File",
      category: "knowledge",
      keywords: [
        "read",
        "file",
        "content",
        "source",
        "code",
        "full",
        "context",
        "lines",
        "import",
        "export",
        "follow",
        "document",
        "knowledge",
        "pdf",
        "markdown",
        "analysis",
        "codebase",
      ],
      shortDescription:
        "Read full file content from Knowledge Base documents or synced folders",
      fullInstructions: `## Read File

Read full file content or line ranges from Knowledge Base docs or synced folders.

**Sources:** Knowledge Base (PDFs, Markdown, HTML by filename/title) and synced folders (paths from vectorSearch).
**Limits:** Max 1MB / 5000 lines. Use startLine/endLine for larger files.

**When to use:** After vectorSearch/docsSearch finds snippets and you need full context, or to follow imports/exports.`,
      loading: { deferLoading: true },
      requiresSession: true,
    } satisfies ToolMetadata,
    ({ sessionId }) =>
      createReadFileTool({
        sessionId: sessionId || "UNSCOPED",
        userId: "UNSCOPED",
        characterId: null,
      })
  );

  // Local Grep Tool (ripgrep - fast exact/regex pattern search)
  registry.register(
    "localGrep",
    {
      displayName: "Local Grep (ripgrep)",
      category: "knowledge",
      keywords: [
        "grep",
        "localGrep",
        "local grep",
        "search",
        "pattern",
        "regex",
        "exact",
        "ripgrep",
        "find",
        "text",
        "code",
        "literal",
        "rg",
        "match",
        "string",
        "analysis",
        "exploration",
        "scan",
        "codebase",
        "file search",
        "code search",
      ],
      shortDescription:
        "Fast exact or regex pattern search across files using ripgrep",
      fullInstructions: `## Local Grep (ripgrep)

Fast EXACT text/regex search. Use for function names, imports, symbol tracing, specific patterns.
Use vectorSearch instead for conceptual/intent-based queries where you don't know exact wording.

Start narrow to avoid noisy output: set specific \`paths\`/\`fileTypes\`, keep \`maxResults\` near 20, then expand only if needed.

**Examples:** \`localGrep({ pattern: "getUserById", maxResults: 20 })\` / \`localGrep({ pattern: "async.*await", regex: true, fileTypes: ["ts", "tsx"], maxResults: 20 })\``,
      loading: { deferLoading: true },
      requiresSession: true,
    } satisfies ToolMetadata,
    ({ sessionId }) =>
      createLocalGrepTool({
        sessionId: sessionId || "UNSCOPED",
        characterId: null,
      })
  );

  // Execute Command Tool - Run shell commands safely within synced directories
  registry.register(
    "executeCommand",
    {
      displayName: "Execute Command",
      category: "utility",
      keywords: [
        "execute",
        "command",
        "shell",
        "terminal",
        "npm",
        "yarn",
        "pnpm",
        "git",
        "run",
        "script",
        "build",
        "test",
        "lint",
        "install",
        "cli",
      ],
      shortDescription:
        "Execute shell commands safely within synced directories",
      fullInstructions: `## Execute Command

Run shell commands safely within synced folders. Dangerous commands (rm, sudo, format) are blocked.

**Key rules:**
- \`command\` = executable only (e.g., "npm"), NOT a full shell line
- \`args\` = array of arguments (e.g., ["run", "build"])
- Prefer \`localGrep\` for codebase file discovery/search; if using shell listings, always self-limit output (e.g., \`head\`, \`Select-Object -First\`)
- Python inline: \`{ command: "python", args: ["-c", "print('hello')"] }\`
- 30s default timeout (max 5min)`,
      loading: { deferLoading: true },
      requiresSession: true,
    } satisfies ToolMetadata,
    ({ sessionId }) =>
      createExecuteCommandTool({
        sessionId: sessionId || "UNSCOPED",
        characterId: null,
      })
  );

  // Edit File Tool - Targeted string replacement in files
  registry.register(
    "editFile",
    {
      displayName: "Edit File",
      category: "knowledge",
      keywords: [
        "edit",
        "file",
        "modify",
        "change",
        "replace",
        "code",
        "update",
        "refactor",
        "fix",
        "patch",
        "string",
        "write",
      ],
      shortDescription:
        "Edit a file by replacing a specific string with new content",
      fullInstructions: `## Edit File

Replace a unique string in a file within synced folders. Also creates new files.

**Modes:**
- Edit: \`{ filePath, oldString: "unique text", newString: "replacement" }\`
- Create: \`{ filePath, oldString: "", newString: "file content" }\`
- Delete text: \`{ filePath, oldString: "text to remove", newString: "" }\`

**Rules:**
- oldString must appear EXACTLY once in the file (add context if not unique)
- File must be read with readFile before editing
- Stale detection: re-read if file was modified externally
- Diagnostics (tsc/eslint) run automatically after edit`,
      loading: { deferLoading: true },
      requiresSession: true,
    } satisfies ToolMetadata,
    ({ sessionId }) =>
      createEditFileTool({
        sessionId: sessionId || "UNSCOPED",
        characterId: null,
      })
  );

  // Write File Tool - Full file write/create
  registry.register(
    "writeFile",
    {
      displayName: "Write File",
      category: "knowledge",
      keywords: [
        "write",
        "file",
        "create",
        "overwrite",
        "save",
        "new",
        "content",
        "output",
      ],
      shortDescription:
        "Write full content to a file (create new or overwrite existing)",
      fullInstructions: `## Write File

Write full content to a file within synced folders. Creates or overwrites.

**Usage:** \`{ filePath: "src/utils.ts", content: "// Full file content here" }\`

**Rules:**
- For existing files: prefer editFile for small changes (preserves unmodified content)
- Stale detection: warns if file modified since last read
- Max 1MB content size
- Diagnostics run automatically after write`,
      loading: { deferLoading: true },
      requiresSession: true,
    } satisfies ToolMetadata,
    ({ sessionId }) =>
      createWriteFileTool({
        sessionId: sessionId || "UNSCOPED",
        characterId: null,
      })
  );

  // Patch File Tool - Multi-file batch operations
  registry.register(
    "patchFile",
    {
      displayName: "Patch Files",
      category: "knowledge",
      keywords: [
        "patch",
        "multi",
        "batch",
        "bulk",
        "refactor",
        "multiple",
        "files",
        "atomic",
        "update",
        "create",
        "delete",
      ],
      shortDescription:
        "Apply multiple file operations atomically (update/create/delete)",
      fullInstructions: `## Patch Files

Apply batch operations across multiple files atomically. All operations validated before any writes.

**Operations:**
- update: \`{ action: "update", filePath, oldString, newString }\`
- create: \`{ action: "create", filePath, newString: "content" }\`
- delete: \`{ action: "delete", filePath }\`

**Example:** \`{ operations: [{ action: "update", filePath: "a.ts", oldString: "old", newString: "new" }, { action: "create", filePath: "b.ts", newString: "content" }] }\`

**Safety:** If any operation fails validation, NO files are modified.`,
      loading: { deferLoading: true },
      requiresSession: true,
    } satisfies ToolMetadata,
    ({ sessionId }) =>
      createPatchFileTool({
        sessionId: sessionId || "UNSCOPED",
        characterId: null,
      })
  );

  // Schedule Task Tool - Schedule tasks for future execution
  registry.register(
    "scheduleTask",
    {
      displayName: "Schedule Task",
      category: "scheduling",
      keywords: [
        "schedule",
        "task",
        "cron",
        "timer",
        "reminder",
        "future",
        "recurring",
        "automation",
        "daily",
        "weekly",
        "hourly",
        "interval",
        "scheduled",
        "job",
        "automate",
      ],
      shortDescription:
        "Schedule tasks for future execution (one-time, recurring, or interval-based)",
      fullInstructions: `## Schedule Task

Schedule future tasks (cron/interval/once). Task runs with agent's full context and tools.

**Types:** cron (\`cronExpression\`), interval (\`intervalMinutes\`), once (\`scheduledAt\` ISO timestamp).

**Cron patterns:** \`0 9 * * 1-5\` (9am weekdays), \`0 0 * * *\` (midnight daily), \`*/30 * * * *\` (every 30min), \`0 0 1 * *\` (monthly).

**Template variables in prompts:** \`{{NOW}}\`, \`{{TODAY}}\`, \`{{YESTERDAY}}\`, \`{{WEEKDAY}}\`, \`{{MONTH}}\`, \`{{LAST_7_DAYS}}\`, \`{{LAST_30_DAYS}}\` — resolved at execution time.

**Timezone:** Always use IANA format (e.g., "Europe/Berlin"). The tool auto-converts common formats: GMT+1, CET, EST, city names ("Berlin", "Tokyo"). If ambiguous, ask the user to confirm their city.

**Delivery channel:** Use \`deliveryChannel: "auto"\` (default) to deliver results to the same channel the user is chatting from (e.g., Telegram → Telegram). Override with "app", "telegram", "slack", "whatsapp".

**Calendar mirroring:** Set \`mirrorToCalendar: true\` to also create a Google Calendar event via configured MCP. Requires a calendar MCP server (e.g., Composio). Use \`calendarDurationMinutes\` for event length (default: 15).`,
      loading: { deferLoading: true },
      requiresSession: true,
    } satisfies ToolMetadata,
    ({ sessionId, userId, characterId }) =>
      createScheduleTaskTool({
        sessionId: sessionId || "UNSCOPED",
        userId: userId || "UNSCOPED",
        characterId: characterId || "UNSCOPED",
      })
  );

  // Skills runtime: unified discovery/inspect/run for DB + plugin skills
  registry.register(
    "runSkill",
    {
      displayName: "Run Skill",
      category: "utility",
      keywords: ["run skill", "inspect skill", "list skills", "execute skill", "skill by id", "skill by name"],
      shortDescription: "Unified skill runtime: list, inspect full content, and run DB/plugin skills",
      loading: { deferLoading: true },
      requiresSession: true,
    } satisfies ToolMetadata,
    ({ sessionId, userId, characterId }) =>
      createRunSkillTool({
        sessionId: sessionId || "UNSCOPED",
        userId: userId || "UNSCOPED",
        characterId: characterId || "UNSCOPED",
      })
  );

  // Skills runtime: unified create/patch/replace/metadata/copy/archive mutations
  registry.register(
    "updateSkill",
    {
      displayName: "Update Skill",
      category: "utility",
      keywords: ["update skill", "create skill", "patch skill", "replace skill", "copy skill", "archive skill", "skill feedback"],
      shortDescription: "Unified skill mutation tool with patch-first editing and version checks",
      loading: { deferLoading: true },
      requiresSession: false,
    } satisfies ToolMetadata,
    ({ userId, characterId }) =>
      createUpdateSkillTool({
        userId: userId || "UNSCOPED",
        characterId: characterId || "UNSCOPED",
      })
  );

  // Memorize Tool - Save memories on demand
  registry.register(
    "memorize", 
    {
      displayName: "Memorize",
      category: "utility",
      keywords: [
        "memorize", "remember", "memory", "save", "note",
        "preference", "fact", "learn", "store",
        "always", "never", "my name", "I prefer",
        "note for future", "keep in mind",
      ],
      shortDescription:
        "Save a fact, preference, or instruction to remember across conversations",
      fullInstructions: `## Memorize

Save memories when the user says "remember that...", "memorize this", "note for future reference", "my name is...", "I prefer...", "always do X", etc.

**Guidelines:**
- One fact per memory — keep it concise and specific
- Don't duplicate existing memories (tool checks automatically)
- Pick the best category or omit to default to domain_knowledge
- Categories: visual_preferences, communication_style, workflow_patterns, domain_knowledge, business_rules
- Memories are immediately active in all future conversations`,
      loading: { deferLoading: true },
      requiresSession: true,
    } satisfies ToolMetadata,
    ({ sessionId, characterId }) =>
      createMemorizeTool({
        sessionId: sessionId || "UNSCOPED",
        characterId: characterId || "UNSCOPED",
      })
  );

  // Calculator Tool - Safe mathematical calculations
  registry.register(
    "calculator",
    {
      displayName: "Calculator",
      category: "utility",
      keywords: [
        "calculate",
        "calculator",
        "math",
        "arithmetic",
        "compute",
        "add",
        "subtract",
        "multiply",
        "divide",
        "sum",
        "percentage",
        "percent",
        "tax",
        "interest",
        "compound",
        "statistics",
        "mean",
        "median",
        "sqrt",
        "power",
        "exponent",
        "trigonometry",
        "sin",
        "cos",
        "convert",
        "unit",
        "formula",
      ],
      shortDescription:
        "Perform accurate mathematical calculations - arithmetic, statistics, trigonometry, unit conversions",
      fullInstructions: `## Calculator

Use instead of doing math yourself — returns deterministic, accurate results.

**Supports:** arithmetic, trig (radians), log, constants (pi/e/phi), statistics (mean/median/std), units ("5 miles to km"), matrix, complex numbers.

**Example:** \`calculator({ expression: "10000 * (1 + 0.07)^30", precision: 2 })\``,
      loading: { deferLoading: true },
      requiresSession: false,
    } satisfies ToolMetadata,
    () => createCalculatorTool()
  );

  // Update Plan Tool - Create or update a visible task plan
  registry.register(
    "updatePlan",
    {
      displayName: "Update Plan",
      category: "utility",
      keywords: [
        "plan", "update plan", "task plan", "steps", "todo", "progress",
        "checklist", "roadmap", "track", "status", "milestone",
      ],
      shortDescription:
        "Create or update a visible task plan with step statuses across the conversation",
      fullInstructions: `## Update Plan

Creates or updates a visible task plan. First call creates; subsequent calls update.

**Quick decision:**
- No plan yet → call with steps and text for each (mode="replace" is default)
- Update step status → pass only its id + new status, mode="merge" (text is optional — existing text preserved)
- Change step text → pass id + new text + status, mode="merge"
- Redo entirely → new steps with text, mode="replace"

**IMPORTANT for merge updates:** Only send the steps that changed. Do NOT resend all steps.
Example: \`{ "steps": [{"id": "step_abc", "status": "completed"}], "mode": "merge" }\`

**Constraints:** Max 20 steps. Only 1 step can be "in_progress" at a time. Use returned step ids for merge updates.`,
      loading: { deferLoading: true },
      requiresSession: true,
    } satisfies ToolMetadata,
    ({ sessionId }) => createUpdatePlanTool({ sessionId: sessionId || "UNSCOPED" })
  );

  // Workspace Tool - Create and manage git worktree workspaces
  registry.register(
    "workspace",
    {
      displayName: "Workspace",
      category: "utility",
      keywords: [
        "workspace", "worktree", "git", "branch", "isolate", "feature",
        "code changes", "separate branch", "pr", "pull request",
      ],
      shortDescription:
        "Create and manage git worktree workspaces for isolated code changes",
      fullInstructions: `## Workspace (Git Worktree Manager)

Create isolated git worktrees so the user's main branch stays clean.
File tools (readFile, editFile, writeFile, localGrep) automatically work in the worktree.

**Actions:**
- \`create\`: Create a new worktree + branch. Requires \`branch\` and \`repoPath\`.
  Example: \`{ action: "create", branch: "feature/auth-refactor", repoPath: "/path/to/repo" }\`
- \`status\`: Check live git status of the current workspace (changed files, branch info).
- \`update-metadata\`: Update PR info or lifecycle status after creating a PR or finishing work.
- \`delete\`: Remove the workspace — deletes git worktree and cleans up resources.

**Workflow:**
1. User asks to work on a feature → call workspace with action "create"
2. Use file tools (readFile, editFile, writeFile) and executeCommand in the worktree path
3. When changes are ready, **ask the user** what they want to do next and **memorize their preference** (if the memorize tool is available) so you don't have to ask again:
   - Keep changes local (just commit)
   - Push to remote (\`git push -u origin <branch>\`)
   - Push and create a PR (\`gh pr create ...\`)
4. If creating a PR: push first, then use \`gh pr create\`, then update-metadata with the real URL
5. Clean up with action "delete" when work is complete

**NEVER:**
- Fabricate or guess PR URLs — only use URLs from \`gh pr create\` / \`gh pr view\` output
- Push or create PRs without asking the user first
- Skip verifying that a git command succeeded before proceeding to the next step`,
      loading: { deferLoading: true },
      requiresSession: true,
    } satisfies ToolMetadata,
    ({ sessionId, userId, characterId }) =>
      createWorkspaceTool({
        sessionId: sessionId || "UNSCOPED",
        characterId: characterId || "UNSCOPED",
        userId: userId || "UNSCOPED",
      })
  );

  // ============================================================
  // VOICE & AUDIO TOOLS - Deferred (discovered via searchTools)
  // ============================================================

  // Speak Aloud Tool - Text-to-Speech synthesis
  registry.register(
    "speakAloud",
    {
      displayName: "Speak Aloud",
      category: "utility",
      keywords: [
        "voice", "speak", "say", "read aloud", "tts", "text to speech",
        "audio", "listen", "sound", "narrate", "pronounce",
      ],
      shortDescription: "Synthesize text to speech audio using the configured TTS provider",
      fullInstructions: `## Speak Aloud

Text-to-speech using configured TTS provider. Use when user asks to "read aloud", "say this", or "speak".
TTS must be enabled in Settings → Voice & Audio. Audio plays automatically in desktop UI.`,
      loading: { deferLoading: true },
      requiresSession: true,
    } satisfies ToolMetadata,
    ({ sessionId }) => createSpeakAloudTool({ sessionId: sessionId || "UNSCOPED" })
  );

  // Transcribe Tool - Audio transcription status
  registry.register(
    "transcribe",
    {
      displayName: "Transcribe Audio",
      category: "utility",
      keywords: [
        "transcribe", "transcription", "stt", "speech to text",
        "voice note", "audio", "whisper", "dictation",
      ],
      shortDescription: "Check audio transcription capabilities and status",
      fullInstructions: `## Transcribe

Audio transcription status. Voice notes (WhatsApp, Telegram, Slack, Discord) are auto-transcribed via Whisper — no manual trigger needed.`,
      loading: { deferLoading: true },
      requiresSession: true,
    } satisfies ToolMetadata,
    ({ sessionId }) => createTranscribeTool({ sessionId: sessionId || "UNSCOPED" })
  );

  // Send Message to Channel Tool
  registry.register(
    "sendMessageToChannel",
    {
      displayName: "Send Message to Channel",
      category: "utility",
      keywords: [
        "message", "send", "channel", "telegram", "slack", "whatsapp",
        "notify", "dm", "direct message", "contact",
      ],
      shortDescription: "Send a direct message to the user via connected external channels",
      fullInstructions: `## Send Message to Channel
      
      Send a message to the user via Telegram, Slack, or WhatsApp.
      Use when the user asks to be notified or messaged externally.
      
      If channelType is omitted, it tries to reply to the current channel conversation or finds the most recent active connection.`,
      loading: { deferLoading: true },
      requiresSession: true,
    } satisfies ToolMetadata,
    ({ sessionId, userId }) =>
      createSendMessageToChannelTool({
        sessionId: sessionId || "UNSCOPED",
        userId: userId || "UNSCOPED",
        sessionMetadata: {},
      })
  );

  // Delegate to Sub-Agent Tool (workflow inter-agent communication)
  registry.register(
    "delegateToSubagent",
    {
      displayName: "Delegate to Sub-Agent",
      category: "utility",
      keywords: [
        "delegate", "subagent", "sub-agent", "workflow", "agent", "team",
        "assign", "task", "collaborate", "orchestrate",
      ],
      shortDescription: "Delegate a task to a workflow sub-agent and receive their response",
      fullInstructions: `## Delegate to Sub-Agent

Delegate work to a workflow sub-agent. Use this when tasks are multi-step, parallelizable,
or better handled by a subagent's stated purpose.

Only available to initiator role in an active workflow.

Required sequence:
1) \`list\` - refresh available sub-agents and active delegations.
2) \`start\` - target by \`agentId\` or \`agentName\`, send precise task.
3) \`observe\` - check progress and collect response (prefer \`waitSeconds\` like 30/60/600).
4) \`continue\` or \`stop\` - refine or cancel existing delegation.

Rules:
- Do not start duplicate delegations to the same subagent while one is active.
- Reuse existing \`delegationId\` with \`observe\` / \`continue\` / \`stop\`.
- Include constraints and expected output format in task text.

Compatibility options:
- \`runInBackground\` (or \`run_in_background\`): default true. If false on \`start\`, tool performs start + observe wait in one call.
- \`resume\`: compatibility alias for existing \`delegationId\` (maps to \`continue\` semantics).
- \`maxTurns\` (or \`max_turns\`): advisory cap forwarded into task instructions (not strict runtime enforcement).

Examples:
- \`{ action: "start", agentName: "Research Analyst", task: "Summarize API docs changes with risks and next actions." }\`
- \`{ action: "observe", delegationId: "del-123", waitSeconds: 60 }\`
- \`{ action: "continue", delegationId: "del-123", followUpMessage: "Focus only on migration risks." }\``,
      loading: { deferLoading: true },
      requiresSession: true,
    } satisfies ToolMetadata,
    ({ sessionId, userId, characterId }) =>
      createDelegateToSubagentTool({
        sessionId: sessionId || "UNSCOPED",
        userId: userId || "UNSCOPED",
        characterId: characterId || "UNSCOPED",
      })
  );

  // Describe Image Tool (ALWAYS LOADED - essential for virtual try-on workflows)
  // CRITICAL: This tool uses the configured vision model (Claude/OpenRouter) to analyze images.
  // ALWAYS use this before making assumptions about user photos, clothing, rooms, or any visual content.
  registry.register(
    "describeImage",
    {
      displayName: "Describe Image",
      category: "analysis",
      keywords: [
        "analyze", "describe", "vision", "understand", "see", "look",
        "person", "photo", "portrait", "selfie", "user photo",
        "room", "layout", "interior", "space",
        "product", "clothing", "outfit", "fashion", "style",
        "gender", "appearance", "body type", "skin tone",
        "identify", "recognize", "detect",
        "image", "virtual", "try-on", "try on", "tryon"
      ],
      shortDescription: "Analyze any image using vision AI - people, rooms, products, clothing. ALWAYS use before making assumptions about visual content.",
      fullInstructions: `## Describe Image (Vision AI)

⚠️ **MUST call FIRST** before virtual try-on, furniture visualization, or any task where you'd guess visual details.
Skipping → wrong gender/body assumptions → poor edit results.

**Analysis types:** person (appearance/body/style), room (layout/materials), product (type/color/material), general.

**Workflow:** describeImage → use analysis in editImage prompt to ensure accurate results. Never assume — always analyze first.`,
      loading: { alwaysLoad: true },  // Always available - essential for virtual try-on
      requiresSession: false,
      // No enableEnvVar - uses getVisionModel() which falls back to Claude (always available)
    } satisfies ToolMetadata,
    (context) => createDescribeImageTool(context.sessionId)
  );

  // Web Search Tool (configurable per-agent - lightweight web search)
  registry.register(
    "webSearch",
    {
      displayName: "Web Search",
      category: "search",
      keywords: [
        "search",
        "web",
        "internet",
        "lookup",
        "find",
        "google",
        "current",
        "news",
        "facts",
        "information",
        // Phrase keywords for better discovery
        "web search",
        "internet search",
        "search the web",
        "online search",
        "search online",
        "find online",
        "browse web",
        "surf web",
      ],
      shortDescription:
        "Search the web for URLs, then use webBrowse to read them",
      fullInstructions: `## Web Search

Find URLs, then use \`webBrowse\` to read them. Max 2 webSearch calls per conversation.

**Workflow:** webSearch → get URLs → webBrowse(urls, query) for content.
**Don't use for:** reading URL content (use webBrowse directly), comprehensive research (use Deep Research).`,
      loading: { deferLoading: true },
      requiresSession: false,
      // No enableEnvVar — DuckDuckGo fallback needs no API key
    } satisfies ToolMetadata,
    () => createWebSearchTool()
  );

  // ============================================================
  // DEFERRED TOOLS - AI Model Pipelines (require searchTools to discover)
  // ============================================================

  // Firecrawl Crawl Tool
  registry.register(
    "firecrawlCrawl",
    {
      displayName: "Crawl Website",
      category: "search",
      keywords: [
        "crawl",
        "spider",
        "website",
        "pages",
        "multiple",
        "firecrawl",
        "sitemap",
        "documentation",
      ],
      shortDescription: "Crawl multiple pages from a website starting from a URL",
      fullInstructions: `## Firecrawl Crawler

Crawl multiple pages from a website as markdown. Good for documentation sites.
Async — may take up to 60s. Use includePaths/excludePaths to focus on specific sections.`,
      loading: { deferLoading: true },
      requiresSession: false,
      enableEnvVar: "FIRECRAWL_API_KEY",
    } satisfies ToolMetadata,
    (context) => createFirecrawlCrawlTool(context.sessionId)
  );

  // Web Browse Tool - Session-scoped web browsing with synthesis
  registry.register(
    "webBrowse",
    {
      displayName: "Web Browse",
      category: "search",
      keywords: [
        "browse",
        "web",
        "read",
        "fetch",
        "analyze",
        "webpage",
        "url",
        "content",
        "synthesize",
        // Phrase keywords for better discovery
        "web browse",
        "browse website",
        "read webpage",
        "fetch url",
        "scrape web",
        "extract web",
        "internet",
        "web content",
      ],
      shortDescription: "Fetch web pages and synthesize information in one operation",
      fullInstructions: `## Web Browse

Fetch 1-5 URLs and get a synthesized answer. Content cached for this conversation.
Use webQuery for follow-up questions on already-fetched content. Use webSearch first if you need to find URLs.`,
      loading: { deferLoading: true },
      requiresSession: true,
      enableEnvVar: "FIRECRAWL_API_KEY",
    } satisfies ToolMetadata,
    () => createWebBrowseTool({ sessionId: "", userId: "", characterId: null })
  );

  // Web Query Tool - Query previously fetched content
  registry.register(
    "webQuery",
    {
      displayName: "Web Query",
      category: "search",
      keywords: [
        "query",
        "web",
        "cached",
        "session",
        "follow-up",
        "question",
        "content",
      ],
      shortDescription: "Query previously fetched web content from this conversation",
      fullInstructions: `## Web Query

Follow-up questions on already-fetched web content (from webBrowse). Content expires after 2 hours.
Use webBrowse for new URLs; this is for re-querying cached content.`,
      loading: { deferLoading: true },
      requiresSession: true,
    } satisfies ToolMetadata,
    () => createWebQueryTool({ sessionId: "", userId: "", characterId: null })
  );

  // ============================================================================
  // LOCAL COMFYUI IMAGE GENERATION TOOLS
  // These tools use the local ComfyUI backend for image generation
  // Enable via Settings > ComfyUI Settings
  // ============================================================================

  // Z-Image Turbo FP8 - Local Generation
  registry.register(
    "generateImageZImage",
    {
      displayName: "Generate Image (Z-Image Local)",
      category: "image-generation",
      keywords: [
        "generate", "create", "image", "local", "comfyui", "z-image", "turbo", "fp8",
        "text-to-image", "fast", "offline", "private", "local image", "generate locally",
      ],
      shortDescription: "Generate images locally using Z-Image Turbo FP8 via ComfyUI",
      fullInstructions: `## Z-Image Turbo FP8 (Local ComfyUI)

Fast local image generation. Defaults optimized (steps=9, cfg=1.0). Seed=-1 for random.`,
      loading: { deferLoading: true },
      requiresSession: false,
      // Only available when local ComfyUI is enabled
      enableEnvVar: "COMFYUI_LOCAL_ENABLED",
    } satisfies ToolMetadata,
    () => createZImageGenerateTool()
  );

  // FLUX.2 Klein 4B - Local Generation
  registry.register(
    "generateImageFlux2Klein4B",
    {
      displayName: "Generate Image (FLUX.2 Klein 4B Local)",
      category: "image-generation",
      keywords: [
        "generate", "create", "image", "local", "comfyui", "flux", "flux2", "klein", "4b",
        "text-to-image", "fast", "offline", "private", "local image", "generate locally",
        "edit", "reference", "image-to-image",
      ],
      shortDescription: "Generate or edit images locally using FLUX.2 Klein 4B via ComfyUI",
      fullInstructions: `## FLUX.2 Klein 4B (Local ComfyUI)

Dual-mode: text-to-image (no reference_images) or image editing (with reference_images).
~7-8s generation, ~10-14s editing. Requires ~12GB VRAM. Dimensions must be divisible by 8.`,
      loading: { deferLoading: true },
      requiresSession: true,
      enableEnvVar: "FLUX2_KLEIN_4B_ENABLED",
    } satisfies ToolMetadata,
    ({ sessionId }) => createFlux2Klein4BGenerateTool(sessionId!)
  );

  // FLUX.2 Klein 4B - Local Editing
  registry.register(
    "editImageFlux2Klein4B",
    {
      displayName: "Edit Image (FLUX.2 Klein 4B Local)",
      category: "image-editing",
      keywords: [
        "edit", "modify", "image", "local", "comfyui", "flux", "flux2", "klein", "4b",
        "image-to-image", "img2img", "reference", "transform", "inpaint", "variations",
      ],
      shortDescription: "Edit images locally using FLUX.2 Klein 4B via ComfyUI",
      fullInstructions: `## FLUX.2 Klein 4B Editing (Local)

Edit images locally. Supports multiple source images (1-10) for composition/style mixing. Dimensions divisible by 8.`,
      loading: { deferLoading: true },
      requiresSession: true,
      enableEnvVar: "FLUX2_KLEIN_4B_ENABLED",
    } satisfies ToolMetadata,
    ({ sessionId }) => createFlux2Klein4BEditTool(sessionId!)
  );

  // FLUX.2 Klein 4B - Local Reference
  registry.register(
    "referenceImageFlux2Klein4B",
    {
      displayName: "Reference Image (FLUX.2 Klein 4B Local)",
      category: "image-generation",
      keywords: [
        "reference", "style", "image", "local", "comfyui", "flux", "flux2", "klein", "4b",
        "guided generation", "style transfer", "image-to-image",
      ],
      shortDescription: "Reference-guided generation using FLUX.2 Klein 4B via ComfyUI",
      fullInstructions: `## FLUX.2 Klein 4B Reference (Local)

Generate images guided by 1-10 reference images locally. Style transfer and content-guided generation.`,
      loading: { deferLoading: true },
      requiresSession: true,
      enableEnvVar: "FLUX2_KLEIN_4B_ENABLED",
    } satisfies ToolMetadata,
    ({ sessionId }) => createFlux2Klein4BReferenceTool(sessionId!)
  );

  // FLUX.2 Klein 9B - Local Generation (Higher Quality)
  registry.register(
    "generateImageFlux2Klein9B",
    {
      displayName: "Generate Image (FLUX.2 Klein 9B Local)",
      category: "image-generation",
      keywords: [
        "generate", "create", "image", "local", "comfyui", "flux", "flux2", "klein", "9b",
        "text-to-image", "high-quality", "detailed", "offline", "private", "local image",
        "edit", "reference", "image-to-image", "premium",
      ],
      shortDescription: "Generate or edit high-quality images locally using FLUX.2 Klein 9B via ComfyUI",
      fullInstructions: `## FLUX.2 Klein 9B (Local ComfyUI)

Premium quality variant of 4B. Dual-mode: text-to-image or image editing (with reference_images).
~10-12s generation, ~14-18s editing. Requires ~16GB+ VRAM. Dimensions divisible by 8.`,
      loading: { deferLoading: true },
      requiresSession: true,
      enableEnvVar: "FLUX2_KLEIN_9B_ENABLED",
    } satisfies ToolMetadata,
    ({ sessionId }) => createFlux2Klein9BGenerateTool(sessionId!)
  );

  // FLUX.2 Klein 9B - Local Editing
  registry.register(
    "editImageFlux2Klein9B",
    {
      displayName: "Edit Image (FLUX.2 Klein 9B Local)",
      category: "image-editing",
      keywords: [
        "edit", "modify", "image", "local", "comfyui", "flux", "flux2", "klein", "9b",
        "image-to-image", "img2img", "reference", "transform", "inpaint", "variations",
      ],
      shortDescription: "Edit images locally using FLUX.2 Klein 9B via ComfyUI",
      fullInstructions: `## FLUX.2 Klein 9B Editing (Local)

Premium local image editing. Supports multiple source images (1-10). Dimensions divisible by 8.`,
      loading: { deferLoading: true },
      requiresSession: true,
      enableEnvVar: "FLUX2_KLEIN_9B_ENABLED",
    } satisfies ToolMetadata,
    ({ sessionId }) => createFlux2Klein9BEditTool(sessionId!)
  );

  // FLUX.2 Klein 9B - Local Reference
  registry.register(
    "referenceImageFlux2Klein9B",
    {
      displayName: "Reference Image (FLUX.2 Klein 9B Local)",
      category: "image-generation",
      keywords: [
        "reference", "style", "image", "local", "comfyui", "flux", "flux2", "klein", "9b",
        "guided generation", "style transfer", "image-to-image",
      ],
      shortDescription: "Reference-guided generation using FLUX.2 Klein 9B via ComfyUI",
      fullInstructions: `## FLUX.2 Klein 9B Reference (Local)

Premium reference-guided generation with 1-10 reference images locally.`,
      loading: { deferLoading: true },
      requiresSession: true,
      enableEnvVar: "FLUX2_KLEIN_9B_ENABLED",
    } satisfies ToolMetadata,
    ({ sessionId }) => createFlux2Klein9BReferenceTool(sessionId!)
  );

  // ============================================================================
  // LEGACY STYLY IO API TOOLS
  // These tools use the STYLY IO API and are disabled by default.
  // Set ENABLE_LEGACY_IMAGE_TOOLS=true to enable them.
  // ============================================================================
  if (process.env.ENABLE_LEGACY_IMAGE_TOOLS === "true") {
    // Image Editor Tool (Gemini) - General Image-to-Image editing and Virtual Try-On
    registry.register(
      "editImage",
      {
        displayName: "Image Editor (Gemini)",
        category: "image-editing",
        keywords: [
          // General image editing terms - HIGH PRIORITY for search
          "edit", "edit image", "image edit", "modify", "transform", "change", "adjust",
          "image editing", "photo editing", "edit photo", "photo edit",
          // Variations/remix terms
          "variations", "variation", "remix", "create variations", "generate variations",
          "image-to-image", "img2img", "i2i",
          // Style/transfer terms
          "style transfer", "apply style", "combine images", "blend",
          // Room/interior (original use case, still supported)
          "room", "interior", "material", "texture", "color", "wall", "floor",
          // Furniture visualization
          "furniture", "how would", "look in my room", "place", "visualize",
          "couch", "sofa", "chair", "table", "desk", "bed", "bookcase", "shelf",
          "IKEA", "decor", "staging", "virtual staging",
          // Virtual try-on - KEY USE CASE
          "try on", "try-on", "virtual try-on", "clothing", "outfit", "fashion",
          "shirt", "dress", "pants", "jacket", "suit", "formal wear", "attire",
          "how would I look", "wear", "wearing", "style me",
          // Technical
          "gemini", "flash",
        ],
        shortDescription: "Edit images, combine elements from two images, or create virtual try-on visualizations",
        fullInstructions: `## Image Editor (Gemini)

Edit images with Gemini 2.5 Flash. Two modes: single image edit, or two-image combine (try-on/furniture).

**⚠️ Virtual Try-On Workflow (3 mandatory steps):**
1. \`describeImage\` FIRST → analyze user's photo (never skip!)
2. Get reference image URL (webSearch/webBrowse)
3. \`editImage\` with BOTH image_url + second_image_url + insights from step 1

**Common mistakes:** Skipping describeImage, omitting second_image_url for try-on, assuming gender without analysis.`,
        loading: { deferLoading: true }, // Deferred - discover via searchTools
        requiresSession: true,
        enableEnvVar: "STYLY_AI_API_KEY",
      } satisfies ToolMetadata,
      ({ sessionId }) => createImageEditTool(sessionId!)
    );

    // Flux2 Generate Tool
    registry.register(
      "generateImageFlux2",
      {
        displayName: "Generate Image (Flux2)",
        category: "image-generation",
        keywords: [
          "generate",
          "create",
          "image",
          "flux",
          "text-to-image",
          "art",
          "illustration",
          "reference",
        ],
        shortDescription: "Generate or edit images with Flux2 text-to-image model",
        fullInstructions: `## Flux2 Generation & Editing

Dual-mode: text-to-image (no referenceImages) or image editing (with referenceImages array).

**Mode detection:** If user says "edit/modify/change" + existing image → use referenceImages. Otherwise → pure generation.
**Edit prompts:** Write SHORT, change-focused prompts (e.g., "Add sunset painting to wall"). Don't describe the full scene.
**Image URLs:** Look for \`[Image URL: ...]\` or \`[Previous generateImageFlux2 result - Generated image URLs: ...]\` in conversation.`,
        loading: { deferLoading: true }, // Deferred - discover via searchTools
        requiresSession: true,
        enableEnvVar: "STYLY_AI_API_KEY",
      } satisfies ToolMetadata,
      ({ sessionId, characterAvatarUrl, characterAppearanceDescription }) =>
        createFlux2GenerateTool(sessionId!, {
          characterAvatarUrl,
          characterAppearanceDescription,
        })
    );

    // WAN 2.2 Imagen Tool
    registry.register(
      "generateImageWan22",
      {
        displayName: "Generate Image (WAN 2.2)",
        category: "image-generation",
        keywords: [
          "generate",
          "create",
          "image",
          "wan",
          "anime",
          "artistic",
          "illustration",
          "portrait",
        ],
        shortDescription: "Generate anime-style or artistic images with WAN 2.2",
        fullInstructions: `## WAN 2.2 Image Generation

Anime-style/artistic image generation. Default 768x1344. Use \`positive\` for prompt, \`negative\` to exclude unwanted elements.`,
        loading: { deferLoading: true }, // Deferred - discover via searchTools
        requiresSession: true,
        enableEnvVar: "STYLY_AI_API_KEY",
      } satisfies ToolMetadata,
      ({ sessionId }) => createWan22ImagenTool(sessionId!)
    );

    // WAN 2.2 Video Tool
    registry.register(
      "generateVideoWan22",
      {
        displayName: "Generate Video (WAN 2.2)",
        category: "video-generation",
        keywords: [
          "video",
          "animate",
          "motion",
          "movement",
          "wan",
          "image-to-video",
        ],
        shortDescription: "Animate images into videos with WAN 2.2",
        fullInstructions: `## WAN 2.2 Video Generation

Animate still images into video. Provide image_url + motion prompt (\`positive\`).
Be specific about motion: "Wind blowing through hair" not just "moving". Default fps=21, duration=2s.`,
        loading: { deferLoading: true }, // Deferred - discover via searchTools
        requiresSession: true,
        enableEnvVar: "STYLY_AI_API_KEY",
      } satisfies ToolMetadata,
      ({ sessionId }) => createWan22VideoTool(sessionId!)
    );

    // WAN 2.2 Pixel Animation Tool
    registry.register(
      "generatePixelVideoWan22",
      {
        displayName: "Generate Pixel Animation (WAN 2.2)",
        category: "video-generation",
        keywords: [
          "pixel",
          "sprite",
          "animation",
          "character",
          "game",
          "retro",
          "wan",
          "video",
          "8-bit",
          "16-bit",
        ],
        shortDescription:
          "Generate pixel art character sprite animations with WAN 2.2",
        fullInstructions: `## WAN 2.2 Pixel Animation

Pixel art sprite animations using specialized LoRA. DO NOT change lora_name or lora_strength defaults.

**CRITICAL prompt style:** Use simple 1-2 sentence natural descriptions. DO NOT write phase-by-phase or frame-by-frame specs.
- Good: "Pixel knight swings sword in a powerful slash. Cape billows, glowing trail effect."
- Bad: "Phase 1 (0-20%): Wind-up... Phase 2 (20-45%): Acceleration..." ← produces poor results

Use fps=21-24 for smooth animations. Always add negative: "blurry, distorted, low quality, smeared".`,
        loading: { deferLoading: true }, // Deferred - discover via searchTools
        requiresSession: true,
        enableEnvVar: "STYLY_AI_API_KEY",
      } satisfies ToolMetadata,
      ({ sessionId }) => createWan22PixelVideoTool(sessionId!)
    );
  } // End LEGACY STYLY IO API TOOLS conditional

  // ============================================================================
  // OpenRouter Image Tools
  // These tools use OpenRouter API for image generation, editing, and referencing
  // ============================================================================

  // Flux.2 Flex - Generate
  registry.register(
    "generateImageFlux2Flex",
    {
      displayName: "Generate Image (Flux.2 Flex)",
      category: "image-generation",
      keywords: ["generate", "create", "image", "flux", "text-to-image", "art", "illustration"],
      shortDescription: "Generate images from text using Flux.2 Flex via OpenRouter",
      fullInstructions: `## Flux.2 Flex (OpenRouter)

High-quality text-to-image generation via OpenRouter.`,
      loading: { deferLoading: true },
      requiresSession: true,
      enableEnvVar: "OPENROUTER_API_KEY",
    } satisfies ToolMetadata,
    ({ sessionId }) => createOpenRouterFlux2FlexGenerate(sessionId!)
  );

  // Flux.2 Flex - Edit
  registry.register(
    "editImageFlux2Flex",
    {
      displayName: "Edit Image (Flux.2 Flex)",
      category: "image-editing",
      keywords: ["edit", "modify", "transform", "image", "flux", "image-to-image"],
      shortDescription: "Edit existing images using Flux.2 Flex via OpenRouter",
      fullInstructions: `## Flux.2 Flex Editing (OpenRouter)

Edit/transform images via OpenRouter. Supports mask for inpainting (white=edit, black=preserve).`,
      loading: { deferLoading: true },
      requiresSession: true,
      enableEnvVar: "OPENROUTER_API_KEY",
    } satisfies ToolMetadata,
    ({ sessionId }) => createOpenRouterFlux2FlexEdit(sessionId!)
  );

  // Flux.2 Flex - Reference
  registry.register(
    "referenceImageFlux2Flex",
    {
      displayName: "Reference Image (Flux.2 Flex)",
      category: "image-generation",
      keywords: ["reference", "style", "transfer", "image", "flux", "guided"],
      shortDescription: "Generate images guided by a reference using Flux.2 Flex via OpenRouter",
      fullInstructions: `## Flux.2 Flex Reference (OpenRouter)

Reference-guided generation for style transfer and consistency. Adjust reference_strength (0-1) to control influence.`,
      loading: { deferLoading: true },
      requiresSession: true,
      enableEnvVar: "OPENROUTER_API_KEY",
    } satisfies ToolMetadata,
    ({ sessionId }) => createOpenRouterFlux2FlexReference(sessionId!)
  );

  // GPT-5 Image Mini - Generate
  registry.register(
    "generateImageGpt5Mini",
    {
      displayName: "Generate Image (GPT-5 Mini)",
      category: "image-generation",
      keywords: ["generate", "create", "image", "gpt", "openai", "fast", "mini"],
      shortDescription: "Generate images quickly using GPT-5 Image Mini via OpenRouter",
      fullInstructions: `## GPT-5 Image Mini (OpenRouter)

Fast image generation. Good for quick iterations where speed > max quality.`,
      loading: { deferLoading: true },
      requiresSession: true,
      enableEnvVar: "OPENROUTER_API_KEY",
    } satisfies ToolMetadata,
    ({ sessionId }) => createOpenRouterGpt5ImageMiniGenerate(sessionId!)
  );

  // GPT-5 Image Mini - Edit
  registry.register(
    "editImageGpt5Mini",
    {
      displayName: "Edit Image (GPT-5 Mini)",
      category: "image-editing",
      keywords: [
        "edit", "modify", "image", "gpt", "openai", "fast", "mini",
        // Virtual try-on and fashion keywords
        "try on", "try-on", "virtual try-on", "clothing", "outfit", "fashion",
        "image editing", "photo editing", "transform",
      ],
      shortDescription: "Edit images quickly using GPT-5 Image Mini via OpenRouter",
      fullInstructions: `## GPT-5 Image Mini Editing (OpenRouter)

Fast image editing. Supports mask for inpainting.`,
      loading: { deferLoading: true },
      requiresSession: true,
      enableEnvVar: "OPENROUTER_API_KEY",
    } satisfies ToolMetadata,
    ({ sessionId }) => createOpenRouterGpt5ImageMiniEdit(sessionId!)
  );

  // GPT-5 Image Mini - Reference
  registry.register(
    "referenceImageGpt5Mini",
    {
      displayName: "Reference Image (GPT-5 Mini)",
      category: "image-generation",
      keywords: [
        "reference", "style", "image", "gpt", "openai", "fast", "mini",
        // Virtual try-on and fashion keywords
        "try on", "try-on", "virtual try-on", "clothing", "outfit", "fashion",
        "style transfer", "guided generation",
      ],
      shortDescription: "Generate images with reference using GPT-5 Image Mini via OpenRouter",
      fullInstructions: `## GPT-5 Image Mini Reference (OpenRouter)

Fast reference-guided generation. Adjust reference_strength (0-1).`,
      loading: { deferLoading: true },
      requiresSession: true,
      enableEnvVar: "OPENROUTER_API_KEY",
    } satisfies ToolMetadata,
    ({ sessionId }) => createOpenRouterGpt5ImageMiniReference(sessionId!)
  );

  // GPT-5 Image - Generate
  registry.register(
    "generateImageGpt5",
    {
      displayName: "Generate Image (GPT-5)",
      category: "image-generation",
      keywords: ["generate", "create", "image", "gpt", "openai", "premium", "quality"],
      shortDescription: "Generate premium quality images using GPT-5 Image via OpenRouter",
      fullInstructions: `## GPT-5 Image (OpenRouter)

Premium quality image generation for complex, detailed, professional-grade outputs.`,
      loading: { deferLoading: true },
      requiresSession: true,
      enableEnvVar: "OPENROUTER_API_KEY",
    } satisfies ToolMetadata,
    ({ sessionId }) => createOpenRouterGpt5ImageGenerate(sessionId!)
  );

  // GPT-5 Image - Edit
  registry.register(
    "editImageGpt5",
    {
      displayName: "Edit Image (GPT-5)",
      category: "image-editing",
      keywords: [
        "edit", "modify", "transform", "image", "gpt", "openai", "premium",
        // Virtual try-on and fashion keywords
        "try on", "try-on", "virtual try-on", "clothing", "outfit", "fashion",
        "image editing", "photo editing",
      ],
      shortDescription: "Premium image editing using GPT-5 Image via OpenRouter",
      fullInstructions: `## GPT-5 Image Editing (OpenRouter)

Premium image editing. Supports mask for inpainting.`,
      loading: { deferLoading: true },
      requiresSession: true,
      enableEnvVar: "OPENROUTER_API_KEY",
    } satisfies ToolMetadata,
    ({ sessionId }) => createOpenRouterGpt5ImageEdit(sessionId!)
  );

  // GPT-5 Image - Reference
  registry.register(
    "referenceImageGpt5",
    {
      displayName: "Reference Image (GPT-5)",
      category: "image-generation",
      keywords: [
        "reference", "style", "transfer", "image", "gpt", "openai", "premium",
        // Virtual try-on and fashion keywords
        "try on", "try-on", "virtual try-on", "clothing", "outfit", "fashion",
        "style transfer", "guided generation",
      ],
      shortDescription: "Premium reference-guided generation using GPT-5 Image via OpenRouter",
      fullInstructions: `## GPT-5 Image Reference (OpenRouter)

Premium reference-guided generation and style transfer. Adjust reference_strength (0-1).`,
      loading: { deferLoading: true },
      requiresSession: true,
      enableEnvVar: "OPENROUTER_API_KEY",
    } satisfies ToolMetadata,
    ({ sessionId }) => createOpenRouterGpt5ImageReference(sessionId!)
  );

  // Gemini 2.5 Flash Image - Generate
  registry.register(
    "generateImageGemini25Flash",
    {
      displayName: "Generate Image (Gemini 2.5 Flash)",
      category: "image-generation",
      keywords: ["generate", "create", "image", "gemini", "google", "flash", "fast"],
      shortDescription: "Fast image generation using Gemini 2.5 Flash Image via OpenRouter",
      fullInstructions: `## Gemini 2.5 Flash Image (OpenRouter)

Fast, high-quality generation via Google's Gemini 2.5 Flash.`,
      loading: { deferLoading: true },
      requiresSession: true,
      enableEnvVar: "OPENROUTER_API_KEY",
    } satisfies ToolMetadata,
    ({ sessionId }) => createOpenRouterGemini25FlashImageGenerate(sessionId!)
  );

  // Gemini 2.5 Flash Image - Edit
  registry.register(
    "editImageGemini25Flash",
    {
      displayName: "Edit Image (Gemini 2.5 Flash)",
      category: "image-editing",
      keywords: [
        "edit", "modify", "image", "gemini", "google", "flash", "fast",
        // Virtual try-on and fashion keywords
        "try on", "try-on", "virtual try-on", "clothing", "outfit", "fashion",
        "image editing", "photo editing", "transform",
      ],
      shortDescription: "Fast image editing using Gemini 2.5 Flash Image via OpenRouter",
      fullInstructions: `## Gemini 2.5 Flash Editing (OpenRouter)

Fast image editing. Supports mask for inpainting.`,
      loading: { deferLoading: true },
      requiresSession: true,
      enableEnvVar: "OPENROUTER_API_KEY",
    } satisfies ToolMetadata,
    ({ sessionId }) => createOpenRouterGemini25FlashImageEdit(sessionId!)
  );

  // Gemini 2.5 Flash Image - Reference
  registry.register(
    "referenceImageGemini25Flash",
    {
      displayName: "Reference Image (Gemini 2.5 Flash)",
      category: "image-generation",
      keywords: [
        "reference", "style", "image", "gemini", "google", "flash",
        // Virtual try-on and fashion keywords
        "try on", "try-on", "virtual try-on", "clothing", "outfit", "fashion",
        "style transfer", "guided generation",
      ],
      shortDescription: "Fast reference-guided generation using Gemini 2.5 Flash Image via OpenRouter",
      fullInstructions: `## Gemini 2.5 Flash Reference (OpenRouter)

Fast reference-guided generation. Adjust reference_strength (0-1).`,
      loading: { deferLoading: true },
      requiresSession: true,
      enableEnvVar: "OPENROUTER_API_KEY",
    } satisfies ToolMetadata,
    ({ sessionId }) => createOpenRouterGemini25FlashImageReference(sessionId!)
  );

  // Gemini 3 Pro Image - Generate
  registry.register(
    "generateImageGemini3Pro",
    {
      displayName: "Generate Image (Gemini 3 Pro)",
      category: "image-generation",
      keywords: ["generate", "create", "image", "gemini", "google", "pro", "latest"],
      shortDescription: "Latest Gemini image generation using Gemini 3 Pro Image via OpenRouter",
      fullInstructions: `## Gemini 3 Pro Image (OpenRouter)

Google's most advanced image model (preview). Best for complex, detailed generation.`,
      loading: { deferLoading: true },
      requiresSession: true,
      enableEnvVar: "OPENROUTER_API_KEY",
    } satisfies ToolMetadata,
    ({ sessionId }) => createOpenRouterGemini3ProImageGenerate(sessionId!)
  );

  // Gemini 3 Pro Image - Edit
  registry.register(
    "editImageGemini3Pro",
    {
      displayName: "Edit Image (Gemini 3 Pro)",
      category: "image-editing",
      keywords: [
        "edit", "modify", "image", "gemini", "google", "pro", "advanced",
        // Virtual try-on and fashion keywords
        "try on", "try-on", "virtual try-on", "clothing", "outfit", "fashion",
        "image editing", "photo editing", "transform",
      ],
      shortDescription: "Advanced image editing using Gemini 3 Pro Image via OpenRouter",
      fullInstructions: `## Gemini 3 Pro Editing (OpenRouter)

Advanced image editing with Google's latest model. Supports mask for inpainting.`,
      loading: { deferLoading: true },
      requiresSession: true,
      enableEnvVar: "OPENROUTER_API_KEY",
    } satisfies ToolMetadata,
    ({ sessionId }) => createOpenRouterGemini3ProImageEdit(sessionId!)
  );

  // Gemini 3 Pro Image - Reference
  registry.register(
    "referenceImageGemini3Pro",
    {
      displayName: "Reference Image (Gemini 3 Pro)",
      category: "image-generation",
      keywords: [
        "reference", "style", "transfer", "image", "gemini", "google", "pro",
        // Virtual try-on and fashion keywords
        "try on", "try-on", "virtual try-on", "clothing", "outfit", "fashion",
        "style transfer", "guided generation",
      ],
      shortDescription: "Advanced reference-guided generation using Gemini 3 Pro Image via OpenRouter",
      fullInstructions: `## Gemini 3 Pro Reference (OpenRouter)

Advanced reference-guided generation and style transfer. Adjust reference_strength (0-1).`,
      loading: { deferLoading: true },
      requiresSession: true,
      enableEnvVar: "OPENROUTER_API_KEY",
    } satisfies ToolMetadata,
    ({ sessionId }) => createOpenRouterGemini3ProImageReference(sessionId!)
  );

  // Video Assembly Tool (NOT a legacy tool - uses FFmpeg, not STYLY IO API)
  registry.register(
    "assembleVideo",
    {
      displayName: "Assemble Video",
      category: "video-generation",
      keywords: [
        "assemble",
        "video",
        "compile",
        "montage",
        "slideshow",
        "combine",
        "edit",
        "production",
        "transitions",
        "remotion",
      ],
      shortDescription:
        "Assemble session images and videos into a cohesive video with transitions and effects",
      fullInstructions: `## Video Assembly

Assemble session images/videos into a cohesive video using Remotion. AI-driven scene planning, transitions (fade/crossfade/slide/wipe/zoom), Ken Burns, text overlays.
Automatically uses all media from the current session. Rendering may take time for longer videos.`,
      loading: { deferLoading: true }, // Deferred - discover via searchTools
      requiresSession: true,
    } satisfies ToolMetadata,
    ({ sessionId }) => createVideoAssemblyTool(sessionId!)
  );

  // ============================================================
  // PRODUCT GALLERY TOOL - Display product images for selection
  // ============================================================

  // Show Product Images Tool (always loaded - essential for shopping & try-on UX)
  registry.register(
    "showProductImages",
    {
      displayName: "Product Gallery",
      category: "utility",
      keywords: [
        "product",
        "image",
        "gallery",
        "show",
        "display",
        "preview",
        "shopping",
        "try-on",
        "reference",
        "find",
        "recommend",
        "buy",
        "purchase",
        "floor tiles",
        "furniture",
        "clothing",
        "decor",
      ],
      shortDescription:
        "REQUIRED: Display products with images and purchase links for ALL shopping/product queries",
      fullInstructions: `## Product Gallery — MANDATORY for product queries

**ALWAYS call** after finding products via webSearch/webBrowse. Never skip when you have product info.

**Workflow:** webSearch → webBrowse (extract images/prices/URLs) → showProductImages immediately.
Each product needs: id, name, imageUrl (required), price, sourceUrl (purchase link).`,
      loading: { deferLoading: true }, // Deferred - discovered via searchTools when shopping
      requiresSession: false,
    } satisfies ToolMetadata,
    () =>
      tool({
        description:
          "REQUIRED for ALL product/shopping queries: Display products with images and purchase links. MUST be called after webSearch/webBrowse when user asks for product recommendations (e.g., 'find floor tiles', 'recommend furniture'). Always include imageUrl and sourceUrl for each product.",
        inputSchema: jsonSchema<{
          query: string;
          products: Array<{
            id: string;
            name: string;
            imageUrl: string;
            price?: string;
            sourceUrl?: string;
            description?: string;
          }>;
        }>({
          type: "object",
          title: "DisplayProductsInput",
          description: "Input schema for displaying product gallery",
          properties: {
            query: {
              type: "string",
              description: "The search query used to find these products",
            },
            products: {
              type: "array",
              description: "Array of products to display in the gallery",
              items: {
                type: "object",
                properties: {
                  id: {
                    type: "string",
                    description: "Unique identifier for the product",
                  },
                  name: {
                    type: "string",
                    description: "Product name",
                  },
                  imageUrl: {
                    type: "string",
                    description: "URL of the product image",
                  },
                  price: {
                    type: "string",
                    description: "Product price (e.g., '$129.90')",
                  },
                  sourceUrl: {
                    type: "string",
                    description: "URL to the product page",
                  },
                  description: {
                    type: "string",
                    description: "Brief product description",
                  },
                },
                required: ["id", "name", "imageUrl"],
              },
            },
          },
          required: ["query", "products"],
        }),
        execute: async ({ query, products }) => {
          // Simply return the data - the UI component handles display
          console.log(
            `[showProductImages] Displaying ${products.length} products for query: "${query}"`
          );
          return {
            status: "success" as const,
            query,
            products,
          };
        },
      })
  );

  console.log(
    `[ToolRegistry] Registered ${registry.getToolNames().length} tools`
  );
}
