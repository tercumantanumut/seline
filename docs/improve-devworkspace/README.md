# Developer Workspace & Diff Sidebar — Full Implementation Plan

## Current State Assessment

### What Exists (MVP-level)
- `diff-review-panel.tsx` — Sliding overlay panel, raw `git diff --stat` text with basic line coloring (green/red/blue). No syntax highlighting, no hunks, no interactions.
- `workspace-indicator.tsx` — Branch badge in chat header with dropdown (view changes, refresh, cleanup).
- `workspace-dashboard.tsx` — Grid of active workspaces on home page.
- `workspace-onboarding.tsx` — 3-step intro modal.
- `app/api/sessions/[id]/workspace/route.ts` — GET (live git status via `execFile`), PATCH (metadata update), POST (refresh/cleanup/sync-to-local).
- `lib/workspace/types.ts` — `WorkspaceInfo`, `WorkspaceStatus`, `WorkspaceSummary`.
- `lib/ai/filesystem/diff-utils.ts` — Basic string diff (deprecated, no callers).
- Settings: `devWorkspaceEnabled`, `devWorkspaceAutoCleanup`, `devWorkspaceAutoCleanupDays`.

### What's Missing / Half-Baked
1. **Diff rendering is raw text** — no parsed hunks, no syntax highlighting, no line numbers, no collapsible sections
2. **No staging/unstaging UI** — no file-level or hunk-level stage/unstage/revert
3. **No proper SCM sidebar** — just an overlay panel, not an integrated sidebar like the screenshot reference
4. **No commit UI** — no commit message input, no commit action
5. **No per-file diff expansion** — clicking a file doesn't show its diff inline
6. **No +N/-N stats per file** — only file status badges (A/M/D/R)
7. **No "Uncommitted changes" vs "Staged" tab separation**
8. **No "Review" mode**
9. **No diff stats badge in toolbar** (`+4,059 -26`)
10. **No git library** — raw `execFile("git", ...)` calls everywhere

---

## Target UX (from reference screenshots)

The reference shows a VS Code-style Source Control sidebar integrated into the right side of the app:

### Top Toolbar Area
- **Diff stats badge**: `+4,059 -26` with icon, always visible when dev mode is on
- **Commit dropdown**: "Commit" button with chevron for commit options
- **Hand off toggle**: Already exists

### Sidebar Header
- **"Uncommitted changes" dropdown** — filter between all/specific categories
- **Tabs**: "Unstaged · N" | "Staged · N" — with counts
- **"..." overflow menu** — additional actions
- **"Review ↗" button** — opens full diff review mode

### Per-File Sections (Collapsible)
- **File path** with `+N -0` addition/deletion stats
- **Collapse/expand chevron**
- **Collapsible "N unmodified lines" blocks** between hunks
- **Line numbers** (left gutter)
- **Syntax-highlighted diff lines** — green for additions, red for deletions, orange for modifications
- **"Revert all" and "+ Stage all" buttons** at bottom of each file section

### Interactions (Read-Only Diff, Rich Actions)
- Stage/unstage individual files
- Stage/unstage all files
- Revert individual files or all changes
- Collapse/expand individual files
- Collapse/expand unchanged line blocks
- Click file in header to scroll to it
- Tab between Unstaged/Staged views
- Commit with message

---

## Library Selection

### Primary Stack

| Purpose | Library | Rationale |
|---------|---------|-----------|
| **Diff rendering** | `@git-diff-view/react` + `@git-diff-view/shiki` | 40kB bundle, GitHub-style UI, Shiki highlighting (VS Code grammars), split/unified views, SSR-ready, actively maintained (470 commits, updated daily), Web Worker support, 60fps scroll |
| **Diff parsing** | `diff` (jsdiff) v8+ | 40M downloads/week, TypeScript native, structured patch parsing, industry standard |
| **Git operations** | `simple-git` | 5.8M/week, full git API wrapper, TypeScript, promise-based, AbortController support, plugin system. Replaces raw `execFile` calls |
| **Syntax highlighting** | Shiki (via `@git-diff-view/shiki`) | VS Code TextMate grammars, on-demand grammar loading, built-in diff transformer support |

### Why These Over Alternatives

