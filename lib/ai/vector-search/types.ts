/**
 * Vector Search Types
 *
 * Type definitions for the LLM-powered vector search system.
 * Follows the web-browse pattern for session-based operation.
 */

// ============================================================================
// Search Strategy Types
// ============================================================================

/**
 * Search strategy determined by the secondary LLM
 */
export type SearchStrategy =
  | "semantic"      // Embedding similarity search
  | "keyword"       // Exact/fuzzy keyword match
  | "hybrid"        // Combined semantic + keyword
  | "contextual"    // Based on recent conversation context
  | "exploratory";  // Broad discovery mode

// ============================================================================
// Session Types
// ============================================================================

export interface SearchHistoryEntry {
  query: string;
  strategy: SearchStrategy;
  resultsCount: number;
  timestamp: Date;
}

export interface VectorSearchSession {
  id: string;
  sessionKey: string;
  characterId?: string | null;
  searchHistory: SearchHistoryEntry[];
  createdAt: Date;
  lastUsedAt: Date;
}

// ============================================================================
// Tool Options and Results
// ============================================================================

export interface VectorSearchOptions {
  sessionId: string;
  userId: string;
  characterId?: string | null;
  sessionMetadata?: Record<string, unknown> | null;
}

export interface SearchFinding {
  filePath: string;
  lineRange?: string;
  snippet: string;
  explanation: string;
  confidence: number;
  chunkIndex?: number;
}

export interface VectorSearchResult {
  status: "success" | "error" | "no_results" | "disabled" | "no_agent";
  strategy: SearchStrategy;
  reasoning: string;
  findings: SearchFinding[];
  summary: string;
  suggestedRefinements?: string[];
  /** Summary statistics */
  stats?: {
    totalChunks: number;
    totalFiles: number;
    fileTypes: string[];
  };
  error?: string;
  message?: string;
}

// ============================================================================
// Event Types (for streaming progress)
// ============================================================================

export type VectorSearchPhase =
  | "idle"
  | "analyzing"     // LLM analyzing the query
  | "searching"     // Executing vector search
  | "synthesizing"  // LLM synthesizing results
  | "complete"
  | "error";

export interface VectorSearchProgressEvent {
  type: "phase_change";
  phase: VectorSearchPhase;
  message: string;
  timestamp: Date;
}

export interface VectorSearchResultEvent {
  type: "search_complete";
  resultsCount: number;
  filesCount: number;
  timestamp: Date;
}

export interface VectorSearchSynthesisEvent {
  type: "synthesis_complete";
  summary: string;
  findingsCount: number;
  timestamp: Date;
}

export interface VectorSearchErrorEvent {
  type: "error";
  error: string;
  timestamp: Date;
}

export type VectorSearchEvent =
  | VectorSearchProgressEvent
  | VectorSearchResultEvent
  | VectorSearchSynthesisEvent
  | VectorSearchErrorEvent;

export type VectorSearchEventEmitter = (event: VectorSearchEvent) => void;

// ============================================================================
// Synthesis Types
// ============================================================================

export interface SynthesisRequest {
  sessionId: string;
  characterId: string;
  query: string;
  rawResults: RawSearchResult[];
  searchHistory: SearchHistoryEntry[];
  /** Session metadata for utility model/provider resolution */
  sessionMetadata?: Record<string, unknown> | null;
  /** Allowed folder paths for the readFile tool (synced folders) */
  allowedFolderPaths: string[];
  /** Optional file tree summary to help the LLM understand workspace structure */
  fileTreeSummary?: string | null;
}

export interface RawSearchResult {
  text: string;
  relativePath: string;
  chunkIndex: number;
  score: number;
  startLine?: number;
  endLine?: number;
}

export interface SynthesisResult {
  success: boolean;
  strategy: SearchStrategy;
  reasoning: string;
  findings: SearchFinding[];
  summary: string;
  suggestedRefinements?: string[];
  error?: string;
}
