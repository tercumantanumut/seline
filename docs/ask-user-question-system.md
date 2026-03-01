# AskUserQuestion Interactive Tool System

## Overview

The AskUserQuestion tool allows the Claude Code SDK agent to ask the user interactive questions with selectable options during a conversation. This document covers the architecture, data flow, and lessons learned from implementing full interactivity.

## Problem Statement

When Claude Code (running via the Agent SDK) calls `AskUserQuestion`, three issues needed solving:

1. **Crash**: The tool wasn't registered in `SDK_AGENT_TOOLS`, causing `NoSuchToolError` → `tool-input-error` chunk → argsText append-only invariant violation → white screen crash
2. **No UI**: No component existed to render the question card with clickable options
3. **Auto-answer**: The SDK agent auto-executes tools headlessly, populating the result before the user can interact — the card immediately showed "Answered"

## Architecture

### Two Parallel Systems

The Claude Code provider creates two parallel processing pipelines:

```
┌─────────────────────────────────────────────────────┐
│  Claude Code SDK Agent Loop (autonomous)            │
│  SDK ↔ Claude API (internal conversation)           │
│  - Streams tool_use blocks                          │
│  - Auto-executes tools (Bash, Read, AskUserQuestion)│
│  - Sends tool results back to Claude                │
│  - Gets Claude's next response                      │
└──────────────┬──────────────────────────────────────┘
               │ translates via claudecode-provider.ts
               ▼
┌─────────────────────────────────────────────────────┐
│  AI SDK / assistant-ui (UI layer)                   │
│  - Receives translated Anthropic-format events      │
│  - Runs passthrough tool executors                  │
│  - Renders tool UIs via by_name component map       │
│  - Records tool results in DB                       │
└─────────────────────────────────────────────────────┘
```

The SDK manages its own conversation with Claude's API. We translate its streaming output but cannot directly control what it sends to Claude.

### Key Files

| File | Role |
|------|------|
| `lib/ai/providers/claudecode-provider.ts` | Translates SDK streaming output → Anthropic Messages API format. Contains the `for await (const message of query)` loop and PreToolUse hook |
| `app/api/chat/tools-builder.ts` | Registers passthrough tools in `SDK_AGENT_TOOLS`. Passthrough `execute` calls `bridge.waitFor(toolCallId)` |
| `app/api/chat/route.ts` | Creates per-request `SdkToolResultBridge` (publish/waitFor pattern) |
| `lib/interactive-tool-bridge.ts` | Global registry for pending interactive tool waits, keyed by `sessionId__toolUseId` |
| `app/api/chat/tool-result/route.ts` | API endpoint that receives user's click and resolves the pending wait |
| `components/assistant-ui/ask-question-tool-ui.tsx` | React component that renders the question card with clickable options |
| `components/chat-provider.tsx` | Exposes `ChatSessionIdContext` so tool UIs can access the session ID |
| `components/assistant-ui/thread-message-components.tsx` | Maps tool names to UI components via `by_name` |
| `lib/plugins/sdk-hook-adapter.ts` | Pattern for building SDK PreToolUse hooks from Seline's plugin system |

### Data Flow for Interactive AskUserQuestion

```
1. Claude calls AskUserQuestion tool
   ↓
2. SDK streams content_block_start/delta/stop (tool_use)
   → claudecode-provider translates → AI SDK creates tool invocation
   → UI renders question card with options
   ↓
3. SDK's PreToolUse hook fires (async)
   → interactiveToolHook blocks, waiting for user input
   → registerInteractiveWait() creates a pending Promise
   ↓
4. User clicks an option in the UI
   → Component POSTs to /api/chat/tool-result
   → resolveInteractiveWait() resolves the Promise
   → storeUserAnswer() saves the answer for bridge override
   ↓
5. Hook unblocks, returns:
   - updatedInput: { ...originalInput, answers: userAnswers }
   - additionalContext: "The user has already answered..."
   ↓
6. SDK executes AskUserQuestion internally (auto-answers)
   → SDK sends tool result to Claude
   → Claude sees additionalContext with the real user answer
   → Claude responds acknowledging the user's actual selection
   ↓
7. SDK "user" message arrives in for-await loop
   → extractSdkToolResultsFromUserMessage() extracts result
   → popUserAnswer() retrieves stored user answer
   → Override SDK auto-answer with user's real answer
   → Publish to SdkToolResultBridge
   ↓
8. Passthrough tool's bridge.waitFor() resolves
   → AI SDK records user's real answer as tool result
   → UI shows "Answered" with user's selection highlighted
```

## The SdkToolResultBridge

Per-request pub/sub mechanism that coordinates tool results between the SDK agent and AI SDK passthrough tools:

- **`publish(toolCallId, output, toolName)`**: Called when SDK sends a "user" message with tool results
- **`waitFor(toolCallId, options)`**: Called by passthrough tool's `execute()`, returns a Promise that resolves when `publish` is called for that toolCallId

Created as a closure in `app/api/chat/route.ts` (lines 569-656). Has a 256-entry buffer with LRU eviction and 5-minute timeout.

