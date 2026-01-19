import { getFileTreeForAgent, formatFileTreeCompact } from "@/lib/ai/file-tree";

const FILE_TREE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CachedFileTree {
  summary: string;
  fetchedAt: number;
}

const fileTreeCache = new Map<string, CachedFileTree>();

export async function getFileTreeSummaryForSearch(characterId: string): Promise<string | null> {
  if (!characterId) return null;

  const cached = fileTreeCache.get(characterId);
  const now = Date.now();

  if (cached && now - cached.fetchedAt < FILE_TREE_CACHE_TTL_MS) {
    return cached.summary || null;
  }

  try {
    const trees = await getFileTreeForAgent(characterId, {
      maxDepth: 3,
      maxEntries: 150,
    });

    if (!trees.length) {
      fileTreeCache.set(characterId, { summary: "", fetchedAt: now });
      return null;
    }

    const summary = formatFileTreeCompact(trees);
    fileTreeCache.set(characterId, { summary, fetchedAt: now });
    return summary;
  } catch (error) {
    console.warn(
      "[VectorSearchFileTree] Failed to load file tree summary:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

export function clearFileTreeSummary(characterId: string): void {
  fileTreeCache.delete(characterId);
}
