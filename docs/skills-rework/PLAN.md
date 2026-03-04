# Skills Page Rework — Implementation Plan

## Context

The current Seline skills UI is a basic CRUD list with terminal-mono styling, raw form inputs, and no visual hierarchy. Codex (OpenAI) ships a polished skills marketplace with branded icons, two-column grid cards, installed/recommended sections, search, and a detail modal with install/uninstall/try actions.

This rework brings Seline's skills page to that level while keeping Seline's design language (terminal-green accents, mono headings, motion via framer-motion).

---

## Reference: Codex Skills Architecture

From `openai/skills` repo:

```
skills/
  .system/          → Pre-installed (skill-creator, skill-installer)
  .curated/         → Marketplace catalog (34 skills)
    <skill-name>/
      SKILL.md        → Frontmatter (name, description) + body instructions
      agents/
        openai.yaml   → UI metadata: display_name, short_description, icon_small, icon_large, default_prompt
      scripts/        → Executable helpers
      references/     → Domain docs
      assets/         → Icons, templates
```

Key takeaway: Each skill has `display_name`, `short_description`, `icon_small` (SVG), `icon_large` (PNG), and `default_prompt` baked into `agents/openai.yaml`. The UI reads this metadata for the marketplace grid.

---

## What We're Building

### 1. Skills Main Page (`/skills`)

Replaces current `/skills/library` with a full-featured page matching Codex layout:

```
┌──────────────────────────────────────────────────────┐
│  Skills                                              │
│  Give Seline superpowers. Learn more                 │
│                                                      │
│  [Refresh]  [Search skills...]  [+ New skill]        │
│                                                      │
│  ── Installed ──────────────────────────────────────  │
│  ┌─────────────────┐  ┌─────────────────┐            │
│  │ 🎨 Skill Creator│  │ 📦 Notion       │            │
│  │ Create or update │  │ Notion API ...  │            │
│  │ [toggle on/off]  │  │ [toggle on/off] │            │
│  └─────────────────┘  └─────────────────┘            │
│                                                      │
│  ── Recommended ────────────────────────────────────  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐  │
│  │ Figma    │ │ Sentry   │ │ Vercel   │ │ PDF    │  │
│  │ desc...  │ │ desc...  │ │ desc...  │ │ desc.. │  │
│  │    [+]   │ │    [+]   │ │    [+]   │ │   [+]  │  │
│  └──────────┘ └──────────┘ └──────────┘ └────────┘  │
│  ... more rows ...                                   │
└──────────────────────────────────────────────────────┘
```

### 2. Skill Detail Modal

Click any skill card → opens a dialog/sheet (not a page navigation):

```
┌──────────────────────────────────────────┐
│  [X close]                               │
│  🔌 Figma                    Open folder ↗│
│  Use Figma MCP for design-to-code work   │
│                                          │
│  ## Overview                             │
│  Turn Figma designs into production-     │
│  ready code using the Figma MCP server.  │
│                                          │
│  ## Requirements                         │
│  - Figma MCP server connected            │
│                                          │
│  ## Workflow                             │
│  1. Connect Figma MCP                    │
│  2. Select design node                   │
│  3. Generate implementation code         │
│                                          │
│  [Uninstall]  [Disable]       [✏ Try]   │
└──────────────────────────────────────────┘
```

### 3. Pre-installed System Skills (Skill Creator + Notion)

Two skills ship with every agent by default — mirroring Codex's `skill-creator` and `skill-installer`. For Seline these are:

| System Skill | Purpose |
|---|---|
| **Skill Creator** | Guide for creating/updating skills (equivalent to Codex `skill-creator`) |
| **Notion** | Notion API integration (already exists as plugin, promoted to system skill) |

These show in the "Installed" section with toggle switches (enable/disable), not uninstall buttons.

### 4. Curated Skill Catalog

A static JSON catalog of recommended skills with metadata. Lives at:
```
lib/skills/catalog/
  index.ts          → Exports SKILL_CATALOG array
  types.ts          → CatalogSkill type
```

