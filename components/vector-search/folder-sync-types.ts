export type IndexingMode = "auto" | "full" | "files-only";
export type SyncMode = "auto" | "manual" | "scheduled" | "triggered";
export type ChunkPreset = "balanced" | "small" | "large" | "custom";
export type ReindexPolicy = "smart" | "always" | "never";

export interface SyncFolder {
  id: string;
  folderPath: string;
  displayName: string | null;
  recursive: boolean;
  includeExtensions: string | string[];
  excludePatterns: string | string[];
  fileTypeFilters?: string | string[];
  status: "pending" | "syncing" | "synced" | "error" | "paused";
  lastSyncedAt: string | null;
  lastError: string | null;
  fileCount: number | null;
  chunkCount: number | null;
  skippedCount?: number | null;
  skipReasons?: Record<string, number> | string | null;
  lastRunMetadata?: Record<string, unknown> | string | null;
  lastRunTrigger?: "manual" | "scheduled" | "triggered" | "auto" | null;
  embeddingModel: string | null;
  indexingMode: "files-only" | "full" | "auto";
  syncMode?: SyncMode;
  syncCadenceMinutes?: number;
  maxFileSizeBytes?: number;
  chunkPreset?: ChunkPreset;
  chunkSizeOverride?: number | null;
  chunkOverlapOverride?: number | null;
  reindexPolicy?: ReindexPolicy;
  isPrimary: boolean;
  inheritedFromWorkflowId?: string | null;
  inheritedFromAgentId?: string | null;
}

export interface FolderAnalysis {
  folderPath: string;
  folderName: string;
  detectedPatterns: string[];
  mergedPatterns: string[];
  fileCountPreview: number;
  fileCountLimited: boolean;
  maxFileLines?: number;
  largeFileCount?: number;
  largeFileExamples?: string[];
  exists: boolean;
}

export interface FolderSyncManagerProps {
  characterId: string;
  className?: string;
  compact?: boolean;
}

export const RECOMMENDED_EXCLUDES = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "__pycache__",
  ".venv",
  "venv",
  "coverage",
  ".local-data",
  "dist-electron",
  "comfyui_backend",
  ".vscode",
  ".idea",
  "tmp",
  "temp",
  ".DS_Store",
  "Thumbs.db",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "*.tsbuildinfo",
  "*.log",
  "*.lock",
  "**/node_modules/**",
  "**/.git/**",
  "**/.next/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "**/.local-data/**",
  "**/dist-electron/**",
  "**/comfyui_backend/**",
  "**/.vscode/**",
  "**/.idea/**",
  "**/tmp/**",
  "**/temp/**",
];

export const DEFAULT_EXTENSIONS = [
  // Documents
  ".pdf", ".doc", ".docx", ".odt", ".rtf",
  // Spreadsheets
  ".xls", ".xlsx", ".ods", ".csv",
  // Presentations
  ".ppt", ".pptx", ".odp",
  // Text/Markup
  ".txt", ".md", ".markdown", ".rst", ".tex",
  // Code
  ".js", ".jsx", ".ts", ".tsx", ".py", ".java", ".cpp", ".c", ".h", ".go", ".rs", ".rb", ".php",
  // Web
  ".html", ".htm", ".css", ".xml", ".json", ".yaml", ".yml",
  // Other
  ".log", ".sql", ".sh", ".bat",
].join(",");

export const DEFAULT_EXCLUDE_PATTERNS =
  "node_modules,.git,dist,build,.next,__pycache__,.venv,venv,package-lock.json,pnpm-lock.yaml,yarn.lock";
