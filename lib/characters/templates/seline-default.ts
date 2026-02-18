import type { AgentTemplate } from "./types";
import { getDefaultSelineMemories } from "./platform-memories";

/**
 * Static fallback tool list for the Seline default template.
 *
 * This is used when settings are not available (e.g., during template listing
 * or when displaying template previews). The actual tool list used at agent
 * creation time is resolved dynamically by `resolveSelineTemplateTools()`
 * which checks user settings, API keys, and feature flags.
 *
 * Changes to this list should be mirrored in `resolve-tools.ts`.
 *
 * Excluded by design:
 * - describeImage: Not essential for default template; users can add manually
 * - patchFile: Redundant with editFile for most use cases
 */
const SELINE_STATIC_TOOLS: string[] = [
  // Core tools (always enabled)
  "docsSearch",
  "localGrep",
  "readFile",
  "editFile",
  "writeFile",
  "executeCommand",
  // Conditional tools (included in static list for preview/display)
  "vectorSearch",
  "webSearch",
  "webBrowse",
  // Utility tools (always enabled)
  "calculator",
  "memorize",
  "runSkill",
  "scheduleTask",
  "sendMessageToChannel",
  "showProductImages",
  "updatePlan",
  "updateSkill",
];

export const SELINE_DEFAULT_TEMPLATE: AgentTemplate = {
  id: "seline-default",
  name: "Seline",
  tagline: "Your AI companion on the Seline platform",
  purpose: "A helpful AI assistant on the Seline platform. I can help you search the web, analyze documents, execute commands, and accomplish tasks. You can add sync folders to give me access to your files and documents.",
  isDefault: true,
  isDeletable: true,
  enabledTools: SELINE_STATIC_TOOLS,
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
  memories: getDefaultSelineMemories(),
};

export default SELINE_DEFAULT_TEMPLATE;
