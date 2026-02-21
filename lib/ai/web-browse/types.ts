/**
 * Web Browse Types
 *
 * Type definitions for the session-based web browsing system.
 */

// ============================================================================
// Session Content Types
// ============================================================================

export interface WebContentEntry {
  id: string;
  sessionId: string;
  url: string;
  title: string;
  content: string; // Full markdown content
  contentLength: number;
  fetchedAt: Date;
  expiresAt: Date;
  images?: string[]; // Extracted image URLs from the page
  ogImage?: string; // Open Graph image (hero/product image)
}

export interface WebBrowseSession {
  sessionId: string;
  entries: WebContentEntry[];
  lastFetchedUrls?: string[];
  lastFetchedAt?: Date;
  createdAt: Date;
  lastAccessedAt: Date;
}

// ============================================================================
// Tool Options and Results
// ============================================================================

export interface WebBrowseOptions {
  sessionId: string;
  userId: string;
  characterId?: string | null;
  sessionMetadata?: Record<string, unknown> | null;
}

export interface WebBrowseResult {
  status: "success" | "error" | "no_api_key" | "synthesizing";
  url: string;
  title?: string;
  synthesis?: string; // LLM-synthesized answer
  contentLength?: number;
  message?: string;
  cachedEntryId?: string;
}

// ============================================================================
// Event Types (for streaming progress)
// ============================================================================

export type WebBrowsePhase =
  | "idle"
  | "fetching"
  | "caching"
  | "synthesizing"
  | "complete"
  | "error";

export interface WebBrowseProgressEvent {
  type: "phase_change";
  phase: WebBrowsePhase;
  message: string;
  url?: string;
  timestamp: Date;
}

export interface WebBrowseContentEvent {
  type: "content_fetched";
  url: string;
  title: string;
  contentLength: number;
  timestamp: Date;
}

export interface WebBrowseSynthesisEvent {
  type: "synthesis_complete";
  synthesis: string;
  sourcesUsed: string[];
  timestamp: Date;
}

export interface WebBrowseErrorEvent {
  type: "error";
  error: string;
  timestamp: Date;
}

export type WebBrowseEvent =
  | WebBrowseProgressEvent
  | WebBrowseContentEvent
  | WebBrowseSynthesisEvent
  | WebBrowseErrorEvent;

export type WebBrowseEventEmitter = (event: WebBrowseEvent) => void;

// ============================================================================
// Synthesis Types
// ============================================================================

export interface SynthesisRequest {
  sessionId: string;
  query: string;
  urls?: string[]; // Optional: limit to specific URLs
  sessionMetadata?: Record<string, unknown> | null;
  abortSignal?: AbortSignal;
}

export interface SynthesisResult {
  success: boolean;
  synthesis: string;
  sourcesUsed: string[];
  tokenCount?: number;
  error?: string;
}