- **NOT `diff2html`** — Generates HTML strings (not React-native), requires `dangerouslySetInnerHTML`, highlight.js adds weight, can't add interactive elements per-hunk
- **NOT `react-diff-viewer-continued`** — Emotion CSS dependency clashes with Tailwind, React 19 support uncertain, slower maintenance
- **NOT `@pierre/diffs`** — Shadow DOM blocks Tailwind styling, community too small (26 npm dependents), still v1.x
- **NOT Monaco/CodeMirror** — Full editors, way heavier than needed for read-only diff sidebar
- **NOT `isomorphic-git`** — Pure JS reimplementation slower than native git, incomplete API (no `git apply --cached`), semi-maintained

### Install Command
```bash
npm install @git-diff-view/react @git-diff-view/shiki simple-git diff
```

Bundle impact: ~65kB gzipped total (git-diff-view ~40kB, simple-git is Node-only/no bundle, diff ~15kB, shiki grammars lazy-loaded).

---

## Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────────┐
│  Renderer (Next.js + React)                             │
│                                                         │
│  ┌──────────────┐    ┌───────────────────────────────┐  │
│  │ Chat Area    │    │ SCM Sidebar (right panel)     │  │
│  │              │    │                               │  │
│  │              │    │  ┌─ Tabs: Unstaged | Staged   │  │
│  │              │    │  ├─ File Tree (grouped)       │  │
│  │              │    │  ├─ Per-File Diff Sections    │  │
│  │              │    │  │   @git-diff-view/react     │  │
│  │              │    │  │   + Shiki highlighting     │  │
│  │              │    │  └─ Actions (Stage/Revert)    │  │
│  │              │    │                               │  │
│  └──────────────┘    └───────────┬───────────────────┘  │
│                                  │                      │
│                          API calls                      │
└──────────────────────────────────┼──────────────────────┘
                                   │
                    ┌──────────────┴───────────────┐
                    │  Next.js API Routes           │
                    │  /api/sessions/[id]/workspace  │
                    │  /api/sessions/[id]/git/*      │
                    │                               │
                    │  simple-git (Node.js)         │
                    │       │                       │
                    │       ▼                       │
                    │  git CLI → repository         │
                    └──────────────────────────────┘
```

### Key Architectural Decisions

1. **Sidebar, not overlay** — Replace the current `DiffReviewPanel` (fixed overlay with backdrop) with a proper resizable sidebar panel on the right side. The chat area shrinks when the sidebar opens.

2. **simple-git replaces raw execFile** — Centralize all git operations through a `GitService` class using `simple-git`. This gives us typed responses, error handling, timeout management, and AbortController support without reinventing wrappers.

3. **Structured diff data** — The API returns parsed diff objects (files → hunks → lines) instead of raw `git diff --stat` strings. The frontend never parses diff text.

4. **Hunk-level operations via `git apply --cached`** — Stage/unstage/revert individual hunks by constructing minimal patches and piping them to `git apply`. This is what VS Code does internally.

5. **Shiki highlighting integrated at the component level** — `@git-diff-view/shiki` handles language detection and tokenization. Grammars load on demand (only languages present in the diff).

---

## Implementation Plan

### Phase 1: Git Service Layer + New API Endpoints

**Goal**: Replace raw `execFile` with `simple-git`, add structured diff endpoints.

#### 1.1 Create `lib/workspace/git-service.ts`

```typescript
// Wraps simple-git with our conventions:
// - Path validation (reuse existing isValidWorktreePath)
// - Timeout management (30s default, configurable)
// - EBADF retry logic (macOS specific, reuse existing pattern)
// - Typed return values

export class GitService {
  private git: SimpleGit;

  constructor(repoPath: string) { ... }

  // Status
  async getStatus(): Promise<StatusResult>
  async getStagedFiles(): Promise<FileStatusResult[]>
  async getUnstagedFiles(): Promise<FileStatusResult[]>

  // Diff (parsed)
  async getUnstagedDiff(filePath?: string): Promise<ParsedDiff>
  async getStagedDiff(filePath?: string): Promise<ParsedDiff>
  async getBranchDiff(base: string, head?: string): Promise<ParsedDiff>
  async getDiffStats(): Promise<{ additions: number; deletions: number }>

  // Staging
  async stageFile(filePath: string): Promise<void>
  async unstageFile(filePath: string): Promise<void>
  async stageAll(): Promise<void>
  async unstageAll(): Promise<void>
  async stageHunk(filePath: string, hunkPatch: string): Promise<void>
  async unstageHunk(filePath: string, hunkPatch: string): Promise<void>

  // Revert
  async revertFile(filePath: string): Promise<void>
  async revertHunk(filePath: string, hunkPatch: string): Promise<void>

  // Commit
  async commit(message: string): Promise<CommitResult>

  // Branch info
  async getCurrentBranch(): Promise<string>
  async getLog(limit?: number): Promise<LogResult>
}
```

#### 1.2 Create diff parser utility: `lib/workspace/diff-parser.ts`

Parse raw `git diff` output into structured objects for the frontend:

```typescript
export interface ParsedDiff {
  files: ParsedDiffFile[];
  stats: { additions: number; deletions: number; filesChanged: number };
}

export interface ParsedDiffFile {
  path: string;
  oldPath?: string;          // for renames
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  hunks: ParsedHunk[];
  isBinary: boolean;
}

export interface ParsedHunk {
  header: string;            // @@ -10,7 +10,8 @@ function name
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  changes: ParsedChange[];
  // Pre-built patch string for this hunk (used by stage/revert)
  patchContent: string;
}

export interface ParsedChange {
  type: "add" | "delete" | "normal";
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export function parseUnifiedDiff(rawDiff: string): ParsedDiff { ... }
export function buildHunkPatch(file: ParsedDiffFile, hunk: ParsedHunk): string { ... }
```

#### 1.3 New API endpoints

**`app/api/sessions/[id]/git/diff/route.ts`**
```
GET /api/sessions/[id]/git/diff?type=unstaged|staged|branch&file=path
→ Returns ParsedDiff (structured JSON, not raw text)
```

**`app/api/sessions/[id]/git/stage/route.ts`**
```
POST /api/sessions/[id]/git/stage
Body: { action: "stage"|"unstage"|"stage-all"|"unstage-all", filePath?: string, hunkPatch?: string }
→ Returns updated status
```

**`app/api/sessions/[id]/git/revert/route.ts`**
```
POST /api/sessions/[id]/git/revert
Body: { filePath: string, hunkPatch?: string }
→ Returns updated status
```

**`app/api/sessions/[id]/git/commit/route.ts`**
```
POST /api/sessions/[id]/git/commit
Body: { message: string }
→ Returns commit result
```

**`app/api/sessions/[id]/git/status/route.ts`**
```
GET /api/sessions/[id]/git/status
→ Returns { unstaged: FileStatusResult[], staged: FileStatusResult[], stats: { additions, deletions } }
```

#### 1.4 Migrate existing workspace route

Refactor `app/api/sessions/[id]/workspace/route.ts` to use `GitService` instead of raw `execFile`. Keep the same API contract but cleaner internals.

**Files to create/modify:**
- `lib/workspace/git-service.ts` (new)
- `lib/workspace/diff-parser.ts` (new)
- `app/api/sessions/[id]/git/diff/route.ts` (new)
- `app/api/sessions/[id]/git/stage/route.ts` (new)
- `app/api/sessions/[id]/git/revert/route.ts` (new)
- `app/api/sessions/[id]/git/commit/route.ts` (new)
- `app/api/sessions/[id]/git/status/route.ts` (new)
- `app/api/sessions/[id]/workspace/route.ts` (refactor)

---

### Phase 2: SCM Sidebar Component

**Goal**: Replace the overlay `DiffReviewPanel` with an integrated resizable sidebar.

#### 2.1 Create `components/workspace/scm-sidebar.tsx`

The main sidebar container, structured as:

```
┌──────────────────────────────────────┐
│  Header                              │
│  ┌────────────────┐ ┌──┐ ┌────────┐ │
│  │Uncommitted ▾   │ │…│ │Review ↗│ │
│  └────────────────┘ └──┘ └────────┘ │
│                                      │
│  Tabs                                │
│  ┌─────────────┬───────────┐         │
│  │ Unstaged·19 │ Staged·8  │         │
│  └─────────────┴───────────┘         │
│                                      │
│  File List (scrollable)              │
│  ┌──────────────────────────────────┐│
│  │ ▾ app/api/settings/route.ts     ││
│  │   +21 -0                        ││
│  │                                  ││
│  │   ┌ 129 unmodified lines ─────┐ ││
│  │                                  ││
│  │ 130│ sttProvider: body.stt... │  ││
│  │ 131│ sttLocalModel: body...   │  ││
│  │  + │ voicePostProcessing:...  │  ││
│  │  + │ voiceAgentName: body...  │  ││
│  │                                  ││
│  │   ┌ 136 unmodified lines ─────┐ ││
│  │                                  ││
│  │   ↩ Revert all  + Stage all   │  ││
│  │──────────────────────────────────││
│  │ ▾ app/settings/settings-panel   ││
│  │   +33 -0                        ││
│  │   ...                           ││
│  └──────────────────────────────────┘│
└──────────────────────────────────────┘
```

**Key sub-components:**

#### 2.2 `components/workspace/scm-sidebar-header.tsx`
- "Uncommitted changes" dropdown (future: branch selector, stash, etc.)
- "..." overflow menu (refresh, settings, etc.)
- "Review" button (opens full-screen diff review)
- Diff stats badge

#### 2.3 `components/workspace/scm-tabs.tsx`
- "Unstaged · N" and "Staged · N" tabs
- Active tab styling
- Counts auto-update when staging/unstaging

#### 2.4 `components/workspace/scm-file-section.tsx`
The core component — one per changed file. Contains:
- **Collapsible file header** with path, +N/-N stats, collapse chevron
- **Diff hunks** rendered via `@git-diff-view/react`
- **Collapsible "N unmodified lines" sections** between hunks
- **Line numbers** in left gutter
- **Syntax highlighting** via `@git-diff-view/shiki`
- **"Revert all" and "Stage all" buttons** at bottom

#### 2.5 `components/workspace/scm-commit-input.tsx`
- Commit message textarea (appears when on Staged tab and there are staged files)
- Commit button
- Amend checkbox (optional)

#### 2.6 `components/workspace/scm-file-diff.tsx`
Wrapper around `@git-diff-view/react` that:
- Accepts a `ParsedDiffFile` and renders it
- Configures Shiki highlighting via `@git-diff-view/shiki`
- Handles unified/split view toggle (unified by default for sidebar width)
- Supports collapsing unchanged line ranges
- Emits events for line/hunk selection

#### 2.7 Integration: Layout changes

**`components/chat/chat-interface.tsx`** modifications:
- Remove `DiffReviewPanel` import and overlay rendering
- Add `ScmSidebar` as a resizable right panel (not overlay, not fixed position)
- Use CSS Grid or flex layout: `[chat-area | scm-sidebar]`
- Sidebar toggles via the existing workspace indicator or new toolbar button
- Persist sidebar open/closed state and width in localStorage

**New layout structure:**
```tsx
<div className="flex h-full">
  <div className="flex-1 min-w-0"> {/* Chat area - shrinks */}
    {/* existing chat content */}
  </div>
  {isSidebarOpen && (
    <ResizablePanel defaultWidth={420} minWidth={320} maxWidth={700}>
      <ScmSidebar sessionId={sessionId} workspaceInfo={workspaceInfo} />
    </ResizablePanel>
  )}
