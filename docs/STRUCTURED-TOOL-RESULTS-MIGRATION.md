# Structured Tool Results Migration

## Summary

This migration eliminates fake tool call hallucinations by standardizing on **structured tool results** throughout the chat pipeline. Previously, tool results were converted to text with `[SYSTEM: ...]` markers, which the model learned to mimic, causing fake tool call outputs.

## Problem

The model was outputting fake tool calls like:
```
[SYSTEM: Tool readFile was previously called and returned: {...}]
```

This happened because:
1. Tool results were converted to text with `[SYSTEM: ...]` markers in `extractContent()`
2. These markers appeared in conversation history
3. The model learned to mimic this pattern
4. The model started outputting fake tool call syntax as plain text

## Solution

### 1. System Prompt Updates (`lib/ai/prompts/shared-blocks.ts`)

Added comprehensive instructions about structured tool results:
- Clear explanation of how tool-result parts work
- Example flow showing tool-call → tool-result → assistant text
- Emphasis that tool results are ONLY in structured parts, never text markers
- Warning against outputting `[SYSTEM: ...]` markers

### 2. Chat Route Changes (`app/api/chat/route.ts`)

**Removed:**
- All `[SYSTEM: Tool ...]` text marker generation
- `getToolSummaryFromOutput` import (no longer needed)
- `MAX_EPHEMERAL_TOOL_RESULT_LENGTH` and `EPHEMERAL_TOOLS` constants
- `useToolSummaries` variable in `extractContent()`

**Changed:**
- `dynamic-tool` handling: Now only adds natural language references for image/video URLs, doesn't convert other tool outputs to text
- `tool-*` handling: Same approach - structured data preserved, only image/video URLs get text references

**Result:** Tool results remain as structured `tool-result` parts that the AI SDK handles natively.

### 3. Legacy Result Normalization (`lib/ai/tool-result-utils.ts`)

Added `normalizeLegacyToolResult()` function:
- Handles migration from old text-based results
- Detects and extracts content from `[SYSTEM: ...]` markers
- Wraps string results in proper structured format
- Returns objects as-is (already structured)

## How It Works

### Before (Problematic)
```
[User]: Find auth files
[Assistant - tool-call]: localGrep({pattern: "auth"})
[System text]: [SYSTEM: Tool localGrep was previously called and returned: {matchCount: 5, ...}]
[Assistant text]: I found 5 files...
```

The `[SYSTEM: ...]` text taught the model to output similar markers.

### After (Structured)
```
[User]: Find auth files
[Assistant - tool-call]: localGrep({pattern: "auth"})
[System - tool-result]: {type: "tool-result", toolCallId: "...", result: {matchCount: 5, ...}}
[Assistant text]: I found 5 files...
```

Tool results are structured parts, not text markers.

## Files Modified

1. `lib/ai/prompts/shared-blocks.ts` - Added structured tool results documentation
2. `app/api/chat/route.ts` - Removed `[SYSTEM: ...]` marker generation
3. `lib/ai/tool-result-utils.ts` - Added legacy result normalization

## Verification

The model should now:
1. ✅ See tool results as structured `tool-result` parts
2. ✅ NOT see `[SYSTEM: ...]` text markers in context
3. ✅ NOT output fake tool call syntax as text
4. ✅ Use proper structured tool calling via the AI SDK

## Backward Compatibility

- Existing conversations with `[SYSTEM: ...]` markers in history will still work
- The `normalizeLegacyToolResult()` function handles old string results
- New conversations will use pure structured results

## Testing Recommendations

1. Start a new conversation
2. Run a tool (e.g., `localGrep`, `readFile`)
3. Continue the conversation for several turns
4. Verify the model doesn't output fake `[SYSTEM: ...]` markers
5. Check that tool results are properly referenced in assistant responses
