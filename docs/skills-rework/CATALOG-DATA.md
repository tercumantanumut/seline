# Skill Catalog Data Specification

## Type Definitions

```ts
// lib/skills/catalog/types.ts

export type SkillCategory =
  | "design"
  | "deploy"
  | "dev-tools"
  | "productivity"
  | "creative"
  | "security"
  | "docs";

export interface CatalogSkillDependency {
  type: "mcp" | "api-key" | "cli";
  value: string;
  description: string;
  url?: string;               // MCP transport URL or docs link
}

export interface CatalogSkillSource {
  type: "bundled" | "github";
  repo?: string;              // e.g. "openai/skills"
  path?: string;              // e.g. "skills/.curated/figma"
  ref?: string;               // branch/tag, default "main"
}

export interface CatalogSkill {
  id: string;
  displayName: string;
  shortDescription: string;
  category: SkillCategory;
  icon: string;               // filename in /public/icons/skills/
  fallbackIcon?: string;      // Lucide icon name for dynamic rendering
  defaultPrompt: string;
  overview?: string;          // Short markdown for dialog body (before full SKILL.md loads)
  dependencies?: CatalogSkillDependency[];
  installSource: CatalogSkillSource;
  tags?: string[];            // For search: ["figma", "design", "mcp", "ui"]
  platforms?: ("all" | "windows" | "macos" | "linux")[];
}

export interface CatalogSkillWithStatus extends CatalogSkill {
  isInstalled: boolean;
  installedSkillId?: string;  // DB skill ID if installed
  isEnabled?: boolean;        // active vs archived
}
```

## Catalog Array

