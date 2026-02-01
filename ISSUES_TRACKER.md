# Seline Issues Tracker
> Auto-updated daily at 9 AM Istanbul time by Seline Architect

## Summary
- **Last Updated:** 2026-02-01
- **Last Checked:** 2026-02-01 23:58 UTC+3
- **Open Issues:** 2
- **New Today:** 0
- **Researched:** 2

---

## Active Issues

### #17 - Ripgrep error
- **Status:** 🔴 Open
- **Reporter:** @tercumantanumut
- **Created:** 2026-01-15
- **Priority:** Medium
- **Last Checked:** 2026-02-01 23:58 UTC+3

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
                // Exponential backoff: 100ms, 200ms
                await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
            }
        }
    }
    
    throw lastError;
}

// Add timeout to spawn
const rg = spawn(rgPath, args, {
    timeout: RIPGREP_TIMEOUT_MS,
});
```

```typescript
// lib/ai/ripgrep/tool.ts - Enhanced error reporting (line ~336)

} catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Search failed";
    const isTimeout = errorMessage.includes("timeout") || errorMessage.includes("ETIMEDOUT");
    
    return {
        status: "error",
        error: isTimeout 
            ? `Search timed out after 30s. Try a more specific pattern or smaller scope.`
            : `ripgrep error: ${errorMessage}. The tool will retry automatically.`,
        pattern,
        searchedPaths: searchPaths,
    };
}
```

**Edge Cases:**
- Large codebases with millions of files → Add `--max-filesize` flag
- Binary files causing hangs → Already handled with `--json` mode
- Permission errors on folders → Log warning, continue with accessible paths

**Type Safety:**
- No schema changes needed
- Error types already properly typed in `LocalGrepResult`

**Effort Estimate:** 1-2 days
- Implementation: 4 hours
- Testing with various failure scenarios: 4 hours
- Edge case handling: 2 hours

---

### #16 - When I come back to all agent interface, it stops working on background inside of codebase
- **Status:** 🔴 Open
- **Reporter:** @DoudouDoudouk
- **Created:** 2026-01-14
- **Priority:** High
- **Last Checked:** 2026-02-01 23:58 UTC+3

#### Problem Summary
When a user navigates away from an active chat (back to the agent picker/list), any ongoing AI operations (streaming responses, tool executions, codebase operations) are terminated. The user expects background processing to continue.

#### Implementation Plan

**Root Cause Analysis:**
The chat system is tightly coupled to React component lifecycle:

1. **`components/chat-provider.tsx`** (lines 322-332):
   ```typescript
   const runtime = useChatRuntime({
       id: sessionId,
       transport: new BufferedAssistantChatTransport({...}),
       // Runtime destroyed when ChatProvider unmounts
   });
   ```
   When navigating away, `ChatProvider` unmounts → runtime destroyed → stream closed.

2. **No server-side stream persistence**: The `/api/chat` route streams directly to the client. When the client disconnects, the stream terminates.

3. **AbortController patterns** in hooks like `use-deep-research.ts` (line 68) and `use-web-browse.ts` (line 79) explicitly abort on unmount.

**Affected Files:**

1. **`components/chat-provider.tsx`** - Runtime lifecycle tied to mount
2. **`components/character-picker.tsx`** - No awareness of active sessions
3. **`app/api/chat/route.ts`** - No background execution mode
4. **`lib/hooks/use-deep-research.ts`** - Aborts on cancel
5. **`lib/hooks/use-web-browse.ts`** - Aborts on cancel

**Proposed Solution Architecture:**

```
┌─────────────────────────────────────────────────────────┐
│                    Option A: Quick Fix                   │
│         Keep stream alive, show reconnect UI            │
└─────────────────────────────────────────────────────────┘

1. DON'T unmount ChatProvider when navigating
   - Use CSS visibility instead of conditional rendering
   - Keep runtime alive in background

2. Add "Active Session" indicator to agent picker
   - Show which agents have ongoing operations
   - Allow quick return to active chat
```

```
┌─────────────────────────────────────────────────────────┐
│              Option B: Full Background Mode              │
│           Server-side execution with polling            │
└─────────────────────────────────────────────────────────┘

1. New API: POST /api/chat/background
   - Accepts same payload as /api/chat
   - Returns { runId: string } immediately
   - Executes in background, stores results in DB

2. New API: GET /api/chat/status/:runId
   - Returns current status, partial results
   - Client polls or uses SSE for updates

3. Session metadata tracks background runs
   - { backgroundRunId: "...", status: "running" }
```

**Recommended: Option A (Quick Fix)**

```typescript
// components/character-picker.tsx - Add active session awareness

interface CharacterSummary {
    // ... existing fields
    hasActiveSession?: boolean;
    activeSessionId?: string;
}

// Show indicator on cards with active sessions
{char.hasActiveSession && (
    <div className="absolute top-2 right-2">
        <span className="animate-pulse bg-green-500 rounded-full w-3 h-3" />
    </div>
)}
```

```typescript
// app/layout.tsx or similar - Keep ChatProvider mounted

// Instead of:
{currentView === 'chat' && <ChatProvider>...</ChatProvider>}

// Use:
<div className={currentView === 'chat' ? 'block' : 'hidden'}>
    <ChatProvider>...</ChatProvider>
</div>
```

**Edge Cases:**
- Multiple agents with active sessions → Track per-agent
- Memory usage with many hidden providers → Limit to 1-2 active
- Stale sessions after browser refresh → Clear on page load
- Mobile/PWA background restrictions → Warn user before navigation

**Type Safety:**
- Add `hasActiveSession?: boolean` to CharacterSummary interface
- Add session status tracking to session metadata type

**Effort Estimate:** 3-5 days

Option A (Quick Fix):
- Layout restructuring: 4 hours
- Active session tracking: 4 hours  
- UI indicators: 4 hours
- Testing: 8 hours

Option B (Full Implementation):
- Background API endpoints: 8 hours
- Polling/SSE client: 8 hours
- Database schema updates: 4 hours
- Testing: 8 hours

---

## Recently Closed
*No recently closed issues*

---

## Change Log
- **2026-02-01 23:58:** Daily check completed. No new issues found.
- **2026-02-01:** Initial tracker created. Researched issues #16 and #17 with implementation plans.
