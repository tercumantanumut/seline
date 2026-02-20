# 07 — Slash Command Skill Picker in Chat Input

## Problem
There is no way to discover or invoke skills directly from the chat. Users either go to Settings → Plugins or drop a file into the chat. The meeting requested a marketplace-like experience accessible from the chat input with a `/` keystroke.

**Meeting quote:**
> "I know that one agent does it in its chat session where the prompt input field is — you just write slash and you see all available skills in your database."
> "Maybe we can do a Mac app search — Spotlight search — where you press command and on the chat sessions again like a marketplace component modal you would see all the skills listed."

---

## Critical: What `/` Picker Inserts

**The `/run skillName` command does NOT work as a chat message.** The agent invokes skills exclusively through the `runSkill` tool (called internally by the LLM when it infers intent). There is no parser that converts `/run skillName` text into a tool call.

On skill selection, insert **natural language** instead:
```
Run the realEstateScraper skill
```

The agent's system prompt (from `formatSkillsForPromptFromSummary()`) already tells the LLM to call `runSkill` when user intent matches a trigger example. Natural language reliably triggers this.

Alternative for a more structured approach: call `threadRuntime.append({ role: "user", content: "Run the realEstateScraper skill" })` directly, bypassing the textarea entirely.

---

## Target Behavior

```
User types "/" at the start of a message (or after a space):

┌──────────────────────────────────────────────────────────────┐
│  Available Skills                    [🔍 search...]          │
│  ─────────────────────────────────────────────────────────  │
│  ▶ realEstateScraper    real estate image → renovation ideas  │
│    researchAgent        deep web research + summarize         │
│    socialMediaBot       post to social media on schedule      │
│    dataAnalyzer         analyze CSV/Excel files               │
│    meetingNotes         transcribe and summarize meetings      │
│  ─────────────────────────────────────────────────────────  │
│  ↑↓ navigate   Tab/Enter to select   Esc to close            │
└──────────────────────────────────────────────────────────────┘

   [/ realEstate...__________________________________]  [Send]
```

When selected, inserts:
```
Run the realEstateScraper skill
```
(not `/run realEstateScraper`)

---

## Implementation

### Architecture Notes Before Starting

1. **Chat input is a `<textarea>` in `components/assistant-ui/thread.tsx`** — confirmed at line 1663. Not contentEditable.
2. **`characterId` comes from context** (`useCharacter()` at line 1026) — not a prop on `Composer`
3. **Popover must be placed OUTSIDE `ComposerPrimitive.Root`** — same pattern as `FileMentionAutocomplete` at line 1618 — otherwise it's clipped by the composer box dimensions
4. **No `command.tsx` or `cmdk` library exists** — follow `FileMentionAutocomplete` pattern (custom div + buttons)

### Step 1: Add Slash Detection State to Composer

In `components/assistant-ui/thread.tsx` — find the `Composer` function:

```typescript
// Add state:
const [showSkillPicker, setShowSkillPicker] = useState(false);
const [skillPickerQuery, setSkillPickerQuery] = useState("");
const [selectedSkillIndex, setSelectedSkillIndex] = useState(0);
```

### Step 2: Detect `/` Using Cursor Position (Not Full String)

