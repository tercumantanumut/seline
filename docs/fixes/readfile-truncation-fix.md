# Read File Tool Truncation Fix

**Date:** 2026-02-16  
**Issue:** Read File tool was truncating output even when specific line ranges were requested  
**Status:** ✅ Fixed

---

## Problem Summary

The `readFile` tool was experiencing truncation when querying file ranges with `startLine` and `endLine` parameters (e.g., lines 430-480). Even though the tool correctly extracted the requested line range, the output was being truncated by the universal output limiter at ~12,000 characters (~3,000 tokens), resulting in incomplete output that cut off mid-line.

### User Impact
- Users requesting specific line ranges (e.g., lines 430-480) would receive truncated output (e.g., only lines 430-460)
- This made code inspection difficult and defeated the purpose of requesting specific line ranges
- The truncation notice suggested using `retrieveFullContent`, which was confusing since the user had already specified a limited range

---

## Root Cause Analysis

### 1. Line Range Logic Was Correct ✅
**Location:** `lib/ai/vector-search/tool.ts:782-790`

The tool properly extracted the requested line range. No issues here.

### 2. Output Limiter Was Too Aggressive ⚠️
**Location:** `lib/ai/tool-result-utils.ts:223` → `lib/ai/output-limiter.ts:150-265`

**The Problem:**
- `normalizeToolResultOutput` calls `limitToolOutput` on **every** tool result
- `limitToolOutput` enforces a **3,000 token limit** (~12,000 chars) on the **entire** tool output
- For readFile results with a `content` field containing formatted file content, this limit was applied **after** the line range had been correctly extracted

**Example Flow:**
1. User requests lines 430-480 (51 lines)
2. Tool correctly extracts those 51 lines ✅
3. Tool formats them with line numbers: `" 430 | <code>\n 431 | <code>\n..."`
4. Formatted content = ~15,000 characters
5. **Output limiter kicks in**: `limitToolOutput` truncates to 12,000 chars ❌
6. Result: User sees lines 430-460 (truncated mid-output)

---

## Solution Implemented

### Option 1: Exempt readFile from Output Limiting ✅ (Chosen)

**Rationale:**
- readFile already has **built-in safeguards**:
  - `MAX_FILE_SIZE_BYTES = 1MB` (prevents reading huge files)
  - `MAX_LINE_COUNT = 5000` (limits number of lines returned)
  - `MAX_LINE_WIDTH = 2000` (truncates extremely long lines)
- These limits are **more appropriate** for file reading than a blanket 3,000 token limit
- readFile is a **read-only, deterministic** tool — users explicitly request specific content
- Aligns with user expectations: requested lines = delivered lines

**Implementation:**

**File:** `lib/ai/tool-result-utils.ts`

```typescript
// Exempt readFile from universal output limiting
// readFile has its own built-in limits (MAX_FILE_SIZE_BYTES, MAX_LINE_COUNT, MAX_LINE_WIDTH)
// and users explicitly request specific line ranges — truncating defeats the purpose
const EXEMPT_TOOLS = new Set(["readFile"]);

// Apply token limit (universal safety net) — UNLESS tool is exempt
const limitResult = !EXEMPT_TOOLS.has(toolName)
  ? limitToolOutput(normalizedOutput, toolName, sessionId)
  : { limited: false, output: "", originalLength: 0, truncatedLength: 0, estimatedTokens: 0 };
```

**Changes Made:**
1. Added `EXEMPT_TOOLS` set containing `"readFile"`
2. Modified output limiting logic to skip exempt tools
3. Preserved all existing safety nets (tool-level, progress-level, context-level)

---

## Safety Nets Still in Place

Even with readFile exempted from the universal output limiter, multiple safety nets remain:

### 1. Tool-Level Limits (readFile)
- `MAX_FILE_SIZE_BYTES = 1MB` — prevents reading massive files
- `MAX_LINE_COUNT = 5000` — limits number of lines returned
- `MAX_LINE_WIDTH = 2000` — truncates extremely long individual lines