```ts
// lib/skills/catalog/index.ts

import type { CatalogSkill } from "./types";

export const SKILL_CATALOG: CatalogSkill[] = [
  // ─── Design ───────────────────────────────────────
  {
    id: "figma",
    displayName: "Figma",
    shortDescription: "Use Figma MCP for design-to-code work",
    category: "design",
    icon: "figma.svg",
    defaultPrompt: "Use Figma MCP to inspect the target design and translate it into implementable UI decisions.",
    dependencies: [
      { type: "mcp", value: "figma", description: "Figma MCP server", url: "https://mcp.figma.com/mcp" }
    ],
    installSource: { type: "github", repo: "openai/skills", path: "skills/.curated/figma" },
    tags: ["figma", "design", "mcp", "ui", "frontend"],
  },
  {
    id: "figma-implement-design",
    displayName: "Figma Implement Design",
    shortDescription: "Turn Figma designs into production-ready code",
    category: "design",
    icon: "figma.svg",
    defaultPrompt: "Implement this Figma design in this codebase, matching layout, states, and responsive behavior.",
    dependencies: [
      { type: "mcp", value: "figma", description: "Figma MCP server", url: "https://mcp.figma.com/mcp" }
    ],
    installSource: { type: "github", repo: "openai/skills", path: "skills/.curated/figma-implement-design" },
    tags: ["figma", "design", "implement", "code", "frontend"],
  },

  // ─── Deploy ───────────────────────────────────────
  {
    id: "vercel-deploy",
    displayName: "Vercel Deploy",
    shortDescription: "Deploy apps with zero configuration on Vercel",
    category: "deploy",
    icon: "vercel.svg",
    defaultPrompt: "Create a Vercel deployment for this project and share the URL.",
    installSource: { type: "github", repo: "openai/skills", path: "skills/.curated/vercel-deploy" },
    tags: ["vercel", "deploy", "hosting", "serverless"],
  },
  {
    id: "netlify-deploy",
    displayName: "Netlify Deploy",
    shortDescription: "Deploy web projects to Netlify with the Netlify CLI",
    category: "deploy",
    icon: "netlify.svg",
    defaultPrompt: "Deploy this project to Netlify and return the preview URL, build settings, and any required fixes.",
    installSource: { type: "github", repo: "openai/skills", path: "skills/.curated/netlify-deploy" },
    tags: ["netlify", "deploy", "hosting", "static"],
  },
  {
    id: "cloudflare-deploy",
    displayName: "Cloudflare Deploy",
    shortDescription: "Deploy Workers, Pages, and platform services on Cloudflare",
    category: "deploy",
    icon: "cloudflare.svg",
    defaultPrompt: "Deploy this app to Cloudflare (Workers or Pages) and return URL, config, and required env vars.",
    installSource: { type: "github", repo: "openai/skills", path: "skills/.curated/cloudflare-deploy" },
    tags: ["cloudflare", "workers", "pages", "deploy"],
  },
  {
    id: "render-deploy",
    displayName: "Render Deploy",
    shortDescription: "Deploy applications to Render via Blueprints or MCP",
    category: "deploy",
    icon: "render.svg",
    defaultPrompt: "Deploy this application to Render and provide service URL, env vars, and next checks.",
    dependencies: [
      { type: "mcp", value: "render", description: "Render MCP server", url: "https://mcp.render.com/mcp" }
    ],
    installSource: { type: "github", repo: "openai/skills", path: "skills/.curated/render-deploy" },
    tags: ["render", "deploy", "hosting", "mcp"],
  },

  // ─── Dev Tools ────────────────────────────────────
  {
    id: "gh-fix-ci",
    displayName: "GitHub Fix CI",
    shortDescription: "Debug failing GitHub Actions CI",
    category: "dev-tools",
    icon: "github.svg",
    defaultPrompt: "Inspect failing GitHub Actions checks in this repo, summarize root cause, and propose a focused fix plan.",
    installSource: { type: "github", repo: "openai/skills", path: "skills/.curated/gh-fix-ci" },
    tags: ["github", "ci", "actions", "debug"],
  },
  {
    id: "gh-address-comments",
    displayName: "GitHub Address Comments",
    shortDescription: "Address comments in a GitHub PR review",
    category: "dev-tools",
    icon: "github.svg",
    defaultPrompt: "Address all actionable GitHub PR review comments in this branch and summarize the updates.",
    installSource: { type: "github", repo: "openai/skills", path: "skills/.curated/gh-address-comments" },
    tags: ["github", "pr", "review", "comments"],
  },
  {
    id: "linear",
    displayName: "Linear",
    shortDescription: "Manage Linear issues in Seline",
    category: "dev-tools",
    icon: "linear.svg",
    defaultPrompt: "Use Linear context to triage or update relevant issues for this task, with clear next actions.",
    dependencies: [
      { type: "mcp", value: "linear", description: "Linear MCP server", url: "https://mcp.linear.app/mcp" }
    ],
    installSource: { type: "github", repo: "openai/skills", path: "skills/.curated/linear" },
    tags: ["linear", "issues", "project-management", "mcp"],
  },
  {
    id: "sentry",
    displayName: "Sentry",
    shortDescription: "Read-only Sentry observability",
    category: "dev-tools",
    icon: "sentry.svg",
    defaultPrompt: "Investigate this issue in read-only Sentry data and report likely root cause, impact, and next steps.",
    installSource: { type: "github", repo: "openai/skills", path: "skills/.curated/sentry" },
    tags: ["sentry", "observability", "errors", "monitoring"],
  },
  {
    id: "playwright",
    displayName: "Playwright",
    shortDescription: "Automate real browsers from the terminal",
    category: "dev-tools",
    icon: "playwright.svg",
    defaultPrompt: "Automate this browser workflow with Playwright and produce a reliable script with run steps.",
    installSource: { type: "github", repo: "openai/skills", path: "skills/.curated/playwright" },
    tags: ["playwright", "browser", "testing", "automation"],
  },
  {
    id: "screenshot",
    displayName: "Screenshot",
    shortDescription: "Capture screenshots",
    category: "dev-tools",
    icon: "screenshot.svg",
    fallbackIcon: "Camera",
    defaultPrompt: "Capture the right screenshot for this task (target, area, and output path).",
    installSource: { type: "github", repo: "openai/skills", path: "skills/.curated/screenshot" },
    tags: ["screenshot", "capture", "image"],
  },
  {
    id: "jupyter-notebook",
    displayName: "Jupyter Notebooks",
    shortDescription: "Create Jupyter notebooks for experiments and tutorials",
    category: "dev-tools",
    icon: "jupyter.svg",
    defaultPrompt: "Create a Jupyter notebook for this task with clear sections, runnable cells, and concise takeaways.",
    installSource: { type: "github", repo: "openai/skills", path: "skills/.curated/jupyter-notebook" },
    tags: ["jupyter", "notebook", "python", "data"],
  },
  {
    id: "chatgpt-apps",
    displayName: "ChatGPT Apps",
    shortDescription: "Build and scaffold ChatGPT apps",
    category: "dev-tools",
    icon: "openai.svg",
    defaultPrompt: "Use $chatgpt-apps to classify the app archetype first, fetch current OpenAI Apps SDK docs before generating code.",
    dependencies: [
      { type: "mcp", value: "openaiDeveloperDocs", description: "OpenAI Developer Docs MCP", url: "https://developers.openai.com/mcp" }
    ],
    installSource: { type: "github", repo: "openai/skills", path: "skills/.curated/chatgpt-apps" },
    tags: ["chatgpt", "openai", "apps", "sdk"],
  },
  {
    id: "develop-web-game",
    displayName: "Develop Web Game",
    shortDescription: "Web game dev + Playwright test loop",
    category: "creative",
    icon: "game.svg",
    fallbackIcon: "Gamepad2",
    defaultPrompt: "Build and iterate a playable web game in this workspace, validating changes with a Playwright loop.",
    installSource: { type: "github", repo: "openai/skills", path: "skills/.curated/develop-web-game" },
    tags: ["game", "web", "playwright", "development"],
  },
  {
    id: "yeet",
    displayName: "Yeet",
    shortDescription: "Stage, commit, and open PR",
    category: "dev-tools",
    icon: "yeet.svg",
    fallbackIcon: "GitPullRequest",
    defaultPrompt: "Prepare this branch for review: stage intended changes, write a focused commit, and open a PR.",
    installSource: { type: "github", repo: "openai/skills", path: "skills/.curated/yeet" },
    tags: ["git", "commit", "pr", "push"],
  },

  // ─── Productivity ─────────────────────────────────
  {
    id: "notion-knowledge-capture",
    displayName: "Notion Knowledge Capture",
    shortDescription: "Capture conversations into structured Notion pages",
    category: "productivity",
    icon: "notion.svg",
    defaultPrompt: "Capture this conversation into structured Notion pages with decisions, action items, and owners when known.",
    dependencies: [
      { type: "mcp", value: "notion", description: "Notion MCP server", url: "https://mcp.notion.com/mcp" }
    ],
    installSource: { type: "github", repo: "openai/skills", path: "skills/.curated/notion-knowledge-capture" },
    tags: ["notion", "knowledge", "capture", "documentation"],
  },
  {
    id: "notion-meeting-intelligence",
    displayName: "Notion Meeting Intelligence",
    shortDescription: "Prep meetings with Notion context and tailored agendas",
    category: "productivity",
    icon: "notion.svg",
    defaultPrompt: "Prepare this meeting from Notion context with a brief, agenda, decisions needed, and open questions.",
    dependencies: [
      { type: "mcp", value: "notion", description: "Notion MCP server", url: "https://mcp.notion.com/mcp" }
    ],
    installSource: { type: "github", repo: "openai/skills", path: "skills/.curated/notion-meeting-intelligence" },
    tags: ["notion", "meeting", "agenda", "prep"],
  },
  {
    id: "notion-research-documentation",
    displayName: "Notion Research & Documentation",
    shortDescription: "Research Notion content and produce briefs/reports",
    category: "productivity",
    icon: "notion.svg",
    defaultPrompt: "Research this topic in Notion and produce a sourced brief with clear recommendations.",
    dependencies: [
      { type: "mcp", value: "notion", description: "Notion MCP server", url: "https://mcp.notion.com/mcp" }
    ],
    installSource: { type: "github", repo: "openai/skills", path: "skills/.curated/notion-research-documentation" },
    tags: ["notion", "research", "documentation", "brief"],
  },
  {
    id: "notion-spec-to-implementation",
    displayName: "Notion Spec to Implementation",
    shortDescription: "Turn Notion specs into implementation plans, tasks, and progress tracking",
    category: "productivity",
    icon: "notion.svg",
    defaultPrompt: "Turn this Notion spec into an implementation plan with milestones, tasks, and dependencies.",
    dependencies: [
      { type: "mcp", value: "notion", description: "Notion MCP server", url: "https://mcp.notion.com/mcp" }
    ],
    installSource: { type: "github", repo: "openai/skills", path: "skills/.curated/notion-spec-to-implementation" },
    tags: ["notion", "spec", "implementation", "planning"],
  },
  {
    id: "pdf",
    displayName: "PDF",
    shortDescription: "Create, edit, and review PDFs",
    category: "productivity",
    icon: "pdf.svg",
    fallbackIcon: "FileText",
    defaultPrompt: "Create, edit, or review this PDF and summarize the key output or changes.",
    installSource: { type: "github", repo: "openai/skills", path: "skills/.curated/pdf" },
    tags: ["pdf", "document", "create", "edit"],
  },
  {
    id: "doc",
    displayName: "Word Docs",
    shortDescription: "Edit and review docx files",
    category: "productivity",
    icon: "doc.svg",
    fallbackIcon: "FileEdit",
    defaultPrompt: "Edit or review this .docx file and return the updated file plus a concise change summary.",
    installSource: { type: "github", repo: "openai/skills", path: "skills/.curated/doc" },
    tags: ["docx", "word", "document", "edit"],
  },
  {
    id: "spreadsheet",
    displayName: "Spreadsheet",
    shortDescription: "Create, edit, and analyze spreadsheets",
    category: "productivity",
    icon: "spreadsheet.svg",
    fallbackIcon: "Sheet",
    defaultPrompt: "Create or update a spreadsheet for this task with the right formulas, structure, and formatting.",
    installSource: { type: "github", repo: "openai/skills", path: "skills/.curated/spreadsheet" },
    tags: ["spreadsheet", "excel", "csv", "data"],
  },

  // ─── Creative ─────────────────────────────────────
  {
    id: "imagegen",
    displayName: "Image Gen",
    shortDescription: "Generate and edit images using OpenAI",
    category: "creative",
    icon: "imagegen.svg",
    defaultPrompt: "Generate or edit images for this task and return the final prompt plus selected outputs.",
    dependencies: [
      { type: "api-key", value: "OPENAI_API_KEY", description: "OpenAI API key for image generation" }
    ],
    installSource: { type: "github", repo: "openai/skills", path: "skills/.curated/imagegen" },
    tags: ["image", "generate", "edit", "openai", "gpt-image"],
  },
  {
    id: "sora",
    displayName: "Sora",
    shortDescription: "Generate and manage Sora videos",
    category: "creative",
    icon: "sora.svg",
    defaultPrompt: "Plan and generate a Sora video for this request, then iterate with concrete prompt edits.",
    dependencies: [
      { type: "api-key", value: "OPENAI_API_KEY", description: "OpenAI API key for Sora" }
    ],
    installSource: { type: "github", repo: "openai/skills", path: "skills/.curated/sora" },
    tags: ["sora", "video", "generate", "openai"],
  },
  {
    id: "speech",
    displayName: "Speech",
    shortDescription: "Generate narrated audio from text",
    category: "creative",
    icon: "speech.svg",
    fallbackIcon: "AudioLines",
    defaultPrompt: "Generate spoken audio for this text with the right voice style, pacing, and output format.",
    dependencies: [
      { type: "api-key", value: "OPENAI_API_KEY", description: "OpenAI API key for TTS" }
    ],
    installSource: { type: "github", repo: "openai/skills", path: "skills/.curated/speech" },
    tags: ["speech", "tts", "audio", "voice"],
  },
  {
    id: "transcribe",
    displayName: "Transcribe",
    shortDescription: "Transcribe audio using OpenAI, with optional speaker diarization",
    category: "creative",
    icon: "transcribe.svg",
    fallbackIcon: "AudioWaveform",
    defaultPrompt: "Transcribe this audio or video, include speaker labels when possible, and provide a clean summary.",
    dependencies: [
      { type: "api-key", value: "OPENAI_API_KEY", description: "OpenAI API key for Whisper" }
    ],
    installSource: { type: "github", repo: "openai/skills", path: "skills/.curated/transcribe" },
    tags: ["transcribe", "audio", "whisper", "speech-to-text"],
  },

  // ─── Docs ─────────────────────────────────────────
  {
    id: "openai-docs",
    displayName: "OpenAI Docs",
    shortDescription: "Reference the official OpenAI Developer docs",
    category: "docs",
    icon: "openai.svg",
    defaultPrompt: "Look up official OpenAI docs for this task and answer with concise, cited guidance.",
    dependencies: [
      { type: "mcp", value: "openaiDeveloperDocs", description: "OpenAI Developer Docs MCP", url: "https://developers.openai.com/mcp" }
    ],
    installSource: { type: "github", repo: "openai/skills", path: "skills/.curated/openai-docs" },
    tags: ["openai", "docs", "api", "reference"],
  },

  // ─── Security ─────────────────────────────────────
  {
    id: "security-best-practices",
    displayName: "Security Best Practices",
    shortDescription: "Security reviews and secure-by-default guidance",
    category: "security",
    icon: "security.svg",
    fallbackIcon: "Shield",
    defaultPrompt: "Review this codebase for security best practices and suggest secure-by-default improvements.",
    installSource: { type: "github", repo: "openai/skills", path: "skills/.curated/security-best-practices" },
    tags: ["security", "review", "best-practices", "audit"],
  },
  {
    id: "security-ownership-map",
    displayName: "Security Ownership Map",
    shortDescription: "Map maintainers, bus factor, and sensitive code ownership",
    category: "security",
    icon: "security.svg",
    fallbackIcon: "ShieldCheck",
    defaultPrompt: "Build a security ownership map for this repository and identify bus-factor risks in sensitive code.",
    installSource: { type: "github", repo: "openai/skills", path: "skills/.curated/security-ownership-map" },
    tags: ["security", "ownership", "bus-factor", "audit"],
  },
  {
    id: "security-threat-model",
    displayName: "Security Threat Model",
    shortDescription: "Repo-grounded threat modeling and abuse-path analysis",
    category: "security",
    icon: "security.svg",
    fallbackIcon: "ShieldAlert",
    defaultPrompt: "Create a repository-grounded threat model for this codebase with prioritized abuse paths and mitigations.",
    installSource: { type: "github", repo: "openai/skills", path: "skills/.curated/security-threat-model" },
    tags: ["security", "threat-model", "abuse-paths", "audit"],
  },

  // ─── Platform-specific ────────────────────────────
  {
    id: "aspnet-core",
    displayName: "ASP.NET Core",
    shortDescription: "[Windows] Build and review ASP.NET Core web apps",
    category: "dev-tools",
    icon: "dotnet.svg",
    defaultPrompt: "Create a new ASP.NET Core website for me.",
    installSource: { type: "github", repo: "openai/skills", path: "skills/.curated/aspnet-core" },
    tags: ["dotnet", "aspnet", "csharp", "windows"],
    platforms: ["windows"],
  },
  {
    id: "winui-app",
    displayName: "WinUI App",
    shortDescription: "[Windows] Build native WinUI 3 apps",
    category: "dev-tools",
    icon: "winui.svg",
    defaultPrompt: "Create a new WinUI 3 desktop app for me.",
    installSource: { type: "github", repo: "openai/skills", path: "skills/.curated/winui-app" },
    tags: ["winui", "windows", "desktop", "native"],
    platforms: ["windows"],
  },
];
```

