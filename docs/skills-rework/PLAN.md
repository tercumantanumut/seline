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
  icon: string;             // Path to SVG/PNG in /public/icons/skills/
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

Following the established pattern from `/public/icons/brands/`:
- Proper SVGs sourced from official brand assets (not AI-generated)
- PNG fallback for complex logos
- Consistent 24x24 or 32x32 viewBox
- Same `<img src="/icons/skills/{name}.svg">` pattern used in onboarding

**Required icons** (mapped from Codex catalog):

| Skill | Icon Source |
|---|---|
| figma | Figma brand SVG |
| sentry | Sentry brand SVG |
| vercel | Vercel brand SVG |
| netlify | Netlify brand SVG |
| cloudflare | Cloudflare brand SVG |
| notion | Notion brand SVG |
| linear | Linear brand SVG |
| github | GitHub Invertocat SVG |
| playwright | Playwright brand SVG |
| jupyter | Jupyter brand SVG |
| pdf | Lucide FileText or custom doc icon |
| speech | Lucide AudioLines or mic icon |
| transcribe | Lucide AudioWaveform |
| imagegen | OpenAI/image icon |
| spreadsheet | Lucide Sheet icon |
| security | Lucide Shield icon |
| sora | OpenAI Sora brand |
| render | Render brand SVG |
| screenshot | Lucide Camera |
| doc | Lucide FileEdit |
| game | Lucide Gamepad2 |
| yeet | Lucide GitPullRequest |
| skill-creator | Lucide Pencil or Wand |

For brand icons: source from SimpleIcons (simpleicons.org) or official brand press kits. For generic skills: use Phosphor or Lucide icons rendered as SVG files.

---

## Component Architecture

### New Components

```
components/skills/
  skills-page.tsx              → Main /skills page (replaces library)
  skill-card.tsx               → Individual skill card (grid item)
  skill-detail-dialog.tsx      → Modal for skill detail/install/uninstall
  skill-icon.tsx               → Icon renderer (SVG path + Lucide fallback)
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
- `public/icons/skills/` — All skill SVGs
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
| 7 | `components/skills/skill-icon.tsx` | Icon component |
| 8 | `components/skills/skill-card.tsx` | Card component |
| 9 | `components/skills/skill-section.tsx` | Section header |
| 10 | `components/skills/skill-search.tsx` | Search input |
| 11 | `components/skills/skill-toggle.tsx` | Toggle switch |
| 12 | `components/skills/skill-detail-dialog.tsx` | Detail modal |
| 13 | `components/skills/skills-page.tsx` | Main page component |
| 14 | `app/skills/page.tsx` | Next.js page |
| 15 | `public/icons/skills/*.svg` | ~25 icon files |
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

| # | ID | Display Name | Short Description | Category | Icon |
|---|---|---|---|---|---|
| 1 | figma | Figma | Use Figma MCP for design-to-code work | design | figma.svg |
| 2 | figma-implement | Figma Implement Design | Turn Figma designs into production-ready code | design | figma.svg |
| 3 | sentry | Sentry | Read-only Sentry observability | dev-tools | sentry.svg |
| 4 | vercel-deploy | Vercel Deploy | Deploy apps with zero configuration on Vercel | deploy | vercel.svg |
| 5 | netlify-deploy | Netlify Deploy | Deploy web projects to Netlify | deploy | netlify.svg |
| 6 | cloudflare-deploy | Cloudflare Deploy | Deploy Workers, Pages on Cloudflare | deploy | cloudflare.svg |
| 7 | render-deploy | Render Deploy | Deploy applications to Render | deploy | render.svg |
| 8 | gh-fix-ci | GitHub Fix CI | Debug failing GitHub Actions CI | dev-tools | github.svg |
| 9 | gh-address-comments | GitHub Address Comments | Address comments in a GitHub PR review | dev-tools | github.svg |
| 10 | linear | Linear | Manage Linear issues | dev-tools | linear.svg |
| 11 | notion-capture | Notion Knowledge Capture | Capture conversations into Notion pages | productivity | notion.svg |
| 12 | notion-meeting | Notion Meeting Intelligence | Prep meetings with Notion context | productivity | notion.svg |
| 13 | notion-research | Notion Research & Docs | Research Notion content, produce briefs | productivity | notion.svg |
| 14 | notion-spec | Notion Spec to Implementation | Turn Notion specs into implementation plans | productivity | notion.svg |
| 15 | imagegen | Image Gen | Generate and edit images using OpenAI | creative | imagegen.svg |
| 16 | sora | Sora | Generate and manage Sora videos | creative | sora.svg |
| 17 | speech | Speech | Generate narrated audio from text | creative | speech.svg |
| 18 | transcribe | Transcribe | Transcribe audio with speaker diarization | creative | transcribe.svg |
| 19 | pdf | PDF | Create, edit, and review PDFs | productivity | pdf.svg |
| 20 | doc | Word Docs | Edit and review docx files | productivity | doc.svg |
| 21 | spreadsheet | Spreadsheet | Create, edit, and analyze spreadsheets | productivity | spreadsheet.svg |
| 22 | playwright | Playwright | Automate real browsers from the terminal | dev-tools | playwright.svg |
| 23 | screenshot | Screenshot | Capture screenshots | dev-tools | screenshot.svg |
| 24 | jupyter-notebook | Jupyter Notebooks | Create Jupyter notebooks | dev-tools | jupyter.svg |
| 25 | openai-docs | OpenAI Docs | Reference official OpenAI Developer docs | docs | openai.svg |
| 26 | develop-web-game | Develop Web Game | Web game dev + Playwright test loop | creative | game.svg |
| 27 | chatgpt-apps | ChatGPT Apps | Build and scaffold ChatGPT apps | dev-tools | chatgpt.svg |
| 28 | security-best-practices | Security Best Practices | Security reviews and secure-by-default guidance | security | security.svg |
| 29 | security-ownership-map | Security Ownership Map | Map maintainers, bus factor, sensitive code | security | security.svg |
| 30 | security-threat-model | Security Threat Model | Threat modeling and abuse-path analysis | security | security.svg |
| 31 | yeet | Yeet | Stage, commit, and open PR | dev-tools | yeet.svg |
| 32 | aspnet-core | ASP.NET Core | [Windows] Build ASP.NET Core web apps | dev-tools | dotnet.svg |
| 33 | winui-app | WinUI App | [Windows] Build native WinUI 3 apps | dev-tools | winui.svg |

**System skills** (pre-installed, not in catalog grid):

| # | ID | Display Name | Short Description |
|---|---|---|---|
| S1 | skill-creator | Skill Creator | Create or update a skill |
| S2 | notion | Notion | Notion API for creating and managing pages |

---

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Icon licensing | Use SimpleIcons (CC0) or official brand press kits (usually free for integration UIs) |
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
