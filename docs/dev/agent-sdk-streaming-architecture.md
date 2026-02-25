# Agent SDK Streaming & Session State Architecture

Technical reference for how the Claude Agent SDK integrates with Seline's streaming pipeline, how foreground/background session modes work, and how the frontend maintains synchronized state across SSE events, polling, and the `@assistant-ui/react` runtime.

---

## Table of Contents

1. [High-Level Data Flow](#high-level-data-flow)
2. [Provider Architecture](#provider-architecture)
3. [Foreground Streaming Path](#foreground-streaming-path)
4. [Background Processing Path](#background-processing-path)
5. [Task Lifecycle & SSE Events](#task-lifecycle--sse-events)
6. [Frontend State Stores](#frontend-state-stores)
7. [Foreground vs Background Detection](#foreground-vs-background-detection)
8. [Status Indicators](#status-indicators)
9. [Reconnection & Recovery](#reconnection--recovery)
10. [Key Files Reference](#key-files-reference)
11. [Common Pitfalls](#common-pitfalls)

---

## High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Client)                            │
│                                                                     │
│  ┌──────────────┐    ┌──────────────────┐    ┌──────────────────┐  │
│  │ ChatProvider  │    │ useTaskNotifi-   │    │ session-sync-    │  │
│  │ (useChat +   │    │ cations (SSE)    │    │ store (Zustand)  │  │
│  │ useAISDK-    │    │                  │    │                  │  │
│  │ Runtime)     │    │ EventSource →    │    │ activeRuns,      │  │
│  │              │    │ /api/tasks/events│    │ sessionActivity  │  │
│  │ isRunning ─────►  │                  │    │                  │  │
│  │ "Responding" │    │ task:started ──────►  │ sidebar bubbles  │  │
│  └──────┬───────┘    │ task:completed ───►  │                  │  │
│         │            │ task:progress ────►  │                  │  │
│         │            └──────────────────┘    └──────────────────┘  │
│         │ POST                                                      │
│─────────┼───────────────────────────────────────────────────────────│
│         ▼                        SERVER                             │
│  ┌──────────────┐    ┌──────────────────┐    ┌──────────────────┐  │
│  │ /api/chat    │    │ taskRegistry     │    │ /api/tasks/      │  │
│  │ (route.ts)   ├───►│ (in-memory)      ├───►│ events (SSE)     │  │
│  │              │    │                  │    │                  │  │
│  │ streamText() │    │ register()       │    │ task:started     │  │
│  │ + provider   │    │ updateStatus()   │    │ task:completed   │  │
│  │              │    │ complete()       │    │ task:progress    │  │
│  └──────────────┘    └──────────────────┘    └──────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

**Two independent event channels** flow to the client:

1. **Streaming response** — the `POST /api/chat` response body (AI SDK data stream protocol). Drives `isRunning` and token rendering in `@assistant-ui/react`.
2. **SSE task events** — `GET /api/tasks/events` long-lived connection. Drives sidebar activity bubbles, background processing indicators, and session-sync store.

These channels are deliberately decoupled. The streaming response handles the real-time token flow; SSE handles lifecycle metadata (start/complete/progress) for all task types.

---

## Provider Architecture

### Claude Agent SDK ("claudecode" provider)

```
lib/ai/providers/claudecode-provider.ts
```

The Agent SDK integrates via a **fetch interceptor** pattern:

1. `createClaudeCodeProvider()` creates an `@ai-sdk/anthropic` provider with a custom `fetch` implementation (`createClaudeCodeFetch`)
2. When `streamText()` in the chat route calls the Anthropic API, the interceptor routes the request through the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) instead
3. The SDK returns an async iterable of events (`stream_event`, `assistant`, `result`)
4. The interceptor converts these back to Anthropic SSE format so `@ai-sdk/anthropic` can parse them normally

This means the chat route's `streamText()` → `toUIMessageStreamResponse()` pipeline works identically for all providers. The claudecode provider is transparent at the API level.

### Direct SDK Query Paths

For background tasks that need full SDK capabilities (hooks, delegation, plugins):

- `queryWithSdkOptions()` — direct SDK `query()` call with retry/backoff. Used by scheduled tasks, delegations, and background pipelines.
- `createStreamingClaudeCodeResponse()` — streams SDK events as Anthropic SSE for real-time tool display. Used when the chat route needs SDK-native streaming (multi-turn with tool use).

---

## Foreground Streaming Path

When a user types a message in an active session:

```
thread-composer.tsx                 chat-provider.tsx               /api/chat (route.ts)
─────────────────                   ─────────────────               ──────────────────────
handleSubmit()
  │
  ├─ isQueueBlocked? ──► NO
  │
  └─ threadRuntime                  BufferedAssistant-              streamText()
     .composer.send() ──────────►   ChatTransport                  ├─ taskRegistry.register()
                                    .processResponseStream()       ├─ streamText({model, ...})
                                    (batches text-delta             └─ result.toUIMessage-
                                     50ms / 4000 char max)              StreamResponse()
                                           │
                                           ▼
                                    useAISDKRuntime(chat)
                                           │
                                    useThread(t => t.isRunning) ──► true
                                           │
                                    "Responding..." indicator
```

**Key points:**
- `ChatProvider` uses `useChat()` + `useAISDKRuntime()` (decomposed from `useChatRuntime`)
- This exposes `chat.setMessages` via `ChatSetMessagesContext`, enabling in-place thread updates during background polling without remounting
- `BufferedAssistantChatTransport` coalesces small text-delta chunks (configurable via `NEXT_PUBLIC_STREAM_BATCH_*` env vars) to reduce React re-renders
- `isRunning` from `useThread(t => t.isRunning)` is the source of truth for the "Responding..." status indicator
- The `ChatProvider` is keyed by `sessionId` — it only remounts on session switch, never during background polling

### In-Place Thread Updates

Background polling and SSE-triggered refreshes update the thread without remounting:

```
chat-interface.tsx                  chat-provider.tsx
──────────────────                  ─────────────────
reloadSessionMessages()
  │
  ├─ fetch /api/sessions/{id}/
  │  messages
  │
  ├─ setSessionState(uiMessages)
  │
  └─ chatSetMessagesRef.current     ChatSetMessagesContext
     (uiMessages) ──────────────►   chat.setMessages(msgs)
                                    (no remount, no scroll reset)
```

---

## Background Processing Path

A task is "background" when the user is NOT actively streaming in that session. Background tasks include:

| Task Type | triggerType | Metadata | Example |
|-----------|-------------|----------|---------|
| `scheduled` | `cron` | `scheduledRunId` | Cron-triggered agent run |
| `chat` (delegation) | `delegation` | `isDelegation: true` | Subagent working on behalf of parent |
| `channel` | `webhook` | `channelType` | Telegram/Slack message processing |

When a background task is detected:

```
chat-interface.tsx
──────────────────
useBackgroundProcessing()
  │
  ├─ isProcessingInBackground = true
  ├─ processingRunId = runId
  │
  ├─ startPollingForCompletion(runId)
  │   └─ every 2s: GET /api/agent-runs/{id}/status
  │       ├─ status=running → refreshMessages() (live updates)
  │       ├─ status=running + isZombie → stop polling, show zombie UI
  │       └─ status=completed → clear state, final refreshMessages()
  │
  └─ UI shows "Agent is processing in background" indicator
     with cancel button + animated dots
```

### Zombie Run Detection

If a run's heartbeat stops updating but the status is still "running", the polling endpoint marks it as `isZombie: true`. The frontend shows a "force stop" button instead of the normal cancel.

---

## Task Lifecycle & SSE Events

### Server Side: Task Registry

```
lib/background-tasks/registry.ts    →    app/api/tasks/events/route.ts
```

The `taskRegistry` is an in-memory store that:
- `register(task)` — adds a task and emits `task:started`
- `updateStatus(runId, status, task)` — updates and emits `task:progress`
- `complete(runId, status, task)` — completes and emits `task:completed`

The SSE endpoint (`/api/tasks/events`) subscribes to these events and streams them to all connected clients for that user. Events larger than 1MB are dropped. A heartbeat fires every 30 seconds.

### Client Side: Event Processing

```
lib/hooks/use-task-notifications.ts
```

The `useTaskNotifications()` hook:

1. Opens an `EventSource` to `/api/tasks/events`
2. On `task:started`:
   - Adds to unified tasks store (`addTask`)
   - Updates session-sync store (`setActiveRun`, `setSessionActivity`) — drives sidebar bubbles
   - **Only dispatches `background-task-started` window event for actual background tasks** (scheduled, delegation)
   - Shows toast notification if user is NOT viewing that session
3. On `task:completed`:
   - Completes in unified tasks store
   - Clears active run in session-sync store
   - **Only dispatches `background-task-completed` for actual background tasks**
   - Shows success/failure toast
4. On `task:progress`:
   - Updates task in store
   - Updates session activity indicators
   - Dispatches `background-task-progress` window event

**Important**: Scheduled chat tasks (with `scheduledRunId` in metadata) are silently ignored by the notification handler — they're managed by their own polling loop.

---

## Frontend State Stores

### 1. `@assistant-ui/react` Runtime State

```
Source: useThread(t => t.isRunning)
Scope: Current foreground stream only
Updates: Automatic from streaming response
```

This is the authoritative signal for "is the AI currently generating a response in this session." It's managed entirely by the `@assistant-ui/react` runtime and the `BufferedAssistantChatTransport`.

### 2. Unified Tasks Store (Zustand)

```
lib/stores/unified-tasks-store.ts
Store: useUnifiedTasksStore
```

Tracks all active tasks across all sessions:
- `tasks: UnifiedTask[]` — flat array of running/recently-completed tasks
- `tasksMap: Map<string, UnifiedTask>` — indexed by runId
- Selectors: `useActiveTasks`, `useActiveTaskCount`, `useRecentlyCompletedTasks`

Fed by `use-task-notifications.ts` SSE events.

### 3. Session Sync Store (Zustand)

```
lib/stores/session-sync-store.ts
Store: useSessionSyncStore
```

Tracks per-session metadata for the sidebar and cross-tab sync:
- `activeRuns: Map<string, string>` — sessionId → runId mapping
- `sessionActivityById: Map<string, SessionActivityState>` — rich activity indicators (drives `SessionActivityBubble`)
- `sessionContextStatusById` — context window pressure per session
- Selector: `useSessionHasActiveRun` — dual-checks in-memory + DB flag

### 4. Background Processing State (React)

```
components/chat/chat-interface-hooks.ts → useBackgroundProcessing()
```

Local to the current session view:
- `isProcessingInBackground` — boolean, shows background indicator
- `processingRunId` — the run being tracked
- `isZombieRun` — stale run detection
- `pollingIntervalRef` — 2s polling timer for run status

### State Priority

When rendering, the UI resolves status in this order:

1. `isRunning` (from `useThread`) → "Responding..." (foreground streaming)
2. `isProcessingInBackground` → "Agent is processing in background"
3. `isDeepResearchLoading` → "Researching..."
4. `isDeepResearchBackgroundPolling` → background research indicator
5. MCP reloading → "Initializing tools..."

---

## Foreground vs Background Detection

This is a critical distinction. Getting it wrong causes the bug where foreground Agent SDK streams show the background indicator.

### The Rule

A task is **foreground** if:
- The user is actively viewing the session
- The task was initiated by the user typing a message (`triggerType: "chat"`, no special metadata)
- The `@assistant-ui/react` runtime handles the streaming response

A task is **background** if:
- It's a `scheduled` task (cron job)
- It's a `chat` task with `isDelegation: true` metadata
- It's a `channel` task (webhook-triggered)

### Where the Filter is Applied

```typescript
// components/chat/chat-interface.tsx (module-level helper)
function isBackgroundTask(task: { type: string; metadata?: unknown }): boolean {
    return task.type === "scheduled" ||
        (task.type === "chat" && task.metadata != null &&
         typeof task.metadata === "object" && "isDelegation" in task.metadata);
}
```

This filter is used in:

1. **Zustand store bridge** (chat-interface.tsx) — only triggers `checkActiveRun` for background tasks
2. **Window event listeners** (chat-interface.tsx) — only responds to `background-task-started`/`completed` for background tasks
3. **SSE event dispatch** (use-task-notifications.ts) — only dispatches `background-task-started`/`completed` window events for background tasks

**All task types** still update the unified tasks store and session-sync store (for sidebar bubbles). The filter only controls whether the background-processing UI activates.

---

## Status Indicators

### "Responding..." (Foreground)

```
components/assistant-ui/thread-composer.tsx
```

Shown when `isRunning === true` (from `useThread`). Displays in the composer area above the input. Controlled entirely by the `@assistant-ui/react` runtime — no manual state management needed.

### "Agent is processing in background" (Background)

```
components/assistant-ui/thread-composer.tsx (lines 624-658)
```

Shown when `isProcessingInBackground || isDeepResearchBackgroundPolling`. Displays animated dots + cancel button. The cancel button calls `/api/agent-runs/{runId}/cancel`.

### Sidebar Activity Bubbles

```
components/chat/chat-sidebar/session-activity-bubble.tsx
```

Animated indicators on session list items. Driven by `SessionActivityState` from the session-sync store. Has a lifecycle: `entering → live → settling → archived` with a 2.5s grace period after the run ends.

### Queue Indicators

When `isQueueBlocked` (either foreground streaming or background task is active), new messages are queued rather than sent. The queue shows chips with statuses:
- `queued-live` — being submitted to live prompt queue API
- `injected-live` — successfully delivered to running model
- `queued-classic` — waiting for run to end before replay
- `fallback` — live injection failed, will replay

---

## Reconnection & Recovery

### SSE Reconnection

```
lib/hooks/use-task-notifications.ts
```

When the SSE connection drops:
- Exponential backoff: 1s → 2s → 4s → 8s → 16s → 30s max
- On reconnect: calls `reconcileTasks()` which fetches `/api/tasks/active` to sync missed events
- Dispatches `sse-tasks-reconciled` custom event on `window`
- `chat-interface.tsx` listens for this event and re-runs `checkActiveRunRef.current()` to detect any active runs missed during the disconnect

### Visibility Change Recovery

When the tab becomes visible again:
- If tracking a run (`processingRunId` exists): restarts polling + refreshes messages
- If no known run: calls `checkActiveRunRef.current()` to check for runs started while tab was hidden

### Stream Error Recovery

```
components/chat-provider.tsx → ChatErrorBoundary
```

The `ChatErrorBoundary` catches recoverable streaming errors:
- `argsText can only be appended` — tool streaming ordering error
- JSON `SyntaxError` — malformed tool call args during streaming
- `controller was closed` — interrupted stream
- `toolCallId not found` — race condition in tool processing

For recoverable errors: shows a loading spinner and auto-resets after 500ms.

### Message Sanitization

```
components/chat-provider.tsx → sanitizeMessagesForInit()
```

When loading initial messages, strips `input-streaming` tool parts that were persisted during interrupted Agent SDK streams. Without this, `@assistant-ui/react` crashes on init.

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `lib/ai/providers/claudecode-provider.ts` | Agent SDK fetch interceptor, direct query APIs, streaming response builder |
| `app/api/chat/route.ts` | Main chat endpoint — streamText, task registration, message persistence |
| `app/api/chat/streaming-state.ts` | Server-side streaming state management (parts, tool calls, step offsets) |
| `app/api/tasks/events/route.ts` | SSE endpoint for task lifecycle events |
| `lib/background-tasks/registry.ts` | In-memory task registry with event emission |
| `lib/background-tasks/types.ts` | Task type definitions (ChatTask, ScheduledTask, ChannelTask, UnifiedTask) |
| `components/chat-provider.tsx` | ChatProvider — useChat + useAISDKRuntime, error boundary, message sanitization |
| `components/chat/chat-interface.tsx` | Session orchestrator — background detection, SSE bridges, active run checking |
| `components/chat/chat-interface-hooks.ts` | useBackgroundProcessing (polling, cancel, refresh), useSessionManager (CRUD) |
| `lib/hooks/use-task-notifications.ts` | SSE client — EventSource to task stores, lifecycle event dispatch |
| `lib/stores/unified-tasks-store.ts` | Zustand store for all active tasks |
| `lib/stores/session-sync-store.ts` | Zustand store for per-session state (active runs, activity indicators) |
| `components/assistant-ui/thread-composer.tsx` | Composer — status messages, queue management, submit handling |
| `components/chat/chat-sidebar/session-activity-bubble.tsx` | Animated sidebar indicators |

---

## Common Pitfalls

### 1. All chat requests register tasks — not just background ones

The chat route registers a `ChatTask` in `taskRegistry` for every request (line 356 of route.ts). This is correct — the task registry provides observability for all runs. But the frontend must filter these to avoid treating foreground streams as background tasks.

**Rule**: Always use the `isBackgroundTask()` helper when deciding whether to activate the background processing UI.

### 2. Two independent event channels can race

The streaming response and SSE task events travel different paths. The SSE `task:started` event can arrive before the first streaming chunk, potentially triggering background mode before `isRunning` becomes true.

**Rule**: The Zustand store bridge in `chat-interface.tsx` has a 1.5s debounce specifically to avoid this race. Don't reduce this without understanding the timing.

### 3. Don't remount ChatProvider for message updates

Previously, the app used `useChatRuntime` which required remounting to update messages. Now with `useChat` + `useAISDKRuntime`, messages are updated in-place via `chat.setMessages`. Remounting causes scroll reset, streaming interruption, and SSE reconnection.

**Rule**: Only re-key `ChatProvider` on session switch (`chatProviderKey = sessionId`). Use `chatSetMessagesRef.current(uiMessages)` for all other updates.

### 4. The `shouldShowChatToast` helper checks URL, not React state

`use-task-notifications.ts` uses `window.location` to determine if the user is viewing a session. This works because the SSE handler runs outside React's render cycle. Don't try to replace this with React state — it would create stale closures.

### 5. Zombie detection is server-side

The `/api/agent-runs/{id}/status` endpoint determines if a run is a zombie based on heartbeat freshness. The frontend just renders the flag. Don't add client-side timeout logic — it would race with the server.
