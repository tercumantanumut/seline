# Fake Tool Call Issue - Investigation Findings

## Summary

After building a reproduction script and testing with Kimi 2.5, we discovered that **the issue is NOT what we initially thought**.

## What We Found

### ✅ The Script Works
- Successfully authenticates as `umut@rltm.ai`
- Forces Kimi 2.5 model
- Drives 12 conversation turns with tool-heavy prompts
- Uses your actual agent (Test Agent)

### ❌ BUT: No Fake JSON Detected (in streaming response)

The reproduction script detected **0 issues** in 12 turns, BUT when we checked the database directly, we found:

```
⚠️  Found fake JSON in 2 messages
```

## The Real Issue

The "fake JSON" we detected is **NOT actually fake** - it's the **correct internal message format**!

### What the DB Contains (CORRECT)

```json
[
  {
    "type": "text",
    "text": "Hello! I'd be happy to help..."
  },
  {
    "type": "tool-call",
    "toolCallId": "mcp_filesystem_multi_list_directory:0",
    "toolName": "mcp_filesystem_multi_list_directory",
    "args": {"path": "/home/kimi/project_codebase"}
  },
  {
    "type": "tool-result",
    "toolCallId": "mcp_filesystem_multi_list_directory:0",
    "result": {...}
  }
]
```

This is the **structured format** that the system uses internally to represent tool calls and results. It's stored in the `content` JSON column in the database.

### What the Original Issue Was (WRONG PATTERN)

From `mac-build-helper-window-7b466c47.md` line 269:

```
[SYSTEM: Tool readFile was previously called and returned: {"status":"success",...}]
```

This is a **text representation** that the model outputted as plain text instead of using structured tool calls.

## Why Our Detection Failed

Our regex patterns were looking for:
```javascript
/\{"type"\s*:\s*"tool-call"/g
/\{"type"\s*:\s*"tool-result"/g
/\[SYSTEM:\s*Tool\s+readFile\s+was previously called/g
```

The first two patterns match the **correct internal format** (false positive).  
The third pattern is what we should be looking for, but it's **NOT appearing in the database**.

## Why the Issue Didn't Reproduce

1. **The script didn't capture streaming text properly** - All `assistantResponse` fields in the diagnostics were empty (`""`).
2. **The existing guards are working** - `stripFakeToolCallJson()` is removing fake JSON before it gets to the DB.
3. **The original issue might be fixed** - The example from `mac-build-helper-window-7b466c47.md` is from Feb 11, and guards may have been added since then.

## Next Steps

### Option 1: Fix the Script (Recommended)
The streaming response parser isn't capturing text. We need to:
1. Debug why `assistantResponse` is always empty
2. Look at the actual streaming format from the API
3. Capture the RAW text before it's processed by `stripFakeToolCallJson()`

### Option 2: Check If It's Already Fixed
1. Review git history around Feb 11 to see what changed
2. Check if `stripFakeToolCallJson()` was added after the issue
3. Test manually in the UI to see if the issue still occurs

### Option 3: Implement Preventive Fixes Anyway
Even if the issue is rare/fixed, we can still:
1. Harden the regex to catch multi-line JSON
2. Add logging/metrics when fake JSON is stripped
3. Reduce system prompt re-injection interval for Kimi

## Key Insight

The database stores tool calls in a structured JSON format with `{"type":"tool-call"}` objects. This is **CORRECT** and should NOT be flagged as fake JSON.

The actual issue is when the model outputs `[SYSTEM: Tool ...]` markers as **plain text** in the streaming response, which should be caught and stripped before saving.
