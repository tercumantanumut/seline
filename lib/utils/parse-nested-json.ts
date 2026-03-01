export function parseNestedJsonString(value: string, maxDepth: number = 3): unknown | undefined {
  let current: unknown = value;
  for (let i = 0; i < maxDepth; i += 1) {
    if (typeof current !== "string") return current;
    const trimmed = current.trim();
    if (!trimmed) return undefined;
    try {
      current = JSON.parse(trimmed);
    } catch {
      return i === 0 ? undefined : current;
    }
  }
  return current;
}
