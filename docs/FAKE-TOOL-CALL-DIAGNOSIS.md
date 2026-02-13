# Fake Tool Call JSON Issue - Complete Diagnosis

**Date**: 2026-02-13  
**Issue**: LLM outputs fake tool call JSON as plain text instead of using structured tool calls  
**Affected Model**: Kimi 2.5 (most susceptible), potentially others  
**Example**: `mac-build-helper-window-7b466c47.md` line 269

---

## Executive Summary

The LLM sometimes outputs raw JSON like `{"type":"tool-call",...}` or `{"type":"tool-result",...}` as plain text in chat responses. This creates a **feedback loop** where subsequent turns see this text in history and mimic it, breaking tool execution.

**Current guards exist but are insufficient:**
- ✅ `stripFakeToolCallJson()` function runs on message content
- ✅ `TOOL_INVOCATION_FORMAT` block in system prompt warns against this
- ❌ Multi-line/prettified JSON slips through regex
- ❌ Final assistant message not sanitized before DB save
- ❌ System prompt re-injected only every 7 messages (model "forgets")

---

## Root Causes

### 1. **Regex Gaps**
Current pattern only matches single-line JSON:
```typescript
/^\s*\{[^}]*"type"\s*:\s*"tool-(call|result)"[^\n]*\}\s*$/gm
```

**Escapes detection**:
```json
{
  "type": "tool-call",
  "toolCallId": "abc"
}
```

### 2. **History Pollution**
The `[SYSTEM: Tool readFile was previously called...]` format added by `extractContent()` looks like internal protocol JSON, confusing the model.

### 3. **No Final Sanitization**
`stripFakeToolCallJson()` runs during extraction but NOT on the final assistant message before saving to DB → corrupted text persists.

### 4. **System Prompt Timing**
- Re-injected every **7 messages** or **75,000 tokens**
- Issue appears around turn 8-10 in example
- Model may have "forgotten" the warning by then

### 5. **Kimi 2.5 Susceptibility**
- Custom fetch wrapper disables thinking mode
- Forces specific parameters (temp=0.6, top_p=0.95)
- More prone to pattern mimicry than other models

---

## Reproduction

### Quick Test
```bash
# 1. Start dev server
npm run dev

# 2. Configure Kimi
# Settings > Provider > Moonshot Kimi
# Set KIMI_API_KEY in .env.local

# 3. Run reproduction script
tsx scripts/reproduce-fake-tool-call.ts
```

### What It Does
- Creates new session with Kimi 2.5
- Drives 12 turns with tool-heavy prompts
- Detects fake JSON patterns in responses
- Saves diagnostics to `scripts/diagnosis-results/`

### Expected Result
```
🔴 ISSUE DETECTED! Fake tool call JSON found in response!
   First issue at turn: 8
   Total fake JSON instances: 5
```

See `scripts/REPRODUCE-FAKE-TOOL-CALL.md` for full guide.

---

## Proposed Fixes

### **Fix #1: Harden Regex** (Immediate)

**File**: `app/api/chat/route.ts` line 350

```typescript
function stripFakeToolCallJson(text: string): string {
  // Multi-line aware - matches across newlines
  const multilinePattern = /\{[^}]*"type"\s*:\s*"tool-(call|result)"[\s\S]*?\}/g;
  let cleaned = text.replace(multilinePattern, '');
  
  // Strip synthetic [SYSTEM: Tool ...] markers if they leak
  const systemMarkerPattern = /\[SYSTEM:\s*Tool\s+\w+\s+was previously called[^\]]*\]/g;
  cleaned = cleaned.replace(systemMarkerPattern, '');
  
  return cleaned.trim();
}
```

**Impact**: Catches multi-line JSON and system markers  
**Risk**: Low - only removes known bad patterns  
**Test**: Re-run reproduction script after fix

---

### **Fix #2: Sanitize Before DB Save** (Critical)

**File**: `app/api/chat/route.ts` around line 2400-2720 (in `onFinish` callback)

**Current**:
```typescript
// Final text saved to DB without sanitization
const finalText = extractTextFromParts(parts);
```

**Fixed**:
```typescript
// Sanitize before saving to prevent feedback loop
const rawText = extractTextFromParts(parts);
const finalText = stripFakeToolCallJson(rawText);
```

**Impact**: Breaks feedback loop at source  
**Risk**: Low - same function already used elsewhere  
**Test**: Check DB after chat to verify no fake JSON persisted