**Critical:** Run the regex against `inputValue.slice(0, cursorPosition)` — not the full string. The `cursorPosition` state already exists in the Composer (it's maintained in `onChange`). This prevents false triggers when `/` appears mid-string with cursor elsewhere.

```typescript
const handleInputChange = (value: string, cursor: number) => {
  setInputValue(value);
  setCursorPosition(cursor);

  // Detect "/" at start or after whitespace — slice to cursor position only
  const textToCursor = value.slice(0, cursor);
  const slashMatch = textToCursor.match(/(^|\s)\/(\w*)$/);
  if (slashMatch) {
    setShowSkillPicker(true);
    setSkillPickerQuery(slashMatch[2] || "");
    setSelectedSkillIndex(0);
  } else {
    setShowSkillPicker(false);
    setSkillPickerQuery("");
  }
};
```

### Step 3: Load Skills

```typescript
const { character } = useCharacter();  // already called in Composer

const [skills, setSkills] = useState<SkillRecord[]>([]);

useEffect(() => {
  // Gate on character id existing and not being the "default" placeholder
  if (!character?.id || character.id === "default") return;

  // status=active to exclude draft and archived skills
  resilientFetch<{ skills: SkillRecord[] }>(
    `/api/skills?characterId=${character.id}&status=active`
  ).then(({ data }) => {
    if (data?.skills) setSkills(data.skills);
  });
}, [character?.id]);

// Filter by query
const filteredSkills = skills
  .filter((s) =>
    s.name.toLowerCase().includes(skillPickerQuery.toLowerCase()) ||
    s.description?.toLowerCase().includes(skillPickerQuery.toLowerCase())
  )
  .slice(0, 8);
```

### Step 4: Integrate into `handleKeyDown` Delegation Chain

The existing `handleKeyDown` at lines 1148-1158 already delegates to `FileMentionAutocomplete` via a forwarded-ref `handleKeyDown` method. Add the slash picker to the **same chain**:

```typescript
const handleKeyDown = (e: React.KeyboardEvent) => {
  // 1. @mention handler first (existing)
  const mentionHandler = (mentionRef.current as unknown as { handleKeyDown?: ... }).handleKeyDown;
  if (mentionHandler && mentionHandler(e)) return;

  // 2. Slash skill picker handler
  if (showSkillPicker) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedSkillIndex((i) => Math.min(i + 1, filteredSkills.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedSkillIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      // Both Enter and Tab select — consistent with FileMentionAutocomplete
      e.preventDefault();
      if (filteredSkills[selectedSkillIndex]) {
        selectSkill(filteredSkills[selectedSkillIndex]);
      }
      return;
    }
    if (e.key === "Escape") {
      setShowSkillPicker(false);
      return;
    }
  }

  // 3. Default behavior (existing submit on Enter, etc.)
  ...existing handlers...
};
```

### Step 5: On Skill Selected

```typescript
const selectSkill = (skill: SkillRecord) => {
  // Insert natural language — NOT "/run skillName"
  const textToCursor = inputValue.slice(0, cursorPosition);
  const textAfterCursor = inputValue.slice(cursorPosition);

  // Replace the trailing "/ query" in the text-to-cursor portion
  const newTextToCursor = textToCursor.replace(/(^|\s)\/\w*$/, (match) => {
    const prefix = match.startsWith(" ") ? " " : "";
    return `${prefix}Run the ${skill.name} skill `;
  });

  setInputValue(newTextToCursor + textAfterCursor);
  setShowSkillPicker(false);

  // Focus back on input
  setTimeout(() => inputRef.current?.focus(), 0);
};
```

### Step 6: Skill Picker Popover UI

**Placement:** Outside `ComposerPrimitive.Root`, inside the outer `<div className="relative w-full">` — same position as `FileMentionAutocomplete`:

```tsx
{/* Placed BEFORE ComposerPrimitive.Root, not inside it */}
{showSkillPicker && (
  <div
    className="absolute bottom-full left-0 right-0 mb-2 z-50 rounded-lg border border-terminal-border bg-terminal-cream shadow-lg font-mono text-sm overflow-hidden"
  >
    {/* Header */}
    <div className="flex items-center justify-between px-3 py-2 border-b border-terminal-border/40">
      <span className="text-xs text-terminal-muted font-semibold tracking-wider uppercase">
        Skills
      </span>
      {skillPickerQuery && (
        <span className="text-xs text-terminal-muted">"{skillPickerQuery}"</span>
      )}
    </div>

    {/* Skill list or empty states */}
    <div className="max-h-52 overflow-y-auto">
      {skills.length === 0 ? (
        // No skills at all for this agent
        <div className="px-3 py-4 text-xs text-terminal-muted text-center">
          No skills available yet — drop a .md skill file into the chat,
          or visit Settings → Plugins.
        </div>
      ) : filteredSkills.length === 0 ? (
        // Skills exist but none match the query
        <div className="px-3 py-4 text-xs text-terminal-muted text-center">
          No skills match "{skillPickerQuery}"
        </div>
      ) : (
        filteredSkills.map((skill, i) => (
          <button
            key={skill.id}
            className={cn(
              "w-full flex items-start gap-3 px-3 py-2 text-left transition-colors",
              i === selectedSkillIndex
                ? "bg-terminal-green/10 text-terminal-dark"
                : "hover:bg-terminal-dark/5 text-terminal-dark/80"
            )}
            // IMPORTANT: onMouseDown + preventDefault to avoid blur race
            // DO NOT use onClick — textarea loses focus before click fires
            onMouseDown={(e) => {
              e.preventDefault();  // prevents textarea blur
              selectSkill(skill);
            }}
            onMouseEnter={() => setSelectedSkillIndex(i)}
          >
            <span className="text-terminal-green font-bold text-xs mt-0.5 shrink-0">/</span>
            <div className="flex-1 min-w-0">
              <span className="font-medium">{skill.name}</span>
              {skill.description && (
                <span className="ml-2 text-xs text-terminal-muted truncate">
                  {skill.description}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* Show "requires input" indicator for skills with required parameters */}
              {skill.inputParameters && Object.keys(skill.inputParameters).length > 0 && (
                <span className="text-[10px] text-amber-500 border border-amber-200 rounded px-1">
                  needs input
                </span>
              )}
              {skill.category && (
                <span className="text-[10px] text-terminal-muted">{skill.category}</span>
              )}
            </div>
          </button>
        ))
      )}
    </div>

    {/* Footer hint */}
    <div className="px-3 py-1.5 border-t border-terminal-border/40 text-[10px] text-terminal-muted/60 flex gap-3">
      <span>↑↓ navigate</span>
      <span>Tab/Enter to select</span>
      <span>Esc to close</span>
    </div>
  </div>
)}
<ComposerPrimitive.Root ...>
  {/* existing textarea here */}
</ComposerPrimitive.Root>
```

---

## Skills API Endpoint

Use existing: `GET /api/skills?characterId={id}&status=active`

**Critical:** The `status=active` parameter is required. Without it, `listSkillsForUser` returns skills of ALL statuses (draft, active, archived). Draft skills the user is still editing would appear in the picker and fail when "run".

Response shape (non-`all` path):
```json
{ "skills": [{ "id", "name", "description", "category", "icon", "inputParameters", "triggerExamples", "runCount" }] }
```

**Note on plugin skills:** `GET /api/skills` returns only DB skills (created in the skill editor or from conversations). Plugin skills (installed from `.zip` packages) are resolved at runtime by `listRuntimeSkills()` and have no public REST endpoint. The picker will therefore show DB skills only. Plugin skills are discoverable via Settings → Plugins. Accept this limitation or add a new `GET /api/skills/runtime` endpoint that calls `listRuntimeSkills()`.

---

## Skills With Required Parameters

Skills with `inputParameters` show a "needs input" badge. When the user selects such a skill, the inserted text includes a hint:
```
Run the realEstateScraper skill (I'll need: listingUrl)
```

The agent will ask for the missing parameter in its response if the user sends without providing it.

---

## Popover Position

Position the popover **above** the input field (`bottom-full`) to avoid covering chat messages. The chat input is at the bottom of the viewport so upward expansion is always correct. The sticky container does not have `overflow: hidden`, so the absolute positioning works without a Portal.

---

## Verification Steps

1. Open a chat session
2. Type `/` → skill picker appears above input
3. Continue typing `/res` → list filters to matching skills
4. Arrow key up/down → selection moves
5. Press Tab or Enter → input updates to "Run the <skillName> skill"
6. Press Escape → picker closes, input unchanged
7. Click on a skill (mousedown) → skill selected, focus returns to textarea (no blur race)
8. If agent has no skills → "No skills available yet" message shown
9. If query matches nothing → "No skills match '...'" message shown
10. Skills with required params show amber "needs input" badge
11. Click outside the picker → picker closes (blur on textarea)
12. Draft/archived skills do NOT appear in picker

---

## Gap Analysis & Missing Considerations

> The following were identified by codebase research on 2026-02-19 and have been incorporated into the plan above. Kept here for historical reference.

| # | Issue | Resolution |
|---|-------|-----------|
| 1 | `/run skillName` not a parsed command | Changed to insert natural language |
| 2 | Regex on full string causes false triggers | Changed to slice to cursor position |
| 3 | `characterId` from context not prop | Use `useCharacter()` hook |
| 5 | Popover must be outside `ComposerPrimitive.Root` | Placement note added |
| 6 | No `command.tsx` — follow `FileMentionAutocomplete` pattern | Custom div pattern used |
| 7 | API returns all statuses without filter | `?status=active` added |
| 9 | Required params need visual indicator | "needs input" badge added |
| 10 | `handleKeyDown` must join existing delegation chain | Chain integration shown |
| 10b | `Tab` key not handled | Added Tab as selection key |
| 11 | Plugin skills not in `/api/skills` | Documented as known limitation |
| 12 | "No skills" vs "no match" distinction | Two separate empty states added |
| 13 | `onClick` causes blur race — use `onMouseDown` + `preventDefault` | Corrected in picker button |
