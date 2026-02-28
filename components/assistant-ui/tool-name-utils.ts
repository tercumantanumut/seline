export function getCanonicalToolName(toolName: string): string {
  const match = /^mcp__.+?__(.+)$/.exec(toolName);
  return match?.[1] || toolName;
}

