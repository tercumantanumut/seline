# Seline Issues Tracker
> Auto-updated daily at 9 AM Istanbul time by Seline Architect

## Summary
- **Last Updated:** 2026-02-03
- **Last Checked:** 2026-02-03 20:37 UTC+3
- **Open Issues:** 7
- **New Today:** 0
- **Researched:** 8

---

## Active Issues

### #50 - Drag & Drop and Ctrl+V Paste for Chat Input
- **Status:** 🔴 Open
- **Reporter:** @DoudouDoudouk
- **Created:** 2026-02-03
- **Priority:** Medium
- **Labels:** None
- **Last Checked:** 2026-02-03 20:05 UTC+3
- **GitHub Comment:** [Analysis posted](https://github.com/tercumantanumut/seline/issues/50#issuecomment-3842540226)

#### Problem Summary
User requests drag & drop support for adding files/images to chat input, and Ctrl+V paste support for quickly adding clipboard content.

#### Implementation Plan

**Current State:**
The Composer component (`components/assistant-ui/thread.tsx`) uses `assistant-ui` library's `ComposerPrimitive`:
- ✅ Has attachment button (paperclip icon) at line 751-760
- ✅ Can add attachments via `threadRuntime.composer.addAttachment(file)` (line 132)
- ❌ No drag-and-drop handlers (`onDrop`, `onDragOver`)
- ❌ No paste handlers (`onPaste`) for clipboard images

**Affected Files:**
- `components/assistant-ui/thread.tsx` (lines 639-838) - Composer component

**Phase 1: Clipboard Paste Support**

```typescript
// Add to Composer component (around line 420)
const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
  const items = e.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const file = item.getAsFile();
      if (file) {
        await threadRuntime.composer.addAttachment(file);
        toast.success(t("composer.imagePasted"));
      }
      return;
    }
  }
}, [threadRuntime, t]);
```

**Phase 2: Drag & Drop Support**

```typescript
const [isDragging, setIsDragging] = useState(false);

const handleDrop = useCallback(async (e: React.DragEvent) => {
  e.preventDefault();
  setIsDragging(false);
  const files = Array.from(e.dataTransfer.files);
  const imageFiles = files.filter(f => f.type.startsWith('image/'));
  for (const file of imageFiles) {
    await threadRuntime.composer.addAttachment(file);
  }
}, [threadRuntime]);
```

**Effort Estimate:** 1.25 days

---

### #49 - 404 Page on "My Agents" Button After Agent Creation
- **Status:** 🔴 Open
- **Reporter:** @DoudouDoudouk
- **Created:** 2026-02-03
- **Priority:** High (Blocker)
- **Labels:** None
- **Last Checked:** 2026-02-03 20:05 UTC+3
- **GitHub Comment:** [Analysis posted](https://github.com/tercumantanumut/seline/issues/49#issuecomment-3842538181)

#### Problem Summary
After completing agent creation, clicking "My Agents" button leads to a 404 page. User must close and reopen the app to recover.

#### Implementation Plan

**Root Cause:**
The success page links to `/characters` but this route does not exist. The actual agent list is at `/` (root).

**File:** `components/character-creation/terminal-pages/success-page.tsx` (line 149)

```tsx
<Link
  href="/characters"  // ❌ This route doesn't exist!
  ...
>
  {t("myAgents")}
</Link>
```

**App Route Structure:**
- `/` → CharacterPicker (agent list) ✅
- `/chat/[id]` → Chat interface ✅
- `/agents/[id]/...` → Agent details ✅
- `/characters` → ❌ Does not exist (404)

**Fix:** Change line 149 from `/characters` to `/`

**Effort Estimate:** 5 minutes

---

### #46 - MCP Configuration: "Nothing to configure" in Agent Creation
- **Status:** 🔴 Open
- **Reporter:** @DoudouDoudouk
- **Created:** 2026-02-03
- **Priority:** Medium
- **Labels:** enhancement, help wanted, question
- **Last Checked:** 2026-02-03 20:05 UTC+3
- **GitHub Comment:** [Analysis posted](https://github.com/tercumantanumut/seline/issues/46#issuecomment-3842164176)

#### Problem Summary
During agent creation wizard, the MCP Tools step shows "No MCP Servers configured" with nothing to configure. This is because MCP servers must be set up in global Settings first, not during agent creation — but this isn't clear to users.

#### Implementation Plan

**Root Cause Analysis:**
The `MCPToolsPage` component (`components/character-creation/terminal-pages/mcp-tools-page.tsx`) fetches from `/api/mcp` to get configured servers. If no servers exist in global settings, it shows an empty state with no guidance.

**Affected Files:**

1. **`components/character-creation/terminal-pages/mcp-tools-page.tsx`** (lines 85-121)
   - `loadData()` fetches MCP config but shows empty state without guidance
   - No link to Settings for configuration

2. **`components/character-creation/terminal-wizard.tsx`** (lines 99-107)
   - `wizardSteps` doesn't filter out MCP step when no servers configured

**Proposed Solution (Option A + B combined):**

```typescript
// terminal-wizard.tsx - Skip MCP step when no servers configured
const wizardSteps = useMemo(() => {
  return WIZARD_STEPS.filter(step => {
    if (step.id === "mcpTools" && !hasMcpServers) return false;
    if (step.id === "vectorSearch" && !vectorDBEnabled) return false;
    return true;
  });
}, [hasMcpServers, vectorDBEnabled]);
```

```typescript
// mcp-tools-page.tsx - Add helpful guidance when empty
{tools.length === 0 && !isLoading && (
  <div className="text-center py-8 space-y-4">
    <p className="text-terminal-muted">
      MCP servers are configured in Settings, not during agent creation.
    </p>
    <Button variant="outline" asChild>
      <Link href="/settings?tab=mcp" target="_blank">
        Configure MCP Servers →
      </Link>
    </Button>
    <p className="text-xs text-terminal-muted">
      You can skip this step and configure MCP later.
    </p>
  </div>
)}
```

**Effort Estimate:** 0.5 days

---

### #45 - Vector Search Clarification in Agent Creation
- **Status:** 🔴 Open
- **Reporter:** @DoudouDoudouk
- **Created:** 2026-02-03
- **Priority:** Low
- **Labels:** enhancement, help wanted, question
- **Last Checked:** 2026-02-03 20:05 UTC+3
- **GitHub Comment:** [Analysis posted](https://github.com/tercumantanumut/seline/issues/45#issuecomment-3842165708)

#### Problem Summary
The agent creation wizard has separate steps for "Embeddings / Vector Search / Knowledge" which is confusing. User suggests consolidating into one "Knowledge & Search" area.

#### Implementation Plan

**Root Cause Analysis:**
The wizard currently has 3 separate steps for related concepts:
- Knowledge Base (upload documents)
- Embedding Setup (configure provider)
- Vector Search (sync codebase folders)

**Affected Files:**

1. **`components/character-creation/terminal-wizard.tsx`** (lines 26-39)
   - `WizardPage` type and `PROGRESS_PAGES` define separate steps

2. **`components/character-creation/terminal-pages/`**
   - `knowledge-base-page.tsx`
   - `embedding-setup-page.tsx`
   - `vector-search-page.tsx`

**Proposed Solution:**

```
┌─────────────────────────────────────────────────────────────────┐
│  Simplified Wizard Flow                                         │
├─────────────────────────────────────────────────────────────────┤
│  1. Identity           → Name, tagline, purpose                 │
│  2. Knowledge & Search → Combined step with tabs:               │
│     ├── Documents      (upload PDFs, markdown)                  │
│     ├── Codebase       (sync folders for code search)           │
│     └── Settings       (embedding provider - collapsed/advanced)│
│  3. Capabilities       → Enable built-in tools                  │
│  4. MCP Tools          → Select MCP server tools                │
│  5. Preview            → Review and create                      │
└─────────────────────────────────────────────────────────────────┘
```

**Effort Estimate:** 
- Quick fix (reorder + better labels): 0.5 days
- Full consolidation (combined page): 2-3 days

---

### #44 - Seline Identity & Channels Confusion
- **Status:** 🔴 Open
- **Reporter:** @DoudouDoudouk
- **Created:** 2026-02-03
- **Priority:** High
- **Labels:** enhancement, help wanted, question
- **Last Checked:** 2026-02-03 20:05 UTC+3
- **GitHub Comment:** [Analysis posted](https://github.com/tercumantanumut/seline/issues/44#issuecomment-3842168740)

#### Problem Summary
Seline doesn't know about her own platform context. When asked about "channels" (Slack/Telegram integrations in sidebar), she hallucinates about Instagram because the system prompt lacks platform awareness.

#### Implementation Plan

**Root Cause Analysis:**
Looking at `lib/ai/prompts/base-system-prompt.ts` (lines 105-113), the default agent config only has basic identity without platform context.

**Chosen Solution: Pre-made "Seline" Main Agent with Platform Memories**

Per owner feedback, implementing Option B: Create a default "Seline" agent that ships with platform awareness via pre-seeded Agent Memory entries.

**Affected Files (New):**

1. **`lib/characters/templates/types.ts`** (new file)
   - Template type definitions

2. **`lib/characters/templates/seline-default.ts`** (new file)
   - Default Seline agent template with memories

3. **`lib/characters/templates/index.ts`** (new file)
   - Template registry and auto-creation logic

**Proposed Implementation:**

```typescript
// lib/characters/templates/seline-default.ts
export const SELINE_DEFAULT_TEMPLATE: AgentTemplate = {
  id: "seline-default",
  name: "Seline",
  tagline: "Your AI companion on the Seline platform",
  purpose: "A helpful AI assistant that understands the Seline platform...",
  isDefault: true,
  enabledTools: ["docsSearch", "webSearch"],
  memories: [
    {
      category: "domain_knowledge",
      content: "I am Seline, the default AI agent on the Seline platform...",
      reasoning: "Core identity for the default agent",
    },
    {
      category: "domain_knowledge", 
      content: "The left sidebar shows: chat history, scheduled tasks, and channels (Slack/Telegram integrations).",
      reasoning: "Platform UI awareness",
    },
    {
      category: "domain_knowledge",
      content: "When users ask about 'channels' in Seline, they mean Slack/Telegram integrations, NOT social media.",
      reasoning: "Prevent hallucination about social media",
    },
  ],
};
```

**Open Questions:**
1. Should default agent be deletable or protected?
2. Should existing users get the default agent retroactively?

**Effort Estimate:** 1.5 days

---

### #43 - Tool Call Verbosity in Chat
- **Status:** 🔴 Open
- **Reporter:** @DoudouDoudouk
- **Created:** 2026-02-03
- **Priority:** Medium-High
- **Labels:** enhancement, help wanted, question
- **Last Checked:** 2026-02-03 20:05 UTC+3
- **GitHub Comment:** [Analysis posted](https://github.com/tercumantanumut/seline/issues/43#issuecomment-3842171355)

#### Problem Summary
When multiple tools are launched, each creates a separate block taking 200-400px of vertical space. Collectively they consume too much space, making chat hard to follow.

#### Implementation Plan

**Root Cause Analysis:**
Looking at `components/assistant-ui/tool-fallback.tsx`, each tool call is rendered as a full card with icon, status, and expanded results. No grouping or collapsing mechanism exists.

**Affected Files:**

1. **`components/assistant-ui/tool-fallback.tsx`** (lines 480+)
   - `ToolFallback` component renders each tool call separately
   - No compact/grouped mode

**Proposed Solution: Inline Compact Mode with Grouping**

```
┌─────────────────────────────────────────────────────────────────┐
│  BEFORE: Each tool = separate block (400-600px total)           │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 🔍 webSearch                              Processing... │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 🖼️ generateImage                         Processing... │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  AFTER: Grouped inline badges (~50px, expandable)               │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ ✓ webSearch (5) • ✓ generateImage • ⏳ analyze [Details]│    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

**Implementation:**

```typescript
// components/assistant-ui/tool-fallback.tsx - New grouped component

function ToolCallGroup({ toolCalls }: { toolCalls: ToolCall[] }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <div className="border rounded-lg p-2 bg-terminal-bg/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          {toolCalls.map((call, i) => (
            <ToolCallBadge key={i} {...call} />
          ))}
        </div>
        <button onClick={() => setIsExpanded(!isExpanded)}>
          {isExpanded ? "Hide" : "Details"}
        </button>
      </div>
      {isExpanded && (
        <div className="mt-2 space-y-2 border-t pt-2">
          {toolCalls.map((call, i) => (
            <ToolCallDetail key={i} {...call} />
          ))}
        </div>
      )}
    </div>
  );
}

function ToolCallBadge({ toolName, status, result }) {
  const icon = status === "running" ? "⏳" : status === "error" ? "❌" : "✓";
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs">
      {icon} {toolName}
    </span>
  );
}
```

**Effort Estimate:** 1.5 days

---

### #17 - Ripgrep error
- **Status:** 🔴 Open
- **Reporter:** @tercumantanumut
- **Created:** 2026-01-15
- **Priority:** Medium
- **Last Checked:** 2026-02-03 20:05 UTC+3

#### Problem Summary
GPT often encounters ripgrep tool failures that then recover. The error appears intermittent, suggesting transient failures in the ripgrep subprocess execution rather than a fundamental configuration issue.

#### Implementation Plan

**Root Cause Analysis:**
The ripgrep wrapper in `lib/ai/ripgrep/ripgrep.ts` spawns a child process but lacks:
1. Retry logic for transient spawn failures
2. Timeout protection for searches that hang
3. Graceful degradation when ripgrep binary is temporarily unavailable

**Affected Files:**

1. **`lib/ai/ripgrep/ripgrep.ts`** (lines 174-263)
   - `searchWithRipgrep()` function spawns process without timeout
   - Error handling only catches exit code 2, not spawn failures
   - No retry mechanism for transient errors

2. **`lib/ai/ripgrep/tool.ts`** (lines 305-340)
   - Tool wrapper catches errors but doesn't retry
   - Returns generic error message without diagnostic info

**Proposed Changes:**

```typescript
// lib/ai/ripgrep/ripgrep.ts - Add timeout and retry logic

const RIPGREP_TIMEOUT_MS = 30000; // 30 second timeout
const MAX_RETRIES = 2;

export async function searchWithRipgrep(options: RipgrepOptions): Promise<RipgrepSearchResult> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            return await executeRipgrepSearch(options, RIPGREP_TIMEOUT_MS);
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            console.warn(`[ripgrep] Attempt ${attempt + 1} failed:`, lastError.message);
            
            if (attempt < MAX_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
            }
        }
    }
    
    throw lastError;
}
```

**Effort Estimate:** 1-2 days

---

## Recently Closed

### #16 - When I come back to all agent interface, it stops working on background inside of codebase
- **Status:** ✅ Closed
- **Reporter:** @DoudouDoudouk
- **Created:** 2026-01-14
- **Closed:** 2026-02-02 (detected)
- **Priority:** High

#### Problem Summary
When a user navigates away from an active chat (back to the agent picker/list), any ongoing AI operations (streaming responses, tool executions, codebase operations) are terminated. The user expects background processing to continue.

*(Full implementation plan archived - see git history)*

---

## Change Log
- **2026-02-03 20:05:** Added 2 new issues (#49, #50) with full implementation plans. All issues have GitHub comments posted with analysis.
- **2026-02-03 19:54:** Added 4 new issues (#43, #44, #45, #46) with full implementation plans. All issues have GitHub comments posted with analysis.
- **2026-02-02 19:02:** Daily check completed. No new issues. Issue #16 moved to Recently Closed (closed on GitHub).
- **2026-02-01 23:58:** Daily check completed. No new issues found.
- **2026-02-01:** Initial tracker created. Researched issues #16 and #17 with implementation plans.