Each entry contains:
```ts
interface CatalogSkill {
  id: string;               // e.g. "figma"
  displayName: string;      // "Figma"
  shortDescription: string; // "Use Figma MCP for design-to-code work"
  category: SkillCategory;  // "design" | "deploy" | "dev-tools" | ...
  icon: string;             // PNG filename in /public/icons/skills/ (from openai/skills repo)
  defaultPrompt: string;    // What gets injected when skill runs
  dependencies?: {          // MCP servers, API keys, etc.
    type: "mcp" | "api-key" | "cli";
    value: string;
    description: string;
  }[];
  installSource?: {         // Where to fetch full SKILL.md + scripts
    type: "bundled" | "github";
    repo?: string;
    path?: string;
  };
}
```

### 5. Skill Icons

**Location**: `/public/icons/skills/`

**Source**: Actual PNGs and SVGs downloaded directly from `openai/skills` repo `assets/` directories. Same `<img>` tag pattern used in onboarding (`/public/icons/brands/`).

**NO** Lucide icons. **NO** Phosphor icons. **NO** SimpleIcons. **NO** generated SVGs. Only the actual app icons from the source repo.

**Download pattern**:
```
https://raw.githubusercontent.com/openai/skills/main/skills/.curated/<skill>/assets/<name>.png
https://raw.githubusercontent.com/openai/skills/main/skills/.curated/<skill>/assets/<name>-small.svg
```

**Full icon inventory** (28 available from repo, 5 need separate sourcing):

| Skill | Repo Assets | Target File |
|---|---|---|
| figma | figma.png, figma-small.svg | figma.png |
| figma-implement-design | figma.png (same) | figma.png (shared) |
| sentry | sentry.png, sentry-small.svg | sentry.png |
| linear | linear.png, linear-small.svg | linear.png |
| playwright | playwright.png, playwright-small.svg | playwright.png |
| cloudflare | cloudflare.png, cloudflare-small.svg | cloudflare.png |
| vercel | vercel.png, vercel-small.svg | vercel.png |
| netlify | netlify.png, netlify-small.svg | netlify.png |
| render | render.png, render-small.svg | render.png |
| github (gh-fix-ci) | github.png, github-small.svg | github.png |
| github (gh-address-comments) | github.png (same) | github.png (shared) |
| pdf | pdf.png (no SVG) | pdf.png |
| doc | doc.png, doc-small.svg | doc.png |
| spreadsheet | spreadsheet.png, spreadsheet-small.svg | spreadsheet.png |
| imagegen | imagegen.png, imagegen-small.svg | imagegen.png |
| sora | sora.png, sora-small.svg | sora.png |
| speech | speech.png, speech-small.svg | speech.png |
| transcribe | transcribe.png, transcribe-small.svg | transcribe.png |
| screenshot | screenshot.png, screenshot-small.svg | screenshot.png |
| jupyter | jupyter.png, jupyter-small.svg | jupyter.png |
| yeet | yeet.png, yeet-small.svg | yeet.png |
| develop-web-game | game.png, game-small.svg | game.png |
| openai-docs | openai.png, openai-small.svg | openai.png |
| notion (4 skills) | notion.png, notion-small.svg | notion.png (shared) |
| aspnet-core | dotnet-logo.png | dotnet.png |
| winui-app | winui.png | winui.png |
| skill-installer | skill-installer.png, skill-installer-small.svg | skill-installer.png |

**Missing from repo (icons exist in Codex client, not in skills repo)**:

| Skill | Status | Resolution |
|---|---|---|
| chatgpt-apps | No assets/ dir | Use `openai.png` (same brand family) |
| security-best-practices | No assets/ dir | Extract from Codex client or recreate matching shield icon |
| security-ownership-map | No assets/ dir | Same shield variant as above |
| security-threat-model | No assets/ dir | Same shield variant as above |
| skill-creator | No assets/ dir (system skill) | Extract from Codex client or recreate pencil icon |

**Download script**: `scripts/download-skill-icons.sh` — fetches all PNGs from GitHub raw URLs into `/public/icons/skills/`. Run once during Phase 1.

**Rendering**: `<img src="/icons/skills/{name}.png" />` — same pattern as onboarding's `<img src="/icons/brands/${icon}" />`.

---

## Component Architecture

### New Components

```
components/skills/
  skills-page.tsx              → Main /skills page (replaces library)
  skill-card.tsx               → Individual skill card (grid item)
  skill-detail-dialog.tsx      → Modal for skill detail/install/uninstall
  skill-icon.tsx               → Icon renderer (<img> PNG + initials fallback)
  skill-search.tsx             → Search input with real-time filtering
  skill-section.tsx            → Section header ("Installed", "Recommended")
  skill-toggle.tsx             → Enable/disable toggle for installed skills
```

