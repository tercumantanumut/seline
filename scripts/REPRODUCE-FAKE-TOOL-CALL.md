# Fake Tool Call Issue Reproduction Guide

## Overview

This guide helps you reproduce the issue where the LLM (especially Kimi 2.5) outputs fake tool call JSON as plain text instead of using structured tool calls.

## The Issue

**Symptom**: The model outputs text like:
```json
{"type":"tool-call","toolCallId":"abc123","toolName":"readFile",...}
```

Or echoes back system markers:
```
[SYSTEM: Tool readFile was previously called and returned: {...}]
```

**Root Cause**: The model sees this format in conversation history and mimics it, creating a feedback loop.

## Prerequisites

1. **Dev server running**: `npm run dev` (port 3000)
2. **Kimi API key configured**: Set in Settings or `.env.local`:
   ```bash
   KIMI_API_KEY=your_moonshot_api_key_here
   ```
3. **Provider set to Kimi**: In Settings, select "Moonshot Kimi" as your provider

## Running the Reproduction Script

### Quick Start

```bash
# From project root
tsx scripts/reproduce-fake-tool-call.ts
```

### What It Does

1. **Creates a new chat session** with a unique ID
2. **Forces Kimi 2.5 model** (most susceptible to the issue)
3. **Drives 12 turns** of conversation with tool-heavy prompts:
   - Searches codebase with `localGrep`
   - Reads files with `readFile`
   - Mixes text responses with tool calls
4. **Monitors each response** for fake tool call JSON patterns
5. **Captures full history** after each turn
6. **Saves diagnostics** to `scripts/diagnosis-results/fake-tool-call-TIMESTAMP.json`

### Expected Output

```
🚀 Fake Tool Call Reproduction Script
=====================================

Server: http://localhost:3000
Model: kimi-k2.5
Session ID: 550e8400-e29b-41d4-a716-446655440000
Target turns: 12

✅ Server is running

🔧 Configuring session...
✅ Session configured

============================================================
Turn 1/12
============================================================
📤 Sending: "Hello! Can you help me understand this codebase?..."
[Assistant response streams here...]
✅ Response received

[... more turns ...]

============================================================
Turn 8/12
============================================================
📤 Sending: "Search for files that import 'shared-blocks'..."
[Response streaming...]
🔴 ISSUE DETECTED! Fake tool call JSON found in response!
   Instances: {"type":"tool-call", [SYSTEM: Tool readFile
✅ Response received

[... remaining turns ...]

============================================================
SUMMARY
============================================================
Total turns: 12
Issues detected: 3
First issue at turn: 8
Total fake JSON instances: 5

🔴 REPRODUCTION SUCCESSFUL - Issue detected!
   Review diagnostics at: scripts/diagnosis-results/fake-tool-call-2026-02-13T16-30-45-123Z.json

✅ Script complete
```

## Analyzing Results

### Diagnostics File Structure

```json
{
  "config": {
    "serverUrl": "http://localhost:3000",
    "model": "kimi-k2.5",
    "sessionId": "...",
    "targetTurns": 12
  },
  "timestamp": "2026-02-13T16:30:45.123Z",
  "totalTurns": 12,
  "issuesDetected": 3,
  "results": [
    {
      "turnNumber": 8,
      "userMessage": "Search for files...",
      "assistantResponse": "...",
      "containsFakeToolJson": true,
      "fakeJsonInstances": [
        "{\"type\":\"tool-call\"",
        "[SYSTEM: Tool readFile"
      ],
      "messageHistory": [...],
      "timestamp": "2026-02-13T16:30:45.123Z"
    }
  ],
  "summary": {
    "firstIssueAtTurn": 8,
    "totalFakeJsonInstances": 5
  }
}
```

### Key Metrics

- **First issue at turn**: When the problem first appears (usually 7-10)
- **Total fake JSON instances**: How many times the pattern appears
- **Message history**: Full conversation state at each turn

## Customization

Edit `scripts/reproduce-fake-tool-call.ts` to adjust:

### Change Model

```typescript
const CONFIG = {
  model: 'kimi-k2-thinking', // Try different Kimi models
  // ...
};
```

### Adjust Turn Count

```typescript
const CONFIG = {
  targetTurns: 20, // Test longer conversations
  // ...
};
```

### Custom Prompts

Replace `TEST_PROMPTS` array with your own:

```typescript
const TEST_PROMPTS = [
  "Your custom prompt 1",
  "Your custom prompt 2",
  // ...
];
```

## Troubleshooting

### Server Not Running

```
❌ Server is not running. Start it with: npm run dev
```

**Fix**: Run `npm run dev` in another terminal

### Provider Not Kimi

```
⚠️  Provider is anthropic, not kimi - this may affect results
```

**Fix**: Change provider in Settings UI or update `.env.local`:
```bash
LLM_PROVIDER=kimi
KIMI_API_KEY=your_key_here
```

### No Issues Detected

```
🟢 No issues detected in 12 turns
   This may indicate the issue is fixed or requires more turns
```

**Possible causes**:
- The fix is working (good!)
- Need more turns (increase `targetTurns`)
- Need different prompts (edit `TEST_PROMPTS`)
- Wrong model (ensure Kimi 2.5 is selected)

## Next Steps

Once you've reproduced the issue:

1. **Review diagnostics** to understand the pattern
2. **Test fixes** by modifying `app/api/chat/route.ts`
3. **Re-run script** to verify the fix works
4. **Compare before/after** diagnostics files

## Related Files

- **Reproduction script**: `scripts/reproduce-fake-tool-call.ts`
- **Fake JSON stripper**: `app/api/chat/route.ts` (line 350)
- **System prompt**: `lib/ai/prompts/shared-blocks.ts` (line 61)
- **Context injection logic**: `app/api/chat/route.ts` (line 99)

## Detection Patterns

The script detects these patterns as fake tool JSON:

```javascript
/\{"type"\s*:\s*"tool-call"/g
/\{"type"\s*:\s*"tool-result"/g
/\[SYSTEM:\s*Tool\s+readFile\s+was previously called/g
```

Add more patterns if needed in the `FAKE_JSON_PATTERNS` array.
