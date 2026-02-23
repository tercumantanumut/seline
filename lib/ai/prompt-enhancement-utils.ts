/**
 * Prompt Enhancement Utilities
 *
 * Low-level helpers for prompt-enhancement.ts:
 * - Token budget management
 * - Domain-specific concept expansions
 * - Cross-file dependency detection
 * - Query concept expansion
 * - Snippet selection and formatting
 * - File grouping and context building
 */

import { searchWithRouter, type VectorSearchHit } from "@/lib/vectordb";
import { extname, basename, dirname } from "path";

// =============================================================================
// Token Budget Management
// =============================================================================

export interface TokenBudget {
  total: number;       // Total tokens available for enhanced prompt
  filePointers: number; // Budget for file list (lightweight)
  snippets: number;    // Budget for actual content snippets
  metadata: number;    // Budget for instructions and formatting
}

export const DEFAULT_TOKEN_BUDGET: TokenBudget = {
  total: 4000,       // ~16K chars total enhanced prompt
  filePointers: 500, // ~2K chars for file list
  snippets: 3000,    // ~12K chars for content snippets
  metadata: 500,     // ~2K chars for instructions
};

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function truncateToTokenBudget(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 3) + "...";
}

// =============================================================================
// Domain-specific concept expansions (fast, no LLM call)
// =============================================================================

export const DOMAIN_EXPANSIONS: Record<string, string[]> = {
  // Authentication & Security
  auth: ["authentication", "session", "token", "login", "user", "jwt", "oauth", "credential"],
  login: ["authentication", "signin", "session", "user", "password"],
  session: ["authentication", "token", "cookie", "user", "login"],

  // API & Backend
  api: ["endpoint", "route", "handler", "request", "response", "http", "rest"],
  route: ["endpoint", "handler", "api", "path", "url"],
  endpoint: ["api", "route", "handler", "request"],

  // Database
  db: ["database", "query", "schema", "model", "migration", "sql", "table"],
  database: ["db", "query", "schema", "model", "sql"],
  query: ["database", "sql", "select", "find", "search"],
  model: ["schema", "database", "entity", "type", "interface"],

  // UI & Frontend
  ui: ["component", "render", "view", "layout", "style", "css", "jsx"],
  component: ["ui", "render", "props", "state", "hook"],
  style: ["css", "theme", "layout", "design", "ui"],

  // Testing
  test: ["spec", "mock", "fixture", "assert", "coverage", "jest", "vitest"],
  mock: ["test", "stub", "fake", "spy"],

  // State Management
  state: ["store", "reducer", "action", "context", "hook"],
  store: ["state", "redux", "zustand", "context"],

  // File Operations
  file: ["read", "write", "path", "fs", "stream", "buffer"],
  upload: ["file", "multipart", "form", "storage", "media"],

  // Error Handling
  error: ["exception", "catch", "throw", "handler", "logging"],

  // Configuration
  config: ["settings", "environment", "env", "options", "parameters"],
  settings: ["config", "preferences", "options"],

  // Search
  search: ["query", "find", "filter", "index", "vector", "semantic"],
  vector: ["embedding", "similarity", "search", "semantic", "lance"],
};

// =============================================================================
// Cross-file dependency detection
// =============================================================================

export interface FileDependency {
  sourceFile: string;
  referencedPath: string;
  importType: "import" | "require" | "reference" | "link";
}

/**
 * Extract dependencies (imports/references) from chunk text
 */