### Modified Components

```
components/skills/
  skill-library.tsx            → DEPRECATED (functionality moves to skills-page)
  skill-import-dropzone.tsx    → Keep, embed in detail dialog for custom imports

components/assistant-ui/
  composer-skill-picker.tsx    → Update to show icons from catalog
```

### New Pages

```
app/skills/
  page.tsx                     → New main skills page (replaces library/page.tsx)
  library/page.tsx             → Redirect to /skills for backward compat
```

---

## Data Flow

### Installed Skills Resolution

```
GET /api/skills/installed
  → listRuntimeSkills({ userId, source: "plugin" })
  → Merge with: DB skills where status=active for current agent
  → Return: { installed: RuntimeSkill[], systemSkills: string[] }
```

### Catalog Skills

```
GET /api/skills/catalog
  → Import SKILL_CATALOG from lib/skills/catalog
  → Cross-reference with installed skills to mark "installed" status
  → Return: { catalog: CatalogSkillWithStatus[] }
```

### Install Flow

```
POST /api/skills/catalog/install
  Body: { skillId: string, characterId: string }

  → Lookup skill in SKILL_CATALOG
  → If bundled: Import from lib/skills/catalog/bundled/{skillId}/
  → If github: Fetch SKILL.md from repo, parse, importSkillPackage()
  → Return: { skillId: string, installed: true }
```

### Uninstall Flow

```
DELETE /api/skills/{id}
  → Existing endpoint, no changes needed
```

### Toggle Flow

```
PATCH /api/skills/{id}
  Body: { status: "active" | "archived" }
  → Existing endpoint, toggles skill visibility
```

---

## Database Changes

**None required.** The existing `skills` table already has:
- `icon` field (currently unused → will store catalog icon path)
- `status` field (active/archived → used for toggle)
- `sourceType` (will add "catalog" as new option)

Schema change needed:
```sql
-- Add 'catalog' to sourceType check constraint
-- Current: "conversation" | "manual" | "template"
-- New: "conversation" | "manual" | "template" | "catalog"
```

Add column:
```sql
ALTER TABLE skills ADD COLUMN catalogId TEXT;
-- Links to CatalogSkill.id for catalog-installed skills
```

---

## Styling Decisions

### Matching Codex Visual Language → Seline Design System