## System Skills (Pre-installed)

```ts
// lib/skills/catalog/system-skills.ts

export const SYSTEM_SKILLS: CatalogSkill[] = [
  {
    id: "skill-creator",
    displayName: "Skill Creator",
    shortDescription: "Create or update a skill",
    category: "dev-tools",
    icon: "skill-creator.svg",
    fallbackIcon: "Pencil",
    defaultPrompt: "Create a new skill based on this conversation.",
    installSource: { type: "bundled" },
    tags: ["skill", "create", "update", "meta"],
  },
  {
    id: "notion",
    displayName: "Notion",
    shortDescription: "Notion API for creating and managing pages, databases, and blocks",
    category: "productivity",
    icon: "notion.svg",
    defaultPrompt: "Use Notion API to manage pages and databases.",
    dependencies: [
      { type: "mcp", value: "notion", description: "Notion MCP server", url: "https://mcp.notion.com/mcp" }
    ],
    installSource: { type: "bundled" },
    tags: ["notion", "api", "pages", "databases"],
  },
];
```

## Icon Inventory

Icons to add to `/public/icons/skills/`:

| Filename | Source | Notes |
|---|---|---|
| figma.svg | SimpleIcons / Figma press kit | Brand mark |
| vercel.svg | Already exists? Check /icons/brands/ | Triangle mark |
| netlify.svg | SimpleIcons | |
| cloudflare.svg | SimpleIcons | |
| render.svg | Render press kit | |
| github.svg | SimpleIcons | Invertocat |
| linear.svg | SimpleIcons | |
| sentry.svg | SimpleIcons | |
| playwright.svg | SimpleIcons / MS | |
| jupyter.svg | SimpleIcons | |
| openai.svg | Can reuse from /icons/brands/openai.svg | |
| notion.svg | Can reuse from /icons/brands/ if exists | |
| dotnet.svg | SimpleIcons | |
| winui.svg | Microsoft press kit | |
| security.svg | Custom — Phosphor Shield exported as SVG | |
| pdf.svg | Custom — Phosphor FilePdf exported as SVG | |
| doc.svg | Custom — Phosphor FileDoc exported as SVG | |
| spreadsheet.svg | Custom — Phosphor Table exported as SVG | |
| imagegen.svg | Custom — Phosphor Image exported as SVG | |
| sora.svg | OpenAI press kit / custom | |
| speech.svg | Custom — Phosphor SpeakerHigh exported as SVG | |
| transcribe.svg | Custom — Phosphor Microphone exported as SVG | |
| screenshot.svg | Custom — Phosphor Camera exported as SVG | |
| game.svg | Custom — Phosphor GameController exported as SVG | |
| yeet.svg | Custom — Phosphor GitPullRequest exported as SVG | |
| skill-creator.svg | Custom — Phosphor PencilSimple exported as SVG | |

**Reusable from existing `/icons/brands/`**: openai.svg, possibly notion (if we add it there).

**Strategy for generic skills**: Export Phosphor icons as static SVGs using https://phosphoricons.com — select icon → download SVG → save to `/public/icons/skills/`. This gives us proper, optimized SVGs (not runtime-generated) that match the Phosphor weight system already used in tool-badge.tsx.