### 2. Progress-Level Limits
- `progress-content-limiter` (20,000 token limit) — applies to SSE streaming
- Prevents oversized payloads in the task event system

### 3. Context-Level Limits
- `compaction-service` — manages context window during conversation
- Automatically compacts old messages when context window fills up

---

## Testing

### New Tests Added
**File:** `tests/lib/ai/tool-result-utils.test.ts`

```typescript
describe("normalizeToolResultOutput - readFile exemption", () => {
  it("does not truncate readFile output with large content field", () => {
    // 20,000 chars (exceeds 12,000 char limit)
    const largeContent = "x".repeat(20000);
    const output = {
      status: "success",
      content: largeContent,
      filePath: "test.ts",
      lineRange: "1-1000",
    };

    const result = normalizeToolResultOutput("readFile", output);

    // Should NOT be truncated
    expect(resultOutput.content).toBe(largeContent);
    expect(resultOutput.truncated).toBeUndefined();
  });

  it("still applies output limiting to other tools like executeCommand", () => {
    // Verify other tools are still limited
    // ...
  });
});
```

### Test Results
```
✓ tests/lib/ai/tool-result-utils.test.ts (6 tests) 5ms
  ✓ does not truncate readFile output with large content field
  ✓ preserves readFile result structure without modification
  ✓ still applies output limiting to other tools like executeCommand
  ✓ still applies output limiting to localGrep
  ✓ handles readFile with Knowledge Base source
  ✓ handles readFile error results without modification
```

### Full Test Suite
- ✅ All new tests pass
- ✅ No regressions in existing tests
- ✅ readFile exemption works as expected
- ✅ Other tools still have output limiting applied

---

## Files Modified

1. **`lib/ai/tool-result-utils.ts`** (7 lines added)
   - Added `EXEMPT_TOOLS` set
   - Modified output limiting logic to skip exempt tools

2. **`tests/lib/ai/tool-result-utils.test.ts`** (176 lines, new file)
   - Comprehensive test coverage for readFile exemption
   - Verifies other tools still have output limiting

---

## Benefits

1. ✅ **readFile now returns complete line ranges** — no mid-output truncation
2. ✅ **Minimal code change** — low risk of introducing bugs
3. ✅ **Preserves existing safety nets** — multiple layers of protection remain
4. ✅ **Aligns with user expectations** — requested lines = delivered lines
5. ✅ **No impact on other tools** — executeCommand, localGrep, etc. still have output limiting

---

## Future Considerations

### Should Other Tools Be Exempted?

**Candidates:**
- `vectorSearch` — already has domain-specific result limiting
- `docsSearch` — similar to readFile (structured document retrieval)

**Recommendation:** Monitor user feedback. If similar issues arise with other tools, evaluate on a case-by-case basis.

---

## Git Commit Message

```
fix(tools): exempt readFile from universal output limiting

The readFile tool was being truncated by the universal 3,000 token output
limiter even when users requested specific line ranges. This defeated the
purpose of requesting a limited range (e.g., lines 430-480) since the output
would still be truncated mid-range.

readFile has its own robust built-in limits:
- MAX_FILE_SIZE_BYTES (1MB)
- MAX_LINE_COUNT (5000 lines)
- MAX_LINE_WIDTH (2000 chars per line)

These domain-specific limits are more appropriate than a blanket token limit.
Users explicitly request specific content, and truncating defeats the purpose.

Changes:
- Added EXEMPT_TOOLS set in tool-result-utils.ts
- Modified output limiting logic to skip exempt tools
- Added comprehensive test coverage

Safety nets still in place:
- Tool-level limits (MAX_FILE_SIZE_BYTES, MAX_LINE_COUNT, MAX_LINE_WIDTH)
- Progress-level limits (progress-content-limiter, 20K tokens)
- Context-level limits (compaction-service)

Fixes: readFile truncation issue
Tests: tests/lib/ai/tool-result-utils.test.ts (6 tests, all passing)
```