</div>
```

#### 2.8 `components/workspace/resizable-panel.tsx`
- Drag handle on left edge
- Min/max width constraints
- Width persisted to localStorage
- Smooth resize with no layout thrashing

**Files to create/modify:**
- `components/workspace/scm-sidebar.tsx` (new)
- `components/workspace/scm-sidebar-header.tsx` (new)
- `components/workspace/scm-tabs.tsx` (new)
- `components/workspace/scm-file-section.tsx` (new)
- `components/workspace/scm-file-diff.tsx` (new)
- `components/workspace/scm-commit-input.tsx` (new)
- `components/workspace/resizable-panel.tsx` (new)
- `components/chat/chat-interface.tsx` (modify — layout change)
- `components/workspace/diff-review-panel.tsx` (deprecate/remove)

---

### Phase 3: Toolbar & Diff Stats Integration

**Goal**: Add the VS Code-style toolbar elements visible in the reference screenshots.

#### 3.1 Diff stats badge in toolbar

Add a `+N -N` badge next to the existing toolbar buttons (near "Hand off" toggle, "Commit" dropdown):

```tsx
// components/workspace/diff-stats-badge.tsx
// Shows: [icon] +4,059 -26
// Updates reactively when files change
// Click opens/closes SCM sidebar
```

#### 3.2 Commit dropdown in toolbar

```tsx
// components/workspace/commit-dropdown.tsx
// Primary action: "Commit" (commits staged changes)
// Dropdown items:
//   - Commit Staged
//   - Commit All
//   - Commit & Push
// Shows commit message input inline or in a popover
```

#### 3.3 Toolbar integration

Modify the chat header/toolbar to include:
- Diff stats badge (when workspace is active)
- Commit dropdown (when workspace is active and there are staged changes)
- These supplement the existing `WorkspaceIndicator` branch badge

**Files to create/modify:**
- `components/workspace/diff-stats-badge.tsx` (new)
- `components/workspace/commit-dropdown.tsx` (new)
- `components/chat/chat-interface.tsx` (modify — toolbar additions)

---

### Phase 4: Interactions & State Management

**Goal**: Wire up all the interactive elements — staging, unstaging, reverting, committing.

#### 4.1 Create `lib/hooks/use-workspace-scm.ts`

Central hook managing SCM state for a session:

```typescript
export function useWorkspaceScm(sessionId: string, workspaceInfo: WorkspaceInfo) {
  // State
  const [activeTab, setActiveTab] = useState<"unstaged" | "staged">("unstaged");
  const [unstagedFiles, setUnstagedFiles] = useState<ParsedDiffFile[]>([]);
  const [stagedFiles, setStagedFiles] = useState<ParsedDiffFile[]>([]);
  const [stats, setStats] = useState<{ additions: number; deletions: number }>({ additions: 0, deletions: 0 });
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  // Actions
  async function refresh(): Promise<void>
  async function stageFile(filePath: string): Promise<void>
  async function unstageFile(filePath: string): Promise<void>
  async function stageAll(): Promise<void>
  async function unstageAll(): Promise<void>
  async function stageHunk(filePath: string, hunkIndex: number): Promise<void>
  async function unstageHunk(filePath: string, hunkIndex: number): Promise<void>
  async function revertFile(filePath: string): Promise<void>
  async function revertHunk(filePath: string, hunkIndex: number): Promise<void>
  async function commit(message: string): Promise<void>

  // Computed
  const unstagedCount: number
  const stagedCount: number
  const hasChanges: boolean
  const canCommit: boolean

  return { ... }
}
```

#### 4.2 Optimistic updates

When a user clicks "Stage", immediately move the file from unstaged to staged in the UI, then fire the API call. If the API call fails, revert the optimistic update and show a toast.

#### 4.3 Event-based refresh

Listen for `workspace-status-changed` custom events (already dispatched by existing code) to trigger SCM state refresh. Also auto-refresh on sidebar open.

#### 4.4 Keyboard shortcuts

- `Ctrl+Enter` in commit input → Commit
- `Escape` → Close sidebar
- Future: navigate files with arrow keys

**Files to create/modify:**
- `lib/hooks/use-workspace-scm.ts` (new)
- All SCM sidebar components (wire up the hook)

---

### Phase 5: Review Mode

**Goal**: Full-screen diff review experience (the "Review ↗" button).

#### 5.1 `components/workspace/diff-review-fullscreen.tsx`

A full-screen modal/page that shows all changes in a single scrollable view:
- File navigation sidebar on the left (list of all changed files)
- Full diff view on the right (wider than sidebar allows)
- Split view option (side-by-side diffs)
- File-level and hunk-level stage/unstage/revert actions
- Keyboard navigation between files (↑/↓ or j/k)

This replaces the old `DiffReviewPanel` overlay concept but as a proper full-screen review experience.

#### 5.2 Navigation

- Click "Review ↗" in sidebar header → Opens review mode
- Click specific file in sidebar → Opens review mode scrolled to that file
- Escape or close button → Returns to sidebar view

**Files to create:**
- `components/workspace/diff-review-fullscreen.tsx` (new)
- `components/workspace/diff-review-file-nav.tsx` (new)

---

### Phase 6: Polish & Edge Cases

#### 6.1 Dark mode support
- `@git-diff-view/react` supports custom themes
- Map our existing theme tokens to diff view theme
- Test with all Seline theme presets

#### 6.2 Large diff handling
- Collapse files with >500 lines by default, show "Expand" button
- Virtual scrolling for very long diffs (git-diff-view has built-in support)
- Show warning for binary files: "Binary file not shown"
- Truncation notice for files exceeding reasonable display limits

#### 6.3 Empty states
- No changes: "Working tree clean" message
- No staged changes: "Stage files to commit" message
- Workspace not set up: "Create a workspace to see changes" with CTA

#### 6.4 Error recovery
- Git command timeout → Show retry button with explanation
- Worktree deleted externally → Detect and show cleanup prompt
- Conflict state detection → Show merge conflict indicator on affected files

#### 6.5 Localization
- Add all new strings to `locales/en.json` and `locales/tr.json`
- Keys under `workspace.scm.*` namespace

#### 6.6 Accessibility
- Keyboard navigation for file tree
- ARIA labels on interactive elements
- Focus management when sidebar opens/closes
- Screen reader support for diff stats

---

## Types Updates

### Extend `lib/workspace/types.ts`

```typescript
// Add to WorkspaceAction
export type WorkspaceAction =
  | "sync-to-local"
  | "cleanup"
  | "refresh-status"
  | "stage"
  | "unstage"
  | "stage-all"
  | "unstage-all"
  | "revert"
  | "commit";

