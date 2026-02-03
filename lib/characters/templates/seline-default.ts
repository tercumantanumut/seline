import type { AgentTemplate } from "./types";
import { getDefaultSelineMemories } from "./platform-memories";

export const SELINE_DEFAULT_TEMPLATE: AgentTemplate = {
  id: "seline-default",
  name: "Seline",
  tagline: "Your AI companion on the Seline platform",
  purpose: "A helpful AI assistant that understands the Seline platform and can help you navigate its features, answer questions, search the web, analyze documents, execute commands, and accomplish tasks. I have access to your synced folders and can help with code-related questions.",
  isDefault: true,
  isDeletable: false,
  enabledTools: [
    "docsSearch",
    "vectorSearch",
    "localGrep",
    "readFile",
    "webSearch",
    "webBrowse",
    "executeCommand",
    "describeImage",
  ],
  syncFolders: [
    {
      pathVariable: "${SETUP_FOLDER}",
      displayName: "Seline Codebase",
      isPrimary: true,
      includeExtensions: [
        "ts",
        "tsx",
        "js",
        "jsx",
        "md",
        "mdx",
        "json",
        "css",
        "scss",
        "html",
        "yaml",
        "yml",
        "example",
      ],
      excludePatterns: [
        "node_modules",
        ".git",
        ".next",
        "dist",
        "build",
        "coverage",
        "*.lock",
        ".env",
        ".env.local",
      ],
    },
  ],
  memories: getDefaultSelineMemories(),
};

export default SELINE_DEFAULT_TEMPLATE;
