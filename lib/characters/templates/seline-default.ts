import type { AgentTemplate } from "./types";
import { getDefaultSelineMemories } from "./platform-memories";

export const SELINE_DEFAULT_TEMPLATE: AgentTemplate = {
  id: "seline-default",
  name: "Seline",
  tagline: "Your AI companion on the Seline platform",
  purpose: "A helpful AI assistant on the Seline platform. I can help you search the web, analyze documents, execute commands, and accomplish tasks. You can add sync folders to give me access to your files and documents.",
  isDefault: true,
  isDeletable: true,
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
