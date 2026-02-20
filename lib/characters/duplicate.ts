type MetadataLike = unknown;

export function buildDuplicateCharacterName(sourceName: string): string {
  const baseName = sourceName.replace(/ \(copy\)$/, "");
  return `${baseName} (copy)`;
}

export function buildDuplicateDisplayName(sourceDisplayName: string | null): string | null {
  if (!sourceDisplayName) return null;
  const baseDisplayName = sourceDisplayName.replace(/ \(copy\)$/, "");
  return `${baseDisplayName} (copy)`;
}

export function buildDuplicateMetadata(sourceMetadata: MetadataLike): Record<string, unknown> {
  const metadata = { ...((sourceMetadata as Record<string, unknown>) || {}) };
  delete metadata.workflowId;
  delete metadata.workflowRole;
  delete metadata.inheritedResources;
  return metadata;
}
