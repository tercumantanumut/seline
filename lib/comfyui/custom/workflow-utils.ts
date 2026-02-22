export function looksLikeComfyUIWorkflow(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  if (Array.isArray(record.nodes)) {
    return true;
  }

  const nodeEntries = Object.entries(record).filter(([key]) => !key.startsWith("_"));
  if (nodeEntries.length === 0) {
    return false;
  }

  return nodeEntries.every(([key, node]) => {
    if (!/^\d+$/.test(key)) {
      return false;
    }

    if (!node || typeof node !== "object" || Array.isArray(node)) {
      return false;
    }

    return "class_type" in (node as Record<string, unknown>);
  });
}

export function extractWorkflowFileName(fileName: string): string {
  const normalized = fileName.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] || fileName;
}

export function countWorkflowNodes(workflow: Record<string, unknown>): number {
  if (Array.isArray(workflow.nodes)) {
    return workflow.nodes.length;
  }

  return Object.keys(workflow).filter((key) => /^\d+$/.test(key)).length;
}

export function createWorkflowNameFromFileName(fileName: string, fallbackIndex = 1): string {
  const baseName = extractWorkflowFileName(fileName);

  const raw = baseName
    .replace(/\.json$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();

  if (!raw) {
    return `Custom ComfyUI Workflow ${fallbackIndex}`;
  }

  const titled = raw
    .split(/\s+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");

  return titled || `Custom ComfyUI Workflow ${fallbackIndex}`;
}
