# 01 — Create Agent Modal (Replace Full-Page Wizard Entry)

## Problem
Clicking "Create New Agent" on the home page navigates away to `/create-character` — a 9-step full-page terminal wizard. This is a massive commitment for a new user who just wants to try the app.

**Meeting quote:**
> "When you click on create an agent, it should open it in a pop-up modal where you choose the pre-made models and see them very fast without going to creating agent screen."
> "Mostly you should be ready to chatting after this."

---

## Current Behavior

```
Home page (/)
    │
    ▼
[Create New Agent card]  ← is a <Link href="/create-character">
    │
    ▼ (full page navigation)
/create-character ← 9-step wizard
    Identity → Knowledge → Embedding → VectorSearch → Capabilities → MCP → Preview → Success
```

---

## Target Behavior

```
Home page (/)
    │
    ▼
[Create New Agent card]  ← is a <button> that opens a Dialog
    │
    ▼ (modal opens, no navigation)
┌─────────────────────────────────────────────────────────┐
│  Create an Agent                              ✕          │
│ ─────────────────────────────────────────────────────── │
│  [Quick Create]  [From Template]                        │
│                                                         │
│  Quick Create tab (default):                            │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Describe your agent in one sentence...          │    │
│  │                                                 │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│                    [Create & Chat →]                    │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│  Advanced setup →  (link to /create-character)          │
└─────────────────────────────────────────────────────────┘
```

```
From Template tab:
┌─────────────────────────────────────────────────────────┐
│  Create an Agent                              ✕          │
│ ─────────────────────────────────────────────────────── │
│  [Quick Create]  [From Template]                        │
│                                                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │
│  │  🤖 Seline  │ │ 📊 Data     │ │ 💬 Support  │       │
│  │  General AI │ │  Analyst    │ │   Agent     │       │
│  │ [Use →]     │ │ [Use →]     │ │ [Use →]     │       │
│  └─────────────┘ └─────────────┘ └─────────────┘       │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │
│  │ 📅 Project  │ │ 📱 Social   │ │ 📝 Meeting  │       │
│  │  Manager   │ │  Media Mgr  │ │   Notes     │       │
│  │ [Use →]     │ │ [Use →]     │ │ [Use →]     │       │
│  └─────────────┘ └─────────────┘ └─────────────┘       │
│                                                         │
│  Advanced setup →  (link to /create-character)          │
└─────────────────────────────────────────────────────────┘
```

---

## Dependency: Implement Doc 03 First

`DEFAULT_ENABLED_TOOLS` used in the Quick Create flow does not yet exist in the codebase. Doc 03 must be implemented before this modal to export that constant from `lib/characters/templates/resolve-tools.ts`.

---

## Files to Create / Modify

### New File: `components/character-creation/create-agent-modal.tsx`

```tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { resilientPost } from "@/lib/utils/resilient-fetch";
import { DEFAULT_ENABLED_TOOLS } from "@/lib/characters/templates/resolve-tools";

interface CreateAgentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

interface Template {
  id: string;
  name: string;
  tagline: string;
  category?: string;
}

export function CreateAgentModal({ open, onOpenChange, onCreated }: CreateAgentModalProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"quick" | "template">("quick");
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Load templates on mount
  useEffect(() => {
    if (!open) return;
    fetch("/api/characters/templates")
      .then((r) => r.json())
      .then((data) => {
        if (data?.templates) setTemplates(data.templates);
      })
      .catch(() => {/* fail silently */});
  }, [open]);

  // Quick Create flow — 2-step:
  // Step 1: POST /api/characters/quick-create { concept } → { success, agent: { name, tagline, purpose } }
  // Step 2: POST /api/characters { character: {name, tagline}, metadata: {purpose, enabledTools} }
  //         → { character: { id } }  (status: "active" by default)
  // Step 3: router.push(`/chat/${id}`)
  const handleQuickCreate = async () => {
    if (inputValue.trim().length < 10) return;
    setIsLoading(true);
    setError(null);

    try {
      // Step 1: Expand concept
      const { data: expandData, error: expandErr } = await resilientPost<{
        success: boolean;
        agent: { name: string; tagline: string; purpose: string };
      }>("/api/characters/quick-create", { concept: inputValue.trim() }, { retries: 0, timeout: 30000 });

      if (expandErr || !expandData?.agent) {
        throw new Error(expandErr || "Failed to generate agent profile");
      }

      const { name, tagline, purpose } = expandData.agent;

      // Step 2: Create active agent — POST /api/characters sets status "active" directly
      const { data: createData, error: createErr } = await resilientPost<{
        character: { id: string };
      }>(
        "/api/characters",
        {
          character: { name, tagline },
          metadata: { purpose, enabledTools: DEFAULT_ENABLED_TOOLS },
        },
        { retries: 0 }
      );

      if (createErr || !createData?.character?.id) {
        throw new Error(createErr || "Failed to create agent");
      }

      onCreated();
      onOpenChange(false);
      router.push(`/chat/${createData.character.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      // Check for "no model configured" scenario
      if (msg.includes("model") || msg.includes("provider") || msg.includes("API key")) {
        setError("No AI provider configured. Please add an API key in Settings first.");
      } else {
        setError(msg);
      }
      toast.error("Failed to create agent");
    } finally {
      setIsLoading(false);
    }
  };

  // Template flow:
  // POST /api/characters/templates/{id}/create → { success, characterId, templateId }
  const handleUseTemplate = async (templateId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: err } = await resilientPost<{
        success: boolean;
        characterId: string;  // key is "characterId" not "id"
        templateId: string;
      }>(`/api/characters/templates/${templateId}/create`, {}, { retries: 0 });

      if (err || !data?.characterId) {
        throw new Error(err || "Failed to create agent from template");
      }

      onCreated();
      onOpenChange(false);
      router.push(`/chat/${data.characterId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create from template");
      toast.error("Failed to create agent from template");
    } finally {
      setIsLoading(false);
    }
  };

  const isQuickCreateDisabled = isLoading || inputValue.trim().length < 10;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* DialogContent already provides a built-in ✕ close button — do NOT add another */}
      <DialogContent className="sm:max-w-[440px] bg-terminal-cream border-terminal-border font-mono">
        <DialogHeader>
          <DialogTitle className="font-mono text-terminal-dark">
            Create an Agent
          </DialogTitle>
        </DialogHeader>

        {error && (
          <p className="text-red-600 text-xs font-mono px-1">{error}</p>
        )}

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "quick" | "template")}>
          {/* Tab styling needs terminal overrides — default shadcn uses bg-muted */}
          <TabsList className="w-full bg-terminal-dark/10 rounded-md p-1">
            <TabsTrigger
              value="quick"
              className="flex-1 font-mono text-sm data-[state=active]:bg-terminal-cream data-[state=active]:text-terminal-green data-[state=active]:shadow-sm"
            >
              Quick Create
            </TabsTrigger>
            <TabsTrigger
              value="template"
              className="flex-1 font-mono text-sm data-[state=active]:bg-terminal-cream data-[state=active]:text-terminal-green data-[state=active]:shadow-sm"
            >
              From Template
            </TabsTrigger>
          </TabsList>

          <TabsContent value="quick" className="mt-4 space-y-4">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !isQuickCreateDisabled) {
                  handleQuickCreate();
                }
              }}
              placeholder="Describe your agent in one sentence..."
              className="w-full h-24 rounded border border-terminal-border bg-white px-3 py-2 font-mono text-xs text-terminal-dark resize-none focus:outline-none focus:ring-1 focus:ring-terminal-green"
              disabled={isLoading}
            />
            <p className="text-xs text-terminal-muted font-mono">
              {inputValue.length}/10 min chars
            </p>
            <Button
              onClick={handleQuickCreate}
              disabled={isQuickCreateDisabled}
              className="w-full bg-terminal-green hover:bg-terminal-green/90 text-white font-mono"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Creating...
                </>
              ) : (
                "Create & Chat →"
              )}
            </Button>
          </TabsContent>

          <TabsContent value="template" className="mt-4">
            {/* 8 templates total — grid-cols-3 on md+, grid-cols-2 on mobile */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
              {templates.length === 0 ? (
                <p className="col-span-3 text-xs text-terminal-muted font-mono text-center py-4">
                  Loading templates...
                </p>
              ) : (
                templates.map((tmpl) => (
                  <button
                    key={tmpl.id}
                    onClick={() => handleUseTemplate(tmpl.id)}
                    disabled={isLoading}
                    className="rounded-lg border border-terminal-border p-3 text-left cursor-pointer hover:border-terminal-green transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-white"
                  >
                    <p className="font-mono text-xs font-medium text-terminal-dark line-clamp-1">
                      {tmpl.name}
                    </p>
                    {tmpl.tagline && (
                      <p className="font-mono text-[10px] text-terminal-muted line-clamp-2 mt-0.5">
                        {tmpl.tagline}
                      </p>
                    )}
                    {isLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin mt-2 text-terminal-green" />
                    ) : (
                      <span className="text-[10px] text-terminal-green font-mono mt-1 block">
                        Use →
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>

        <div className="border-t border-terminal-border/40 pt-3 mt-2">
          <Link
            href="/create-character"
            className="text-xs text-terminal-muted hover:text-terminal-dark font-mono transition-colors"
            onClick={() => onOpenChange(false)}
          >
            Advanced setup →
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

---

### Modify: `components/character-picker.tsx`

**Two locations** must both be changed (not just one):

#### Location 1 — Main Create Card (line ~1628)

```tsx
// BEFORE:
<AnimatedCard data-animate-card hoverLift className="bg-terminal-cream/50 hover:bg-terminal-cream cursor-pointer">
  <Link href="/create-character" className="block h-full">
    ...
  </Link>
</AnimatedCard>

// AFTER — preserve AnimatedCard with data-animate-card for entrance animation:
<AnimatedCard
  data-animate-card
  hoverLift
  className="bg-terminal-cream/50 hover:bg-terminal-cream cursor-pointer"
  onClick={() => setCreateModalOpen(true)}
>
  <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-4 p-6">
    <div className="w-16 h-16 rounded-full bg-terminal-green/10 flex items-center justify-center shadow-sm">
      <Plus className="w-8 h-8 text-terminal-green" />
    </div>
    <div className="text-center">
      <p className="font-medium font-mono text-terminal-dark">{t("create")}</p>
      <p className="text-sm text-terminal-muted font-mono">{t("createDescription")}</p>
    </div>
  </div>
</AnimatedCard>
```

#### Location 2 — Empty State Button (line ~1843)

```tsx
// BEFORE:
<Link href="/create-character">
  <AnimatedButton className="gap-2 bg-terminal-green hover:bg-terminal-green/90 text-white font-mono">
    <Plus className="w-4 h-4" />
    {t("create")}
  </AnimatedButton>
</Link>

// AFTER:
<AnimatedButton
  onClick={() => setCreateModalOpen(true)}
  className="gap-2 bg-terminal-green hover:bg-terminal-green/90 text-white font-mono"
>
  <Plus className="w-4 h-4" />
  {t("create")}
</AnimatedButton>
```

#### Add state + modal render

Add at the top of the component with other state:
```tsx
const [createModalOpen, setCreateModalOpen] = useState(false);
```

Add near the end of the component JSX, alongside other dialogs:
```tsx
<CreateAgentModal
  open={createModalOpen}
  onOpenChange={setCreateModalOpen}
  onCreated={() => loadCharacters()}  // loadCharacters() — NOT refetchCharacters()
/>
```

Add import:
```tsx
import { CreateAgentModal } from "@/components/character-creation/create-agent-modal";
```

---

## API Endpoints Used

| Endpoint | Method | Purpose | Returns |
|----------|--------|---------|---------|
| `/api/characters/quick-create` | POST | Expand concept into name/tagline/purpose | `{ success, agent: { name, tagline, purpose } }` |
| `/api/characters` | POST | Create active agent with tools | `{ character: { id, ... } }` |
| `/api/characters/templates` | GET | Load template list | `{ templates: [...] }` |
| `/api/characters/templates/{id}/create` | POST | Create from template | `{ success, characterId, templateId }` |

**Why `POST /api/characters` instead of `POST /api/characters/draft`:**
- `/api/characters` sets `status: "active"` automatically — no extra PATCH needed
- `/api/characters/draft` hardcodes `status: "draft"` regardless of what you pass; requires a second PATCH call
- Both endpoints accept the nested body `{ character: {...}, metadata: {...} }`

---

## Quick Create — Corrected Two-Step Flow

```
Step 1: POST /api/characters/quick-create
  Body:    { concept: "A researcher that finds papers..." }
  Returns: { success: true, agent: { name: "ResearchBot", tagline: "...", purpose: "..." } }
           ↑ IMPORTANT: data is nested under "agent" key

Step 2: POST /api/characters
  Body:    {
             character: { name: "ResearchBot", tagline: "..." },
             metadata:  { purpose: "...", enabledTools: DEFAULT_ENABLED_TOOLS }
           }
           ↑ IMPORTANT: nested body shape — "purpose" goes in metadata, not in character
  Returns: { character: { id: "abc123", ... } }
           ↑ IMPORTANT: character id is at data.character.id

Step 3: router.push(`/chat/abc123`)
```

---

## Template Flow — Corrected

```
Step 1: POST /api/characters/templates/{templateId}/create
  Body:    {}
  Returns: { success: true, characterId: "abc123", templateId: "..." }
           ↑ IMPORTANT: key is "characterId" not "id"

Step 2: router.push(`/chat/abc123`)
  ↑ Use data.characterId — NOT data.id
```

---

## i18n Keys Required

Add to **both** `locales/en.json` and `locales/tr.json` under `picker.createModal`:

```json
"createModal": {
  "title": "Create an Agent",
  "quickCreateTab": "Quick Create",
  "fromTemplateTab": "From Template",
  "descriptionPlaceholder": "Describe your agent in one sentence...",
  "createAndChat": "Create & Chat",
  "creating": "Creating...",
  "advancedSetup": "Advanced setup →",
  "errorExpansion": "Failed to generate agent profile. Check your AI provider settings.",
  "errorCreation": "Failed to create agent. Please try again.",
  "useTemplate": "Use →",
  "loadingTemplates": "Loading templates...",
  "noTemplates": "No templates found",
  "minCharsHint": "Minimum 10 characters"
}
```

---

## UX Details & Edge Cases

- **Empty input**: "Create & Chat" button disabled when textarea has fewer than 10 chars
- **⌘+Enter**: Submits Quick Create (keyboard shortcut)
- **Escape key**: Close modal (handled by Dialog automatically)
- **Mobile**: Modal goes full-screen on mobile (`sm:max-w-[440px]` on desktop)
- **After creation**: Close modal, call `loadCharacters()`, navigate to chat
- **No model configured**: Show specific error "Please configure an AI provider in Settings first" (detect by error message containing "model", "provider", or "API key")
- **Auth expiry**: 401 errors from mutation calls should show "Session expired, please reload"
- **`{retries: 0}`**: All creation calls must pass `retries: 0` to prevent duplicate agent creation on 5xx errors
- **Templates**: 8 templates exist (including Seline default); all show in the grid
- **DialogContent close button**: Already built into the component — do NOT add a manual ✕ button

---

## Verification Steps

1. Open home page → click "Create Agent" → modal opens (no full-page navigation)
2. Quick Create tab: type "A cooking assistant" (10+ chars) → click Create & Chat → spinner → chat opens
3. Templates tab: click "Use →" on Data Analyst → spinner → chat opens
4. "Advanced setup →" link → navigates to /create-character wizard
5. Press Escape or click backdrop → modal closes without creating
6. After creation → home page agent list shows new agent (loadCharacters refreshes)
7. Empty state button (no agents page) → also opens modal
8. If no AI provider configured → shows specific error message, not generic one

---

## Gap Analysis & Missing Considerations

> The following were identified by codebase research on 2026-02-19 and have been incorporated into the implementation plan above. Kept here for historical reference.

| # | Issue | Severity | Resolution in Plan |
|---|-------|----------|--------------------|
| 1 | `draft/route.ts` ignores `status: "active"` | **Critical** | Use `POST /api/characters` instead |
| 2 | `quick-create` returns `{ agent: {...} }` not flat object | **Critical** | Read `data.agent.name` etc. |
| 3 | Template create returns `characterId` not `id` | **Critical** | Use `data.characterId` |
| 5 | `DEFAULT_ENABLED_TOOLS` does not exist yet | **Blocker** | Implement doc 03 first |
| 6 | Second create link in empty state not mentioned | **High** | Updated Location 2 section |
| 14 | No i18n keys defined | **High** | Full key list added |
| 17 | `resilientPost` retries non-idempotent creation | **High** | `{ retries: 0 }` on all creation calls |
| 18 | PATCH body is nested, not flat | **High** | Using `POST /api/characters` avoids this |
| 7 | `AnimatedCard data-animate-card` must be preserved | **Medium** | Preserved in corrected snippet |
| 8 | `refetchCharacters()` doesn't exist — use `loadCharacters()` | **Medium** | Fixed |
| 9 | Toast uses `sonner` not shadcn useToast | **Medium** | `toast.error()` / `toast.success()` |
| 10 | Spinner: `Loader2 animate-spin` | **Medium** | Corrected in component code |
| 12 | DialogContent already has ✕ — don't add another | **Medium** | Note added |
| 13 | TabsList needs terminal aesthetic override | **Medium** | className overrides added |
| 20 | No model configured → show specific error | **Medium** | Error detection added |
| 23 | `quick-create` LLM call may take 15s — increase timeout | **Medium** | `{ timeout: 30000 }` added |
