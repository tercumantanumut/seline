import { tool, jsonSchema } from "ai";
import { readFileSync } from "fs";
import path from "path";
import { withToolLogging } from "@/lib/ai/tool-registry/logging";

interface PromptLibraryInput {
  action: "search" | "trending" | "random" | "categories" | "get";
  query?: string;
  category?: string;
  limit?: number;
  id?: string;
}

interface PromptEntry {
  rank: number;
  id: string;
  prompt: string;
  author: string;
  author_name: string;
  likes: number;
  views: number;
  image: string;
  images: string[];
  model: string;
  categories: string[];
  date: string;
  source_url: string;
}

interface PromptPreview {
  id: string;
  rank: number;
  promptPreview: string;
  categories: string[];
  likes: number;
  views: number;
  format: "json" | "text";
}

const promptLibrarySchema = jsonSchema<PromptLibraryInput>({
  type: "object",
  title: "PromptLibraryInput",
  description: "Input schema for prompt library discovery and retrieval",
  properties: {
    action: {
      type: "string",
      enum: ["search", "trending", "random", "categories", "get"],
      description:
        "Action to perform: search prompts, get trending prompts, random prompts, category stats, or full prompt by ID.",
    },
    query: {
      type: "string",
      description: "Search query for action='search'.",
    },
    category: {
      type: "string",
      description: "Optional category filter. Example: Photography, JSON, Product & Brand.",
    },
    limit: {
      type: "number",
      description: "Maximum results to return (default 10, max 20).",
    },
    id: {
      type: "string",
      description: "Prompt ID for action='get'.",
    },
  },
  required: ["action"],
  additionalProperties: false,
});

let promptsCache: PromptEntry[] | null = null;
let idIndex: Map<string, PromptEntry> | null = null;
let categoryIndex: Map<string, PromptEntry[]> | null = null;

function loadPrompts(): PromptEntry[] {
  if (promptsCache) {
    return promptsCache;
  }

  const filePath = path.join(process.cwd(), "data", "prompt-library", "prompts.json");
  const parsedRaw = JSON.parse(readFileSync(filePath, "utf-8")) as unknown;
  if (!Array.isArray(parsedRaw)) {
    throw new Error("Prompt library data must be an array");
  }
  const parsed = parsedRaw as PromptEntry[];

  promptsCache = parsed;
  idIndex = new Map(parsed.map((entry) => [entry.id, entry]));
  categoryIndex = new Map();

  for (const entry of parsed) {
    for (const category of entry.categories) {
      if (!categoryIndex.has(category)) {
        categoryIndex.set(category, []);
      }
      categoryIndex.get(category)?.push(entry);
    }
  }

  return promptsCache;
}

function detectPromptFormat(prompt: string): "json" | "text" {
  const trimmed = prompt.trimStart();
  return trimmed.startsWith("{") || trimmed.startsWith("[") ? "json" : "text";
}

function toPreview(entry: PromptEntry): PromptPreview {
  const maxPreview = 200;
  const preview = entry.prompt.length > maxPreview
    ? `${entry.prompt.slice(0, maxPreview).trimEnd()}...`
    : entry.prompt;

  return {
    id: entry.id,
    rank: entry.rank,
    promptPreview: preview,
    categories: entry.categories,
    likes: entry.likes,
    views: entry.views,
    format: detectPromptFormat(entry.prompt),
  };
}

function filterByCategory(entries: PromptEntry[], category?: string): PromptEntry[] {
  if (!category || !category.trim()) {
    return entries;
  }

  const categoryLower = category.trim().toLowerCase();
  return entries.filter((entry) =>
    entry.categories.some((item) => item.toLowerCase() === categoryLower)
  );
}

function clampLimit(limit?: number): number {
  if (typeof limit !== "number" || Number.isNaN(limit)) {
    return 10;
  }
  return Math.max(1, Math.min(20, Math.floor(limit)));
}

