import type { AgentTemplate } from "./types";
import { getDefaultSeleneMemories } from "./platform-memories";
import { DEFAULT_ENABLED_TOOLS } from "./resolve-tools";

/**
 * Static fallback tool list for the Selene default template.
 *
 * This is used when settings are not available (e.g., during template listing
 * or when displaying template previews). The actual tool list used at agent
 * creation time is resolved dynamically by `resolveSeleneTemplateTools()`
 * which checks user settings, API keys, and feature flags.
 *
 * Changes to this list should be mirrored in `resolve-tools.ts`.
 *
 * Excluded by design:
 * - describeImage: Not essential for default template; users can add manually
 * - patchFile: Redundant with editFile for most use cases
 */
const SELENE_STATIC_TOOLS: string[] = [
  ...DEFAULT_ENABLED_TOOLS,
  // Conditional tools (included in static list for preview/display)
  "vectorSearch",
];

export const SELENE_DEFAULT_TEMPLATE: AgentTemplate = {
  id: "selene-default",
  name: "Selene",
  tagline: "Your AI agent on the Selene platform",
  purpose: "A powerful AI agent on the Selene platform. I can search the web, generate and edit images, analyze documents, execute commands, manage files, run deep research, and orchestrate multi-step workflows. I have access to a rich tool ecosystem with plugins, skills, and integrations across channels like Telegram, WhatsApp, Slack, and Discord.",
  isDefault: true,
  isDeletable: true,
  enabledTools: SELENE_STATIC_TOOLS,
  syncFolders: [
    {
      pathVariable: "${USER_WORKSPACE}",
      displayName: "My Workspace",
      isPrimary: true,
      includeExtensions: [
        "md",
        "txt",
        "pdf",
        "html",
        "json",
        "csv",
        "yaml",
        "yml",
      ],
      excludePatterns: [],
    },
  ],
  memories: getDefaultSeleneMemories(),
};

export default SELENE_DEFAULT_TEMPLATE;