| Codex | Seline Equivalent |
|---|---|
| Dark background (#1a1a1a) | `bg-white` / `bg-terminal-cream` |
| White text | `text-terminal-dark` |
| Gray cards with borders | `border border-terminal-border/30 bg-white/50 rounded-2xl` |
| Blue toggle accent | `bg-terminal-green` toggle |
| Sans-serif headings | `font-mono` headings (Seline brand) |
| Subtle hover states | `hover:border-terminal-green/50 transition-all` |
| `+` install button | `+` icon button with `hover:bg-terminal-green/10` |

### Card Layout

Two-column grid on desktop, single column on mobile:
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
```

Each card:
```tsx
<div className="flex items-center gap-3 p-4 rounded-xl border border-terminal-border/30
     bg-white/50 hover:border-terminal-green/30 transition-all cursor-pointer">
  <SkillIcon icon={skill.icon} size={40} />
  <div className="flex-1 min-w-0">
    <h3 className="font-mono text-sm font-medium text-terminal-dark truncate">
      {skill.displayName}
    </h3>
    <p className="text-xs text-terminal-muted truncate">
      {skill.shortDescription}
    </p>
  </div>
  {installed ? <ToggleSwitch /> : <PlusButton />}
</div>
```

---

## Implementation Phases

### Phase 1: Foundation (Catalog + Icons + Types)

Files:
- `lib/skills/catalog/types.ts`
- `lib/skills/catalog/index.ts` — Full catalog data
- `scripts/download-skill-icons.sh` — Downloads all PNGs from openai/skills repo
- `public/icons/skills/*.png` — ~25 actual app icon PNGs (downloaded from repo)
- `lib/skills/catalog/bundled/` — Bundled SKILL.md content for system skills

### Phase 2: API Routes

Files:
- `app/api/skills/catalog/route.ts` — GET catalog with installed status
- `app/api/skills/catalog/install/route.ts` — POST install from catalog
- DB migration for `catalogId` column + sourceType enum update

### Phase 3: UI Components

Files:
- `components/skills/skill-icon.tsx`
- `components/skills/skill-card.tsx`
- `components/skills/skill-section.tsx`
- `components/skills/skill-search.tsx`
- `components/skills/skill-toggle.tsx`
- `components/skills/skill-detail-dialog.tsx`
- `components/skills/skills-page.tsx`

### Phase 4: Page + Routing

Files:
- `app/skills/page.tsx` — New main page
- `app/skills/library/page.tsx` — Redirect to /skills
- Update sidebar nav to point to /skills

### Phase 5: Agent Skills Tab Integration

Files:
- `app/agents/[id]/skills/page.tsx` — Update "Library" tab to use new catalog
- `components/assistant-ui/composer-skill-picker.tsx` — Add icons

### Phase 6: System Skills + First-Run

- Ship `skill-creator` and `notion` as pre-installed system skills
- Auto-create on agent creation (in `ensureDefaultAgentExists` or `createCharacter`)

---

## File Inventory

### New Files (19)

| # | File | Purpose |
|---|---|---|
| 1 | `lib/skills/catalog/types.ts` | CatalogSkill type + SkillCategory enum |
| 2 | `lib/skills/catalog/index.ts` | Static catalog array (34 skills) |
| 3 | `lib/skills/catalog/bundled/skill-creator.md` | System skill content |
| 4 | `lib/skills/catalog/bundled/notion.md` | System skill content |
| 5 | `app/api/skills/catalog/route.ts` | GET catalog endpoint |
| 6 | `app/api/skills/catalog/install/route.ts` | POST install endpoint |
| 7 | `components/skills/skill-icon.tsx` | PNG icon renderer (img tag, initials fallback) |
| 8 | `components/skills/skill-card.tsx` | Card component |
| 9 | `components/skills/skill-section.tsx` | Section header |
| 10 | `components/skills/skill-search.tsx` | Search input |
| 11 | `components/skills/skill-toggle.tsx` | Toggle switch |
| 12 | `components/skills/skill-detail-dialog.tsx` | Detail modal |
| 13 | `components/skills/skills-page.tsx` | Main page component |
| 14 | `app/skills/page.tsx` | Next.js page |
| 15 | `public/icons/skills/*.png` | ~25 icon PNGs downloaded from openai/skills repo |
| 16-19 | i18n locale files | Translation keys |

### Modified Files (6)

| # | File | Change |
|---|---|---|
| 1 | `lib/db/sqlite-skills-schema.ts` | Add catalogId column |
| 2 | `lib/skills/types.ts` | Add "catalog" sourceType, catalogId field |
| 3 | `app/skills/library/page.tsx` | Redirect to /skills |
| 4 | `app/agents/[id]/skills/page.tsx` | Use new catalog in Library tab |
| 5 | `components/assistant-ui/composer-skill-picker.tsx` | Add skill icons |
| 6 | Sidebar nav component | Update /skills link |

---

## Catalog: Full Skill List

Mapped 1:1 from Codex curated catalog, adapted for Seline:

| # | ID | Display Name | Short Description | Category | Icon (PNG) |
|---|---|---|---|---|---|
| 1 | figma | Figma | Use Figma MCP for design-to-code work | design | figma.png ✅ |
| 2 | figma-implement | Figma Implement Design | Turn Figma designs into production-ready code | design | figma.png ✅ |
| 3 | sentry | Sentry | Read-only Sentry observability | dev-tools | sentry.png ✅ |
| 4 | vercel-deploy | Vercel Deploy | Deploy apps with zero configuration on Vercel | deploy | vercel.png ✅ |
| 5 | netlify-deploy | Netlify Deploy | Deploy web projects to Netlify | deploy | netlify.png ✅ |
| 6 | cloudflare-deploy | Cloudflare Deploy | Deploy Workers, Pages on Cloudflare | deploy | cloudflare.png ✅ |
| 7 | render-deploy | Render Deploy | Deploy applications to Render | deploy | render.png ✅ |
| 8 | gh-fix-ci | GitHub Fix CI | Debug failing GitHub Actions CI | dev-tools | github.png ✅ |
| 9 | gh-address-comments | GitHub Address Comments | Address comments in a GitHub PR review | dev-tools | github.png ✅ |
| 10 | linear | Linear | Manage Linear issues | dev-tools | linear.png ✅ |
| 11 | notion-capture | Notion Knowledge Capture | Capture conversations into Notion pages | productivity | notion.png ✅ |
| 12 | notion-meeting | Notion Meeting Intelligence | Prep meetings with Notion context | productivity | notion.png ✅ |
| 13 | notion-research | Notion Research & Docs | Research Notion content, produce briefs | productivity | notion.png ✅ |
| 14 | notion-spec | Notion Spec to Implementation | Turn Notion specs into implementation plans | productivity | notion.png ✅ |
| 15 | imagegen | Image Gen | Generate and edit images using OpenAI | creative | imagegen.png ✅ |
| 16 | sora | Sora | Generate and manage Sora videos | creative | sora.png ✅ |
| 17 | speech | Speech | Generate narrated audio from text | creative | speech.png ✅ |
| 18 | transcribe | Transcribe | Transcribe audio with speaker diarization | creative | transcribe.png ✅ |
| 19 | pdf | PDF | Create, edit, and review PDFs | productivity | pdf.png ✅ |
| 20 | doc | Word Docs | Edit and review docx files | productivity | doc.png ✅ |
| 21 | spreadsheet | Spreadsheet | Create, edit, and analyze spreadsheets | productivity | spreadsheet.png ✅ |
| 22 | playwright | Playwright | Automate real browsers from the terminal | dev-tools | playwright.png ✅ |
| 23 | screenshot | Screenshot | Capture screenshots | dev-tools | screenshot.png ✅ |
| 24 | jupyter-notebook | Jupyter Notebooks | Create Jupyter notebooks | dev-tools | jupyter.png ✅ |
| 25 | openai-docs | OpenAI Docs | Reference official OpenAI Developer docs | docs | openai.png ✅ |
| 26 | develop-web-game | Develop Web Game | Web game dev + Playwright test loop | creative | game.png ✅ |
| 27 | chatgpt-apps | ChatGPT Apps | Build and scaffold ChatGPT apps | dev-tools | openai.png ✅ (reuses) |
| 28 | security-best-practices | Security Best Practices | Security reviews and secure-by-default guidance | security | ❌ manual |
| 29 | security-ownership-map | Security Ownership Map | Map maintainers, bus factor, sensitive code | security | ❌ manual |
| 30 | security-threat-model | Security Threat Model | Threat modeling and abuse-path analysis | security | ❌ manual |
| 31 | yeet | Yeet | Stage, commit, and open PR | dev-tools | yeet.png ✅ |
| 32 | aspnet-core | ASP.NET Core | [Windows] Build ASP.NET Core web apps | dev-tools | dotnet.png ✅ |
| 33 | winui-app | WinUI App | [Windows] Build native WinUI 3 apps | dev-tools | winui.png ✅ |

**System skills** (pre-installed, not in catalog grid):

| # | ID | Display Name | Short Description |
|---|---|---|---|
| S1 | skill-creator | Skill Creator | Create or update a skill |
| S2 | notion | Notion | Notion API for creating and managing pages |

---

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Icon licensing | PNGs sourced from openai/skills repo (MIT licensed). 5 missing icons need manual extraction from Codex client |
| Catalog staleness | Catalog is static JSON; easy to update. Version field allows cache busting |
| Breaking existing skills | No schema changes to existing rows. `catalogId` is nullable. `sourceType` enum expands, doesn't break |
| Performance | Catalog is ~5KB static import, no DB queries. Installed check is one lightweight query |
| Mobile layout | Two-column → single-column grid via responsive breakpoint |

---

## Open Questions

1. **Catalog source of truth**: Should catalog skills fetch SKILL.md from GitHub at install time (like Codex skill-installer), or bundle all content locally?
   - Recommendation: Bundle popular ones locally, support GitHub fetch for extended catalog

2. **Skill detail content**: The dialog needs to render the SKILL.md body as rich markdown. Use existing markdown renderer or add `react-markdown`?

3. **Toggle behavior**: Should disabling a skill archive it (hide from model) or just pause injection into system prompt?
   - Recommendation: Set status to "archived" (existing behavior), re-activate on toggle on