function scoreEntry(entry: PromptEntry, queryWords: string[]): number {
  if (queryWords.length === 0) {
    return 0;
  }

  const promptLower = entry.prompt.toLowerCase();
  const categoriesLower = entry.categories.map((c) => c.toLowerCase()).join(" ");
  let keywordScore = 0;

  for (const word of queryWords) {
    if (!word) {
      continue;
    }

    if (categoriesLower.includes(word)) {
      keywordScore += 2;
    }

    if (promptLower.includes(word)) {
      keywordScore += 1;
    }
  }

  if (keywordScore === 0) {
    return 0;
  }

  // Popularity weighting keeps proven prompts near the top without overpowering relevance.
  const popularityWeight = Math.log(entry.likes + 1);
  return keywordScore * popularityWeight;
}

function runSearch(entries: PromptEntry[], query: string, limit: number): PromptPreview[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return runTrending(entries, limit);
  }

  const queryWords = normalized
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

  const scored = entries
    .map((entry) => ({ entry, score: scoreEntry(entry, queryWords) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => toPreview(item.entry));

  return scored;
}

function runTrending(entries: PromptEntry[], limit: number): PromptPreview[] {
  return [...entries]
    .sort((a, b) => b.likes - a.likes)
    .slice(0, limit)
    .map(toPreview);
}

function runRandom(entries: PromptEntry[], limit: number): PromptPreview[] {
  const shuffled = [...entries];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = temp;
  }

  return shuffled.slice(0, limit).map(toPreview);
}

function runCategories(): Array<{ name: string; count: number }> {
  loadPrompts();

  const categories = Array.from(categoryIndex?.entries() ?? []).map(([name, items]) => ({
    name,
    count: items.length,
  }));

  return categories.sort((a, b) => b.count - a.count);
}

function runGet(id: string) {
  loadPrompts();

  const entry = idIndex?.get(id);
  if (!entry) {
    return {
      success: false,
      error: `Prompt not found for id: ${id}`,
    };
  }

  return {
    success: true,
    prompt: {
      ...entry,
      format: detectPromptFormat(entry.prompt),
    },
  };
}

export function createPromptLibraryTool({ sessionId }: { sessionId: string }) {
  const executePromptLibrary = async (input: PromptLibraryInput) => {
    const allEntries = loadPrompts();
    const action = input.action;
    const limit = clampLimit(input.limit);

    if (action === "categories") {
      return {
        success: true,
        action,
        categories: runCategories(),
      };
    }

    if (action === "get") {
      if (!input.id || !input.id.trim()) {
        return {
          success: false,
          action,
          error: "id is required for action='get'",
        };
      }
      return {
        action,
        ...runGet(input.id.trim()),
      };
    }

    const filtered = filterByCategory(allEntries, input.category);

    if (action === "search") {
      const query = input.query?.trim() || "";
      if (!query) {
        return {
          success: false,
          action,
          error: "query is required for action='search'",
        };
      }
      return {
        success: true,
        action,
        totalMatches: filtered.length,
        returned: Math.min(limit, filtered.length),
        results: runSearch(filtered, query, limit),
      };
    }

    if (action === "trending") {
      return {
        success: true,
        action,
        totalMatches: filtered.length,
        returned: Math.min(limit, filtered.length),
        results: runTrending(filtered, limit),
      };
    }

    if (action === "random") {
      return {
        success: true,
        action,
        totalMatches: filtered.length,
        returned: Math.min(limit, filtered.length),
        results: runRandom(filtered, limit),
      };
    }

    return {
      success: false,
      action,
      error: `Unknown action: ${action}`,
    };
  };

  const executeWithLogging = withToolLogging(
    "promptLibrary",
    sessionId,
    (input: PromptLibraryInput) => executePromptLibrary(input)
  );

  return tool({
    description:
      "Search and retrieve proven image generation prompts from the NanoBanana trending library. " +
      "Actions: search, trending, random, categories, get.",
    inputSchema: promptLibrarySchema,
    execute: executeWithLogging,
  });
}