// Add new types
export interface GitStatusResult {
  unstaged: GitFileStatus[];
  staged: GitFileStatus[];
  stats: {
    additions: number;
    deletions: number;
    filesChanged: number;
  };
}

export interface GitFileStatus {
  path: string;
  oldPath?: string;
  status: "added" | "modified" | "deleted" | "renamed" | "copied";
  additions: number;
  deletions: number;
}
```

### Settings additions (`app/settings/settings-types.ts`)

```typescript
// In FormState, add:
devWorkspaceSidebarWidth: number;     // Persisted sidebar width (default: 420)
devWorkspaceDefaultView: "unified" | "split";  // Diff view mode (default: "unified")
devWorkspaceAutoRefresh: boolean;     // Auto-refresh on file system changes (default: true)
```

---

## File Inventory

### New Files (17)
```
lib/workspace/git-service.ts
lib/workspace/diff-parser.ts
lib/hooks/use-workspace-scm.ts
app/api/sessions/[id]/git/diff/route.ts
app/api/sessions/[id]/git/stage/route.ts
app/api/sessions/[id]/git/revert/route.ts
app/api/sessions/[id]/git/commit/route.ts
app/api/sessions/[id]/git/status/route.ts
components/workspace/scm-sidebar.tsx
components/workspace/scm-sidebar-header.tsx
components/workspace/scm-tabs.tsx
components/workspace/scm-file-section.tsx
components/workspace/scm-file-diff.tsx
components/workspace/scm-commit-input.tsx
components/workspace/resizable-panel.tsx
components/workspace/diff-stats-badge.tsx
components/workspace/commit-dropdown.tsx
```

### Modified Files (6)
```
components/chat/chat-interface.tsx      — Layout change: overlay → sidebar
app/api/sessions/[id]/workspace/route.ts — Refactor to use GitService
lib/workspace/types.ts                  — Extended types
app/settings/settings-types.ts          — New settings fields
locales/en.json                         — New i18n strings
locales/tr.json                         — New i18n strings
```

### Deprecated/Removed Files (1)
```
components/workspace/diff-review-panel.tsx  — Replaced by scm-sidebar + review-fullscreen
```

### Dependencies Added (4)
```
@git-diff-view/react
@git-diff-view/shiki
simple-git
diff
```

---

## Implementation Order & Dependencies

```
Phase 1 (Git Service + APIs)     ← No frontend deps, can test with curl
  ↓