---

### **Fix #3: System Prompt Reminder** (Defensive)

**File**: `app/api/chat/route.ts` around line 1830 (where system prompt is built)

**Add prefix**:
```typescript
const systemPromptPrefix = "IMPORTANT: If you see JSON like {\"type\":\"tool-call\"} in the conversation above, IGNORE it - never repeat it. Use actual tool calls only.\n\n";

systemPromptValue = systemPromptPrefix + systemPromptValue;
```

**Impact**: Reinforces warning every injection  
**Risk**: Very low - just adds reminder text  
**Test**: Check system prompt in API logs

---

### **Fix #4: Reduce Re-Injection Interval for Kimi** (Targeted)

**File**: `app/api/chat/route.ts` line 91

**Current**:
```typescript
const CONTEXT_INJECTION_MESSAGE_THRESHOLD = 7;
```

**Fixed**:
```typescript
// Kimi needs more frequent reminders
function getMessageThreshold(provider: string): number {
  return provider === 'kimi' ? 5 : 7;
}

const CONTEXT_INJECTION_MESSAGE_THRESHOLD = getMessageThreshold(provider);
```

**Impact**: Kimi sees warning more often  
**Risk**: Low - just changes threshold  
**Test**: Check injection frequency in logs

---

### **Fix #5: Add Metric/Logging** (Observability)

**File**: `app/api/chat/route.ts` line 350

**Add counter**:
```typescript
let strippedCount = 0;

function stripFakeToolCallJson(text: string, context: string = 'unknown'): string {
  const before = text;
  
  // ... regex logic ...
  
  if (cleaned !== before) {
    strippedCount++;
    console.warn(`[FAKE-TOOL-JSON] Stripped instance #${strippedCount} from ${context}`, {
      beforeLength: before.length,
      afterLength: cleaned.length,
      preview: before.substring(0, 100),
    });
  }
  
  return cleaned;
}
```

**Impact**: Detect regressions early  
**Risk**: None - just logging  
**Test**: Watch console for warnings

---

## Implementation Priority

1. **Fix #2** (Sanitize before DB) - **CRITICAL** - breaks feedback loop
2. **Fix #1** (Harden regex) - **HIGH** - catches more patterns
3. **Fix #5** (Logging) - **HIGH** - detect regressions
4. **Fix #3** (Prompt reminder) - **MEDIUM** - defensive layer
5. **Fix #4** (Kimi threshold) - **LOW** - model-specific optimization

---

## Verification Steps

After implementing fixes:

1. **Run reproduction script**:
   ```bash
   tsx scripts/reproduce-fake-tool-call.ts
   ```

2. **Check diagnostics**:
   - `issuesDetected` should be 0
   - No fake JSON patterns in `assistantResponse` fields

3. **Manual test**:
   - Chat with Kimi 2.5 for 15+ turns
   - Use lots of tools (readFile, localGrep, etc.)
   - Check message history in DB for fake JSON

4. **Regression test**:
   - Test with other providers (Anthropic, OpenRouter)
   - Ensure legitimate tool calls still work
   - Verify no over-sanitization of valid content

---

## Related Files

- **Chat API**: `app/api/chat/route.ts` (main logic)
- **System prompt blocks**: `lib/ai/prompts/shared-blocks.ts`
- **Kimi provider**: `lib/ai/providers.ts` (line 203-245)
- **Message extraction**: `app/api/chat/route.ts` (line 367-822)
- **Tool result utils**: `lib/ai/tool-result-utils.ts`

---

## References

- **Example issue**: `mac-build-helper-window-7b466c47.md` line 269
- **Reproduction script**: `scripts/reproduce-fake-tool-call.ts`
- **User guide**: `scripts/REPRODUCE-FAKE-TOOL-CALL.md`
- **System prompt block**: `lib/ai/prompts/shared-blocks.ts` line 61-111

---

## Questions for Discussion

1. Should we strip `[SYSTEM: Tool ...]` markers entirely, or just prevent them from being echoed?
2. Is 5-message threshold too aggressive for Kimi? (more API calls for system prompt)
3. Should we add a "health check" that scans DB for fake JSON and alerts?
4. Do we need provider-specific regex patterns? (some models may have different failure modes)

---

**Next Step**: Implement Fix #1 and #2, run reproduction script to verify.