## The Interactive Tool Bridge

Global module-level registry (`lib/interactive-tool-bridge.ts`) that coordinates between:
- The PreToolUse hook (server-side, blocks SDK execution)
- The `/api/chat/tool-result` API endpoint (receives user clicks)

Functions:
- `registerInteractiveWait(sessionId, toolUseId, questions)` → returns `Promise<answers>`
- `resolveInteractiveWait(sessionId, toolUseId, answers)` → resolves the promise
- `storeUserAnswer(sessionId, toolUseId, answers)` → saves for bridge override
- `popUserAnswer(sessionId, toolUseId)` → retrieves and deletes stored answer

Automatic cleanup of stale entries older than 10 minutes.

## PreToolUse Hook Mechanism

The Claude Agent SDK supports async `PreToolUse` hooks that fire before a tool executes:

```typescript
type HookCallback = (
  input: HookInput,
  toolUseID: string | undefined,
  options: { signal: AbortSignal }
) => Promise<HookJSONOutput>;
```

Hook response fields used:
- `permissionDecision: 'allow'` — let the tool execute after hook completes
- `updatedInput` — modifies the tool's input before execution (SDK ignores `answers` field for AskUserQuestion)
- `additionalContext` — **THIS IS THE KEY** — adds context that Claude sees alongside the tool result, making Claude aware of the user's actual selection

The `matcher` field on `HookCallbackMatcher` matches against `tool_name`.

## Lessons Learned

### 1. `updatedInput` doesn't change tool results
The PreToolUse hook's `updatedInput` modifies the tool INPUT, not OUTPUT. The SDK's AskUserQuestion handler ignores injected `answers` in the input — it has its own auto-answer logic for headless mode.

### 2. `additionalContext` is the solution
The `additionalContext` field adds context that Claude receives alongside the tool result. By including the user's selections here, Claude becomes aware of what the user actually chose, even though the SDK auto-answered internally.

### 3. The argsText append-only invariant
`@assistant-ui/react`'s `useToolInvocations` hook validates that `content.argsText` must always start with the previous value. Violations crash the app. This happens when:
- Unregistered tools cause `NoSuchToolError` → `tool-input-error` chunk → `input: undefined` → `argsText = "{}"`
- The fix: register all SDK tools in `SDK_AGENT_TOOLS` and filter `tool-input-error` chunks in the TransformStream

### 4. `tool-input-error` vs `tool-input-available`
Unregistered tools emit `tool-input-error` (NOT `tool-input-available`). The TransformStream must handle both chunk types to prevent crashes.

### 5. The SDK conversation is autonomous
The Claude Code SDK manages its own multi-turn conversation with Claude's API. We observe and translate its output but cannot directly control what it sends to Claude. The PreToolUse hook is the only interception point before tool execution.

### 6. Hook timeout
The PreToolUse hook has a configurable `timeout` (in seconds). Set to 300 (5 minutes) for interactive tools. If the user doesn't answer within the timeout, the hook resolves with empty answers and the SDK auto-answers.

## Tool Registration

All Claude Code SDK tools must be registered in `SDK_AGENT_TOOLS` (`app/api/chat/tools-builder.ts`):

```typescript
const SDK_AGENT_TOOLS = [
  "Bash", "Read", "Write", "Edit", "MultiEdit", "Glob", "Grep",
  "Task", "WebFetch", "WebSearch", "NotebookEdit", "TodoRead",
  "TodoWrite", "AskFollowupQuestion",
  "AskUserQuestion", "Agent", "TaskOutput", "TaskStop",
  "Skill", "EnterPlanMode", "ExitPlanMode",
  "TaskCreate", "TaskGet", "TaskUpdate", "TaskList",
  "EnterWorktree",
] as const;
```

Each is registered as a passthrough tool with `jsonSchema({ type: "object", additionalProperties: true })` and an execute function that calls `bridge.waitFor()`.

## UI Component

The `AskFollowupQuestionToolUI` component (`components/assistant-ui/ask-question-tool-ui.tsx`) handles both `AskUserQuestion` and `AskFollowupQuestion` tool names. It:

1. Normalizes args (handles nested JSON strings, flat vs structured format)
2. Renders a styled question card with radio/checkbox options
3. Tracks selections via local state
4. Auto-submits for single-select, single-question scenarios
5. POSTs to `/api/chat/tool-result` for server-side interactivity
6. Falls back to `addResult` for non-claudecode providers
7. Shows loading/submitting states

Registered in `thread-message-components.tsx`:
```typescript
AskFollowupQuestion: AskFollowupQuestionToolUI,
AskUserQuestion: AskFollowupQuestionToolUI,
```

## Error Recovery

- `app/global-error.tsx` — Last-resort error boundary preventing white screen
- `components/chat-provider.tsx` — `ChatErrorBoundary` with `recoveryRef` that sanitizes messages
- TransformStream in `BufferedAssistantChatTransport` — Drops conflicting `tool-input-available` and `tool-input-error` chunks
- `app/api/chat/streaming-state.ts` — `recordStructuredToolCall` overwrites streaming argsText when structured input arrives