Phase 2 (SCM Sidebar)            ← Depends on Phase 1 APIs
  ↓
Phase 3 (Toolbar Integration)    ← Depends on Phase 2 components + Phase 1 data
  ↓
Phase 4 (Interactions & State)   ← Depends on Phase 2 + 3 being renderable
  ↓
Phase 5 (Review Mode)            ← Depends on Phase 4 interactions working
  ↓
Phase 6 (Polish)                 ← Everything else must work first
```

Each phase is independently shippable. Phase 1+2 gives a functional read-only diff sidebar. Phase 3+4 adds full interactivity. Phase 5+6 are enhancements.

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| `@git-diff-view/react` is pre-1.0 | It's actively maintained (daily updates), well-tested with demo site, and 653 stars. Pin exact version. |
| Shiki grammar loading latency | Grammars load on demand. Pre-load common ones (ts, tsx, json, css) at sidebar mount. |
| Hunk staging via `git apply --cached` | This is exactly what VS Code does. Well-tested pattern. Build a test suite against known diff formats. |
| Large diffs (thousands of lines) | `@git-diff-view` handles 2.2MB diffs with virtual scrolling. Add file-level collapse for >500 line files. |
| EBADF on macOS | Already handled in existing code via `spawnWithFileCapture`. `simple-git` can be configured with custom binary runner to use the same fallback. |
| Breaking existing workspace flows | Keep existing `DiffReviewPanel` importable during transition. Feature-flag the new sidebar behind `devWorkspaceV2` or just the existing `devWorkspaceEnabled` setting. |
