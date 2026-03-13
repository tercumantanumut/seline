export type ChatWorkspaceMode = "sidebar" | "browser-tabs";

export const DEFAULT_CHAT_WORKSPACE_MODE: ChatWorkspaceMode = "sidebar";

export function isChatWorkspaceMode(value: unknown): value is ChatWorkspaceMode {
  return value === "sidebar" || value === "browser-tabs";
}