export function extractDependenciesFromChunk(chunkText: string, sourceFile: string): FileDependency[] {
  const dependencies: FileDependency[] = [];

  // TypeScript/JavaScript ES6 imports
  const importRegex = /import\s+(?:[\w\s{},*]+from\s+)?['"]([^'"]+)['"]/g;
  let match;
  while ((match = importRegex.exec(chunkText)) !== null) {
    dependencies.push({
      sourceFile,
      referencedPath: match[1],
      importType: "import",
    });
  }

  // CommonJS require
  const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = requireRegex.exec(chunkText)) !== null) {
    dependencies.push({
      sourceFile,
      referencedPath: match[1],
      importType: "require",
    });
  }

  // Python imports
  const pythonFromImport = /from\s+([^\s]+)\s+import/g;
  while ((match = pythonFromImport.exec(chunkText)) !== null) {
    dependencies.push({
      sourceFile,
      referencedPath: match[1].replace(/\./g, "/"),
      importType: "import",
    });
  }

  // Markdown links to local files
  const markdownLink = /\[.*?\]\(([^)]+\.(?:md|ts|tsx|js|jsx|py|json))\)/g;
  while ((match = markdownLink.exec(chunkText)) !== null) {
    if (!match[1].startsWith("http")) {
      dependencies.push({
        sourceFile,
        referencedPath: match[1],
        importType: "link",
      });
    }
  }

  return dependencies;
}

/**
 * Normalize import path relative to source file
 */
