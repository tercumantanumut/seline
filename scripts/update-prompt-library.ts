import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { execFileSync } from "child_process";

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

interface DiffSummary {
  existingCount: number;
  remoteCount: number;
  added: number;
  removed: number;
  changed: number;
}

function parseArgs(argv: string[]) {
  return {
    dryRun: argv.includes("--dry-run"),
  };
}

function runGit(args: string[], cwd?: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function normalizePromptEntry(raw: unknown): PromptEntry {
  const entry = raw as Record<string, unknown>;
  const images = Array.isArray(entry.images)
    ? entry.images.filter((item): item is string => typeof item === "string")
    : [];

  return {
    rank: Number(entry.rank ?? 0),
    id: String(entry.id ?? ""),
    prompt: String(entry.prompt ?? ""),
    author: String(entry.author ?? ""),
    author_name: String(entry.author_name ?? ""),
    likes: Number(entry.likes ?? 0),
    views: Number(entry.views ?? 0),
    image: String(entry.image ?? ""),
    images,
    model: String(entry.model ?? ""),
    categories: Array.isArray(entry.categories)
      ? entry.categories.filter((item): item is string => typeof item === "string")
      : [],
    date: String(entry.date ?? ""),
    source_url: String(entry.source_url ?? ""),
  };
}

function validatePromptEntry(entry: PromptEntry): void {
  if (!entry.id || !entry.prompt) {
    throw new Error(`Invalid prompt entry detected: missing required id/prompt (id=${entry.id || "<empty>"})`);
  }
}

function normalizeAndValidatePrompts(entries: unknown[]): PromptEntry[] {
  return entries.map((raw) => {
    const normalized = normalizePromptEntry(raw);
    validatePromptEntry(normalized);
    return normalized;
  });
}

function sortPromptsByRank(prompts: PromptEntry[]): PromptEntry[] {
  return [...prompts].sort((a, b) => a.rank - b.rank);
}

function loadPrompts(filePath: string): PromptEntry[] {
  const raw = readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`Prompt source is not an array: ${filePath}`);
  }

  const normalized = normalizeAndValidatePrompts(parsed);
  if (normalized.length === 0) {
    throw new Error(`Prompt list is empty: ${filePath}`);
  }
  return sortPromptsByRank(normalized);
}

function promptFingerprint(entry: PromptEntry): string {
  return JSON.stringify({
    id: entry.id,
    rank: entry.rank,
    prompt: entry.prompt,
    author: entry.author,
    author_name: entry.author_name,
    likes: entry.likes,
    views: entry.views,
    image: entry.image,
    images: entry.images,
    model: entry.model,
    categories: entry.categories,
    date: entry.date,
    source_url: entry.source_url,
  });
}

function buildDiff(existing: PromptEntry[], remote: PromptEntry[]): DiffSummary {
  const existingMap = new Map(existing.map((item) => [item.id, item]));
  const remoteMap = new Map(remote.map((item) => [item.id, item]));

  let added = 0;
  let removed = 0;
  let changed = 0;

  for (const [id, remoteEntry] of remoteMap.entries()) {
    const existingEntry = existingMap.get(id);
    if (!existingEntry) {
      added += 1;
      continue;
    }

    if (promptFingerprint(existingEntry) !== promptFingerprint(remoteEntry)) {
      changed += 1;
    }
  }

  for (const id of existingMap.keys()) {
    if (!remoteMap.has(id)) {
      removed += 1;
    }
  }

  return {
    existingCount: existing.length,
    remoteCount: remote.length,
    added,
    removed,
    changed,
  };
}

function summarizeByCategory(prompts: PromptEntry[]): string {
  const counts = new Map<string, number>();
  for (const prompt of prompts) {
    for (const category of prompt.categories) {
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => `${name}: ${count}`)
    .join(", ");
}

function printSummary(diff: DiffSummary, categorySummary: string): void {
  process.stdout.write("[prompt-library] Diff summary\n");
  process.stdout.write(`- existingCount: ${diff.existingCount}\n`);
  process.stdout.write(`- remoteCount: ${diff.remoteCount}\n`);
  process.stdout.write(`- added: ${diff.added}\n`);
  process.stdout.write(`- removed: ${diff.removed}\n`);
  process.stdout.write(`- changed: ${diff.changed}\n`);
  process.stdout.write(`- topCategories: ${categorySummary || "none"}\n`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const destinationPath = path.join(repoRoot, "data", "prompt-library", "prompts.json");

  if (!existsSync(destinationPath)) {
    throw new Error(`Destination file does not exist: ${destinationPath}`);
  }

  const tempDir = mkdtempSync(path.join(tmpdir(), "nanobanana-update-"));
  const cloneDir = path.join(tempDir, "nanobanana-trending-prompts");

  try {
    process.stdout.write("[prompt-library] Cloning source repository...\n");
    runGit([
      "clone",
      "--depth",
      "1",
      "https://github.com/jau123/nanobanana-trending-prompts",
      cloneDir,
    ]);

    const remotePath = path.join(cloneDir, "prompts", "prompts.json");
    const existingPrompts = loadPrompts(destinationPath);
    const remotePrompts = loadPrompts(remotePath);
    const diff = buildDiff(existingPrompts, remotePrompts);
    const categorySummary = summarizeByCategory(remotePrompts);

    printSummary(diff, categorySummary);

    if (args.dryRun) {
      process.stdout.write("[prompt-library] Dry run enabled, no files changed.\n");
      return;
    }

    writeFileSync(destinationPath, `${JSON.stringify(remotePrompts, null, 2)}\n`, "utf-8");
    process.stdout.write(`[prompt-library] Updated ${destinationPath}\n`);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

main();
