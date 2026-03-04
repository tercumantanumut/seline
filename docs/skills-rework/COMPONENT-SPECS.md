# Component Specifications

## 1. `skill-icon.tsx`

Renders a skill icon with SVG path → Lucide fallback → initials fallback.

```tsx
interface SkillIconProps {
  icon: string | null;          // Path like "figma.svg" or null
  fallbackIcon?: LucideIcon;    // Lucide component fallback
  displayName: string;          // For initials fallback
  size?: 24 | 32 | 40;         // px dimensions
  className?: string;
}
```

**Rendering priority**:
1. If `icon` is set → `<img src="/icons/skills/{icon}" />`
2. If `fallbackIcon` → `<FallbackIcon className={sizeClass} />`
3. Else → Two-letter initials in a colored circle (hash displayName for consistent color)

**Pattern match**: Same as `components/onboarding/steps/features-step.tsx` FeatureChip.

---

## 2. `skill-card.tsx`

Grid card for a single skill. Two variants: "installed" and "catalog".

```tsx
interface SkillCardProps {
  skill: {
    id: string;
    displayName: string;
    shortDescription: string;
    icon: string | null;
    category: string;
  };
  variant: "installed" | "catalog";
  isEnabled?: boolean;           // For installed variant
  onToggle?: (enabled: boolean) => void;
  onInstall?: () => void;        // For catalog variant
  onClick?: () => void;          // Opens detail dialog
}
```

**Installed variant layout**:
```
┌─────────────────────────────────────┐
│  [icon]  Skill Creator              │
│          Create or update a skill   │
│                          [toggle ●] │
└─────────────────────────────────────┘
```

**Catalog variant layout**:
```
┌─────────────────────────────────────┐
│  [icon]  Figma                      │
│          Use Figma MCP for ...      │
│                              [  +  ]│
└─────────────────────────────────────┘
```

**Styles**:
- Container: `flex items-center gap-3 p-4 rounded-xl border bg-white/50 hover:border-terminal-green/30 transition-all cursor-pointer`
- Installed with toggle on: `border-terminal-green/20 bg-terminal-green/[0.02]`
- Click anywhere opens detail; toggle/install button has `e.stopPropagation()`

---

## 3. `skill-section.tsx`

Section divider with label, matching Codex's "Installed" / "Recommended" headers.

```tsx
interface SkillSectionProps {
  title: string;
  children: React.ReactNode;
}
```

**Layout**:
```
── Installed ─────────────────────────
[children grid]
```

```tsx
<div className="space-y-3">
  <h2 className="text-xs font-mono font-medium text-terminal-muted uppercase tracking-wider">
    {title}
  </h2>
  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
    {children}
  </div>
</div>
```

---

## 4. `skill-search.tsx`

Search input with icon, matching Codex top-right search bar.

```tsx
interface SkillSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}
```

**Layout**:
```tsx
<div className="relative">
  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-terminal-muted" />
  <input
    className="w-full pl-9 pr-3 py-2 rounded-lg border border-terminal-border/50 bg-white/80
               font-mono text-sm placeholder:text-terminal-muted/60
               focus:border-terminal-green/50 focus:outline-none focus:ring-1 focus:ring-terminal-green/20"
  />
</div>
```

---

## 5. `skill-toggle.tsx`

Toggle switch for enable/disable. Uses existing shadcn Switch or custom.

```tsx
interface SkillToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  loading?: boolean;
}
```

**States**:
- On: `bg-terminal-green` track, white knob
- Off: `bg-terminal-border` track, white knob
- Loading: knob shows tiny spinner

---

## 6. `skill-detail-dialog.tsx`

Full-featured dialog for viewing skill details, managing installed skills, and installing new ones.

```tsx
interface SkillDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skill: CatalogSkill | InstalledSkillWithMeta;
  isInstalled: boolean;
  isEnabled?: boolean;
  onInstall?: () => void;
  onUninstall?: () => void;
  onToggle?: (enabled: boolean) => void;
  onTry?: () => void;
}
```