export function normalizeDependencyPath(importPath: string, sourceFile: string): string {
  // Remove @ alias prefix (common in Next.js/TypeScript)
  let normalized = importPath.replace(/^@\//, "");

  // Handle relative paths
  if (importPath.startsWith("./") || importPath.startsWith("../")) {
    const sourceDir = dirname(sourceFile);
    // Simple path resolution (doesn't handle all edge cases)
    if (importPath.startsWith("./")) {
      normalized = `${sourceDir}/${importPath.slice(2)}`;
    }
  }

  // Remove file extension for matching flexibility
  normalized = normalized.replace(/\.(ts|tsx|js|jsx|py|json)$/, "");

  return normalized;
}

/**
 * Resolve dependencies by searching for referenced files
 */
export async function resolveDependencies(
  dependencies: FileDependency[],
  characterId: string,
  existingFiles: Set<string>
): Promise<VectorSearchHit[]> {
  const additionalHits: VectorSearchHit[] = [];
  const resolvedPaths = new Set<string>();

  // Deduplicate dependencies
  const uniqueDeps = new Map<string, FileDependency>();
  for (const dep of dependencies) {
    const key = dep.referencedPath;
    if (!uniqueDeps.has(key)) {
      uniqueDeps.set(key, dep);
    }
  }

  // Limit to prevent too many searches
  const depsToResolve = Array.from(uniqueDeps.values()).slice(0, 10);

  for (const dep of depsToResolve) {
    const normalizedPath = normalizeDependencyPath(dep.referencedPath, dep.sourceFile);

    // Skip if already in results
    if (resolvedPaths.has(normalizedPath)) continue;

    // Check if any existing file matches
    let alreadyExists = false;
    for (const existing of existingFiles) {
      if (existing.includes(normalizedPath) || normalizedPath.includes(basename(existing, extname(existing)))) {
        alreadyExists = true;
        break;
      }
    }
    if (alreadyExists) continue;

    // Search for the file by name
    const searchTerm = basename(dep.referencedPath).replace(/\.(ts|tsx|js|jsx|py|json)$/, "");

    try {
      const searchResult = await searchWithRouter({
        characterId,
        query: searchTerm,
        options: { topK: 3, minScore: 0.1 },
      });

      // Filter to matches that look like the referenced file
      const matches = searchResult.filter((hit: VectorSearchHit) =>
        hit.relativePath.includes(searchTerm) ||
        hit.relativePath.endsWith(dep.referencedPath.replace(/^\.\//, ""))
      );

      if (matches.length > 0) {
        additionalHits.push(matches[0]);
        resolvedPaths.add(normalizedPath);
      }
    } catch (error) {
      // Ignore search errors for individual dependencies
      console.warn(`[PromptEnhancement] Failed to resolve dependency ${dep.referencedPath}:`, error);
    }
  }

  return additionalHits;
}

// =============================================================================
// Query Concept Expansion
// =============================================================================

export interface ConceptExpansionResult {
  expandedQueries: string[];
  conceptMap: Record<string, string[]>;
}

/**
 * Expand query with related concepts using domain mappings
 */
export function expandQueryConcepts(query: string): ConceptExpansionResult {
  const queryLower = query.toLowerCase();
  const words = queryLower.split(/\s+/).filter(w => w.length >= 3);

  const conceptMap: Record<string, string[]> = {};
  const allExpansions = new Set<string>();

  // Check each word against domain expansions
  for (const word of words) {
    // Direct match
    if (DOMAIN_EXPANSIONS[word]) {
      conceptMap[word] = DOMAIN_EXPANSIONS[word];
      DOMAIN_EXPANSIONS[word].slice(0, 3).forEach(e => allExpansions.add(e));
    }

    // Partial match (word is part of a key)
    for (const [key, expansions] of Object.entries(DOMAIN_EXPANSIONS)) {
      if (key.includes(word) || word.includes(key)) {
        conceptMap[key] = expansions;
        expansions.slice(0, 2).forEach(e => allExpansions.add(e));
      }
    }
  }

  // Build expanded queries
  const expansionArray = Array.from(allExpansions).slice(0, 5);
  const expandedQueries = [
    query,
    ...expansionArray.map(term => `${query} ${term}`),
  ].slice(0, 4); // Limit to 4 queries for performance

  return {
    expandedQueries,
    conceptMap,
  };
}

// =============================================================================
// Snippet Selection
// =============================================================================

export interface RankedSnippet {
  filePath: string;
  text: string;
  score: number;
  tokenCount: number;
  chunkIndex: number;
}

/**
 * Select the most relevant snippets within token budget
 */
export function selectSnippets(
  hits: VectorSearchHit[],
  tokenBudget: number
): RankedSnippet[] {
  // Convert hits to ranked snippets
  const allSnippets: RankedSnippet[] = hits.map(hit => ({
    filePath: hit.relativePath,
    text: hit.text,
    score: hit.score,
    tokenCount: estimateTokens(hit.text),
    chunkIndex: hit.chunkIndex,
  }));

  // Sort by score (highest first)
  allSnippets.sort((a, b) => b.score - a.score);

  // Greedy selection within budget, preferring diverse files
  const selected: RankedSnippet[] = [];
  const filesCovered = new Set<string>();
  let usedTokens = 0;

  // First pass: one snippet per file (diversity)
  for (const snippet of allSnippets) {
    if (filesCovered.has(snippet.filePath)) continue;
    if (usedTokens + snippet.tokenCount > tokenBudget) continue;

    selected.push(snippet);
    filesCovered.add(snippet.filePath);
    usedTokens += snippet.tokenCount;
  }

  // Second pass: fill remaining budget with more from top files
  for (const snippet of allSnippets) {
    if (selected.includes(snippet)) continue;
    if (usedTokens + snippet.tokenCount > tokenBudget) continue;

    selected.push(snippet);
    usedTokens += snippet.tokenCount;
  }

  return selected;
}

/**
 * Get code language for syntax highlighting
 */
export function getCodeLanguage(filePath: string): string {
  const ext = extname(filePath).toLowerCase().slice(1);
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    py: "python",
    md: "markdown",
    json: "json",
    html: "html",
    css: "css",
    sql: "sql",
    yaml: "yaml",
    yml: "yaml",
    sh: "bash",
    bash: "bash",
  };
  return langMap[ext] || ext || "text";
}

/**
 * Format selected snippets as markdown code blocks
 */
export function formatSnippetsAsContext(snippets: RankedSnippet[]): string {
  if (snippets.length === 0) return "";

  // Group by file
  const byFile = new Map<string, RankedSnippet[]>();
  for (const snippet of snippets) {
    if (!byFile.has(snippet.filePath)) {
      byFile.set(snippet.filePath, []);
    }
    byFile.get(snippet.filePath)!.push(snippet);
  }

  const lines: string[] = [];
  lines.push("## Relevant Code Snippets\n");

  for (const [filePath, fileSnippets] of byFile) {
    // Sort by chunk index
    const sorted = fileSnippets.sort((a, b) => a.chunkIndex - b.chunkIndex);
    const codeLang = getCodeLanguage(filePath);

    lines.push(`### ${filePath}\n`);

    for (let i = 0; i < sorted.length; i++) {
      const snippet = sorted[i];
      lines.push("```" + codeLang);
      lines.push(snippet.text.trim());
      lines.push("```");

      // Add ellipsis if there's a gap between chunks
      if (i < sorted.length - 1 && sorted[i + 1].chunkIndex > snippet.chunkIndex + 1) {
        lines.push("\n*[...]*\n");
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

// =============================================================================
// File Grouping
// =============================================================================

export interface FileGroup {
  filePath: string;
  fileName: string;
  fileType: string;
  directory: string;
  chunks: Array<{ text: string; chunkIndex: number }>;
}

/**
 * Get the file type from a path
 */
export function getFileType(filePath: string): string {
  const ext = extname(filePath).toLowerCase().slice(1);
  const typeMap: Record<string, string> = {
    ts: "TypeScript",
    tsx: "TypeScript React",
    js: "JavaScript",
    jsx: "JavaScript React",
    py: "Python",
    md: "Markdown",
    txt: "Text",
    json: "JSON",
    html: "HTML",
    css: "CSS",
    sql: "SQL",
    yaml: "YAML",
    yml: "YAML",
  };
  return typeMap[ext] || ext.toUpperCase() || "Unknown";
}

/**
 * Group search results by source file and deduplicate overlapping chunks
 */
export function groupResultsByFile(hits: VectorSearchHit[]): FileGroup[] {
  const groups = new Map<string, FileGroup>();

  for (const hit of hits) {
    const filePath = hit.relativePath;

    if (!groups.has(filePath)) {
      groups.set(filePath, {
        filePath,
        fileName: basename(filePath),
        fileType: getFileType(filePath),
        directory: dirname(filePath),
        chunks: [],
      });
    }

    groups.get(filePath)!.chunks.push({
      text: hit.text,
      chunkIndex: hit.chunkIndex,
    });
  }

  // Sort chunks within each group by chunk index and deduplicate
  for (const group of groups.values()) {
    group.chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

    // Remove duplicate chunks (same chunkIndex)
    const seen = new Set<number>();
    group.chunks = group.chunks.filter(chunk => {
      if (seen.has(chunk.chunkIndex)) return false;
      seen.add(chunk.chunkIndex);
      return true;
    });
  }

  // Return groups sorted by number of chunks (most relevant first)
  return Array.from(groups.values()).sort((a, b) => b.chunks.length - a.chunks.length);
}

/**
 * Extract a brief description from the first chunk of a file
 * Returns the first meaningful line or a truncated preview
 */
export function extractBriefDescription(chunks: Array<{ text: string; chunkIndex: number }>): string {
  if (chunks.length === 0) return "";

  const firstChunk = chunks[0].text.trim();
  const lines = firstChunk.split("\n").filter(line => line.trim());

  // Look for a comment or docstring as description
  for (const line of lines.slice(0, 5)) {
    const trimmed = line.trim();
    // Skip import statements and empty comments
    if (trimmed.startsWith("import ") || trimmed.startsWith("from ")) continue;
    if (trimmed === "//" || trimmed === "/*" || trimmed === "*" || trimmed === "*/") continue;
    if (trimmed === "#" || trimmed === '"""' || trimmed === "'''") continue;

    // Clean up comment markers
    let desc = trimmed
      .replace(/^\/\/\s*/, "")
      .replace(/^\/\*\*?\s*/, "")
      .replace(/^\*\s*/, "")
      .replace(/^#\s*/, "")
      .replace(/^["']{3}\s*/, "");

    if (desc.length > 10 && desc.length < 150) {
      return desc;
    }
  }

  // Fallback: first non-empty line, truncated
  const firstLine = lines[0] || "";
  if (firstLine.length > 80) {
    return firstLine.slice(0, 77) + "...";
  }
  return firstLine;
}

/**
 * Format grouped results as lightweight metadata for the AI
 * Shows file paths and brief descriptions, NOT full content
 */
export function formatAsStructuredContext(fileGroups: FileGroup[]): string {
  const lines: string[] = [];

  lines.push(`## Relevant Files Found\n`);
  lines.push(`The following ${fileGroups.length} files contain content related to your query:\n`);

  // Group files by directory for better organization
  const byDirectory = new Map<string, FileGroup[]>();
  for (const group of fileGroups) {
    const dir = group.directory || ".";
    if (!byDirectory.has(dir)) {
      byDirectory.set(dir, []);
    }
    byDirectory.get(dir)!.push(group);
  }

  // Format as a concise list with brief descriptions
  for (const [dir, groups] of byDirectory) {
    if (byDirectory.size > 1 && dir !== ".") {
      lines.push(`**${dir}/**`);
    }

    for (const group of groups) {
      const description = extractBriefDescription(group.chunks);
      const chunkInfo = group.chunks.length > 1 ? ` (${group.chunks.length} relevant sections)` : "";

      if (description) {
        lines.push(`- \`${group.filePath}\` - ${description}${chunkInfo}`);
      } else {
        lines.push(`- \`${group.filePath}\` (${group.fileType})${chunkInfo}`);
      }
    }
    lines.push(""); // Empty line between directories
  }

  return lines.join("\n");
}

// =============================================================================
// Prompt Builders
// =============================================================================

/**
 * Build the enhanced prompt with file pointers and research instructions
 * Lightweight format that guides the AI to use vectorSearch for details
 */
export function buildEnhancedPrompt(
  originalQuery: string,
  structuredContext: string
): string {
  const lines: string[] = [];

  lines.push(`# Research Request: ${originalQuery}\n`);
  lines.push(structuredContext);

  // Instruct AI to use vector search for detailed research
  lines.push(`## Research Instructions\n`);
  lines.push(`Use the **vectorSearch** tool to retrieve detailed content from the files listed above.`);
  lines.push(`The file list shows what's available - now dive deeper to answer the query.\n`);
  lines.push(`**Approach:**`);
  lines.push(`1. Use vectorSearch with targeted queries to retrieve specific content from relevant files`);
  lines.push(`2. Search for key concepts, functions, or terms related to the user's question`);
  lines.push(`3. Present findings with proper formatting and file path citations`);
  lines.push(`4. If the initial search doesn't cover everything, run additional searches`);

  return lines.join("\n");
}

/**
 * Build enhanced prompt V2 with content snippets included
 */
export function buildEnhancedPromptV2(
  originalQuery: string,
  filePointers: string,
  snippetContext: string,
  conceptMap: Record<string, string[]>
): string {
  const lines: string[] = [];

  lines.push(`# Research Request: ${originalQuery}\n`);

  // Show expanded concepts if any
  const concepts = Object.values(conceptMap).flat();
  if (concepts.length > 0) {
    const uniqueConcepts = [...new Set(concepts)].slice(0, 8);
    lines.push(`*Related concepts searched: ${uniqueConcepts.join(", ")}*\n`);
  }

  // Include file pointers (lightweight overview)
  lines.push(filePointers);

  // Include actual content snippets
  if (snippetContext) {
    lines.push(snippetContext);
  }

  // Instructions for the AI
  lines.push(`## Research Instructions\n`);
  lines.push(`The above snippets contain the most relevant content from the indexed files.`);
  lines.push(`Use this context to answer the user's question directly.\n`);
  lines.push(`**Guidelines:**`);
  lines.push(`1. Synthesize the information from the snippets into a coherent answer`);
  lines.push(`2. Reference specific files when citing information`);
  lines.push(`3. If the snippets don't fully answer the question, use **vectorSearch** for more details`);
  lines.push(`4. Use proper code formatting when showing code examples`);

  return lines.join("\n");
}
