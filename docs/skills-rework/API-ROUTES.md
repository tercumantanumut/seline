# API Routes Specification

## New Routes

### GET /api/skills/catalog

Returns the full skill catalog with installed status for the current user.

**Query params**: none (catalog is static, installed status is computed server-side)

**Response**:
```json
{
  "catalog": [
    {
      "id": "figma",
      "displayName": "Figma",
      "shortDescription": "Use Figma MCP for design-to-code work",
      "category": "design",
      "icon": "figma.svg",
      "defaultPrompt": "Use Figma MCP to inspect...",
      "dependencies": [
        { "type": "mcp", "value": "figma", "description": "Figma MCP server" }
      ],
      "isInstalled": false,
      "installedSkillId": null,
      "isEnabled": null
    },
    {
      "id": "notion",
      "displayName": "Notion",
      "shortDescription": "Notion API...",
      "isInstalled": true,
      "installedSkillId": "abc123",
      "isEnabled": true
    }
  ],
  "systemSkills": [
    {
      "id": "skill-creator",
      "displayName": "Skill Creator",
      "isInstalled": true,
      "installedSkillId": "def456",
      "isEnabled": true
    }
  ]
}
```

**Implementation**:
```ts
// app/api/skills/catalog/route.ts

import { SKILL_CATALOG } from "@/lib/skills/catalog";
import { SYSTEM_SKILLS } from "@/lib/skills/catalog/system-skills";
import { listSkillsForUser } from "@/lib/skills/queries";
import { requireAuth } from "@/lib/auth/middleware";

export async function GET(request: Request) {
  const user = await requireAuth(request);

  // Get all installed skills for this user
  const installedSkills = await listSkillsForUser(user.id, {
    limit: 500,
  });

  // Build a map of catalogId → installed skill
  const installedByCatalogId = new Map<string, { id: string; status: string }>();
  for (const skill of installedSkills) {
    if (skill.catalogId) {
      installedByCatalogId.set(skill.catalogId, {
        id: skill.id,
        status: skill.status,
      });
    }
  }

  // Enrich catalog with installed status
  const catalog = SKILL_CATALOG.map(skill => {
    const installed = installedByCatalogId.get(skill.id);
    return {
      ...skill,
      isInstalled: !!installed,
      installedSkillId: installed?.id ?? null,
      isEnabled: installed ? installed.status === "active" : null,
    };
  });

  const systemSkills = SYSTEM_SKILLS.map(skill => {
    const installed = installedByCatalogId.get(skill.id);
    return {
      ...skill,
      isInstalled: !!installed,
      installedSkillId: installed?.id ?? null,
      isEnabled: installed ? installed.status === "active" : null,
    };
  });

  return Response.json({ catalog, systemSkills });
}
```

---

### POST /api/skills/catalog/install

Installs a skill from the catalog into the user's skill library.

**Request body**:
```json
{
  "catalogSkillId": "figma",
  "characterId": "agent-uuid-123"
}
```

**Response**:
```json
{
  "skillId": "new-skill-uuid",
  "installed": true,
  "name": "Figma"
}
```

**Implementation flow**:
1. Look up `catalogSkillId` in SKILL_CATALOG
2. Check if already installed (by catalogId) → 409 conflict
3. Based on `installSource.type`:
   - `"bundled"`: Read SKILL.md from `lib/skills/catalog/bundled/{id}/SKILL.md`
   - `"github"`: Fetch from GitHub API (same pattern as Codex skill-installer)
4. Parse SKILL.md (existing `parseSkillPackage()`)
5. Create skill via `importSkillPackage()` with:
   - `sourceType: "catalog"`
   - `catalogId: catalogSkillId`
   - `icon: catalogSkill.icon`
6. Return created skill ID

```ts
// app/api/skills/catalog/install/route.ts

import { SKILL_CATALOG } from "@/lib/skills/catalog";
import { SYSTEM_SKILLS } from "@/lib/skills/catalog/system-skills";
import { requireAuth } from "@/lib/auth/middleware";
import { createSkill } from "@/lib/skills/queries";

export async function POST(request: Request) {
  const user = await requireAuth(request);
  const body = await request.json();
  const { catalogSkillId, characterId } = body;

  // Find in catalog
  const allSkills = [...SKILL_CATALOG, ...SYSTEM_SKILLS];
  const catalogSkill = allSkills.find(s => s.id === catalogSkillId);
  if (!catalogSkill) {
    return Response.json({ error: "Skill not found in catalog" }, { status: 404 });
  }

  // Check not already installed
  // ... (check by catalogId in DB)

  // Fetch or read content
  let promptContent: string;
  if (catalogSkill.installSource.type === "bundled") {
    // Read from bundled file
    promptContent = await readBundledSkill(catalogSkillId);
  } else {
    // Fetch from GitHub
    promptContent = await fetchSkillFromGitHub(catalogSkill.installSource);
  }

  // Create skill record
  const skill = await createSkill({
    userId: user.id,
    characterId,
    name: catalogSkill.displayName,
    description: catalogSkill.shortDescription,
    icon: catalogSkill.icon,
    promptTemplate: promptContent,
    category: catalogSkill.category,
    sourceType: "catalog",
    // catalogId: catalogSkillId,  // new field
    status: "active",
  });

  return Response.json({
    skillId: skill.id,
    installed: true,
    name: catalogSkill.displayName,
  });
}
```

---

## Modified Routes

### GET /api/skills

No breaking changes. Add optional `catalogId` to response items so the UI can cross-reference installed skills with catalog entries.

### PATCH /api/skills/[id]

No changes needed. Already supports status toggle between "active" and "archived".

### DELETE /api/skills/[id]

No changes needed. Existing endpoint handles deletion.

---

## GitHub Fetch Utility

For installing skills from GitHub repos:

```ts
// lib/skills/catalog/github-fetch.ts

import type { CatalogSkillSource } from "./types";

export async function fetchSkillFromGitHub(
  source: CatalogSkillSource
): Promise<string> {
  const { repo, path, ref = "main" } = source;
  if (!repo || !path) throw new Error("Missing repo or path for GitHub skill");

  // Fetch SKILL.md content via GitHub API
  const url = `https://api.github.com/repos/${repo}/contents/${path}/SKILL.md?ref=${ref}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github.v3.raw",
      ...(process.env.GITHUB_TOKEN
        ? { Authorization: `token ${process.env.GITHUB_TOKEN}` }
        : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch skill from GitHub: ${response.status}`);
  }

  const content = await response.text();

  // Parse frontmatter out, return body only
  const bodyMatch = content.match(/^---[\s\S]*?---\s*(.*)$/s);
  return bodyMatch ? bodyMatch[1].trim() : content;
}
```