**Layout** (Dialog or Sheet):
```
┌──────────────────────────────────────────┐
│                                    [X]   │
│  [icon 48px]                             │
│  Skill Creator                           │
│  Create or update a skill                │
│                                          │
│  ─────────────────────────────────────── │
│                                          │
│  [Rendered SKILL.md content as markdown] │
│  - Overview section                      │
│  - Requirements section                  │
│  - Workflow section                      │
│                                          │
│  ─────────────────────────────────────── │
│                                          │
│  [Uninstall]  [Disable]       [✏ Try]   │
│  OR                                      │
│  [+ Install]                             │
└──────────────────────────────────────────┘
```

**Actions**:
- "Try" → Navigates to chat with skill's `defaultPrompt` pre-filled
- "Install" → Calls POST /api/skills/catalog/install
- "Uninstall" → Calls DELETE /api/skills/{id} with confirmation
- "Disable" / "Enable" → Calls PATCH /api/skills/{id} status toggle

---

## 7. `skills-page.tsx`

Main page component orchestrating all sections.

```tsx
export function SkillsPage() {
  // State
  const [installedSkills, setInstalledSkills] = useState<InstalledSkill[]>([]);
  const [catalogSkills, setCatalogSkills] = useState<CatalogSkillWithStatus[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSkill, setSelectedSkill] = useState<SkillForDialog | null>(null);

  // Data fetching
  // - GET /api/skills/installed (or existing /api/skills with characterId)
  // - GET /api/skills/catalog

  // Filtering
  const filteredCatalog = useMemo(() => {
    if (!searchQuery) return catalogSkills;
    const q = searchQuery.toLowerCase();
    return catalogSkills.filter(s =>
      s.displayName.toLowerCase().includes(q) ||
      s.shortDescription.toLowerCase().includes(q)
    );
  }, [catalogSkills, searchQuery]);

  return (
    <Shell>
      <div className="mx-auto w-full max-w-5xl px-6 py-8 space-y-8">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-mono font-bold text-terminal-dark">Skills</h1>
            <p className="text-sm text-terminal-muted mt-1">
              Give Seline superpowers. <Link>Learn more</Link>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={refresh}>
              <RefreshCw />
            </Button>
            <SkillSearch value={searchQuery} onChange={setSearchQuery} />
            <Button>
              <Plus /> New skill
            </Button>
          </div>
        </header>

        {/* Installed section */}
        <SkillSection title="Installed">
          {installedSkills.map(skill => (
            <SkillCard
              key={skill.id}
              variant="installed"
              skill={skill}
              isEnabled={skill.status === "active"}
              onToggle={...}
              onClick={() => setSelectedSkill(skill)}
            />
          ))}
        </SkillSection>

        {/* Recommended section */}
        <SkillSection title="Recommended">
          {filteredCatalog
            .filter(s => !s.isInstalled)
            .map(skill => (
              <SkillCard
                key={skill.id}
                variant="catalog"
                skill={skill}
                onInstall={...}
                onClick={() => setSelectedSkill(skill)}
              />
            ))}
        </SkillSection>
      </div>

      {/* Detail dialog */}
      <SkillDetailDialog
        open={!!selectedSkill}
        skill={selectedSkill}
        ...
      />
    </Shell>
  );
}
```

---

## Animation

Using framer-motion (already in deps):

```tsx
// Card entrance stagger
<motion.div
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: index * 0.03 }}
>
  <SkillCard ... />
</motion.div>

// Dialog content
<motion.div
  initial={{ opacity: 0, scale: 0.95 }}
  animate={{ opacity: 1, scale: 1 }}
  transition={{ duration: 0.15 }}
>
```

---

## i18n Keys Required

```json
{
  "skills": {
    "page": {
      "title": "Skills",
      "subtitle": "Give Seline superpowers.",
      "learnMore": "Learn more",
      "refresh": "Refresh",
      "newSkill": "New skill",
      "searchPlaceholder": "Search skills...",
      "installed": "Installed",
      "recommended": "Recommended",
      "noResults": "No skills match your search.",
      "install": "Install",
      "installing": "Installing...",
      "installSuccess": "Skill installed successfully",
      "uninstall": "Uninstall",
      "uninstallConfirm": "Are you sure you want to uninstall this skill?",
      "disable": "Disable",
      "enable": "Enable",
      "try": "Try",
      "openFolder": "Open folder"
    }
  }
}
```
