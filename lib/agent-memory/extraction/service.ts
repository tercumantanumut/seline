/**
 * Memory Extraction Service
 *
 * Uses LLM to extract potential memories from conversation history.
 */

import { generateText } from "ai";
import { getUtilityModel } from "@/lib/ai/providers";
import { AgentMemoryManager } from "../memory-manager";
import { buildExtractionPrompt } from "./prompt";
import { calculateImportance, meetsThreshold, normalizeFactors } from "./importance";
import { loadSettings } from "@/lib/settings/settings-manager";
import type { MemoryEntry, MemoryCategory, ExtractedMemory } from "../types";

export interface ExtractionInput {
  characterId: string;
  sessionId: string;
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    createdAt: string;
  }>;
}

export interface ExtractionResult {
  extracted: MemoryEntry[];
  skipped: number;
  error?: string;
}

/**
 * Extract potential memories from a conversation
 */
export async function extractMemories(input: ExtractionInput): Promise<ExtractionResult> {
  const { characterId, sessionId, messages } = input;

  if (messages.length < 2) {
    return { extracted: [], skipped: 0 };
  }

  const manager = new AgentMemoryManager(characterId);

  try {
    // Build conversation context
    const conversationContext = messages
      .map((m) => `[${m.role.toUpperCase()}]: ${truncateContent(m.content)}`)
      .join("\n\n");

    // Get existing memories to avoid duplicates (both approved and pending)
    const existingMemories = await manager.loadApprovedMemories();
    const pendingMemories = await manager.loadPendingMemories();
    const allMemoriesForDedup = [...existingMemories, ...pendingMemories];
    const existingMemoriesContext = existingMemories.length > 0
      ? existingMemories.map((m) => `- [${m.category}] ${m.content}`).join("\n")
      : "";

    // Build the full prompt
    const prompt = buildExtractionPrompt(conversationContext, existingMemoriesContext);

    // Call the LLM
    console.log(`[Memory Extraction] Analyzing ${messages.length} messages for character ${characterId}`);

    const result = await generateText({
      model: getUtilityModel(),
      prompt,
      temperature: 0.3, // Lower temperature for more consistent extraction
      maxOutputTokens: 2000,
    });

    // Parse the response
    const extracted = parseExtractionResponse(result.text);

    if (extracted.length === 0) {
      console.log("[Memory Extraction] No memories extracted from conversation");
      await manager.markExtractionTime();
      return { extracted: [], skipped: 0 };
    }

    console.log(`[Memory Extraction] Found ${extracted.length} potential memories`);

    // Process each extracted memory
    const newMemories: MemoryEntry[] = [];
    let skipped = 0;
    const autoApprove = loadSettings().memoryAutoApprove === true;

    for (const memory of extracted) {
      // Normalize and validate factors
      const normalizedFactors = normalizeFactors(memory.factors);

      // Check importance threshold
      if (!meetsThreshold(normalizedFactors)) {
        console.log(`[Memory Extraction] Skipping memory (below threshold): ${memory.content.substring(0, 50)}...`);
        skipped++;
        continue;
      }

      // Check for duplicates (against both approved and pending memories)
      if (isDuplicate(memory.content, allMemoriesForDedup)) {
        console.log(`[Memory Extraction] Skipping duplicate: ${memory.content.substring(0, 50)}...`);
        skipped++;
        continue;
      }

      // Check for duplicates within this extraction batch
      if (isDuplicateInBatch(memory.content, newMemories)) {
        console.log(`[Memory Extraction] Skipping batch duplicate: ${memory.content.substring(0, 50)}...`);
        skipped++;
        continue;
      }

      // Add memory — auto-approve if setting is enabled
      const memoryStatus = autoApprove ? "approved" : "pending";
      const entry = await manager.addMemory({
        category: memory.category,
        content: memory.content,
        reasoning: memory.reasoning,
        confidence: Math.max(0, Math.min(1, memory.confidence)),
        importance: calculateImportance(normalizedFactors),
        factors: normalizedFactors,
        status: memoryStatus,
        source: "auto",
        sessionId,
        messageIds: messages.map((m) => m.id),
      });

      newMemories.push(entry);
      console.log(`[Memory Extraction] Added ${memoryStatus} memory: ${entry.content.substring(0, 50)}...`);
    }

    await manager.markExtractionTime();

    return {
      extracted: newMemories,
      skipped,
    };
  } catch (error) {
    console.error("[Memory Extraction] Error:", error);
    return {
      extracted: [],
      skipped: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Parse the LLM response to extract memories
 */
function parseExtractionResponse(text: string): ExtractedMemory[] {
  try {
    // Try to find JSON array in the response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.log("[Memory Extraction] No JSON array found in response");
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (!Array.isArray(parsed)) {
      console.log("[Memory Extraction] Parsed result is not an array");
      return [];
    }

    // Validate and filter entries
    const validMemories: ExtractedMemory[] = [];

    for (const item of parsed) {
      if (isValidExtractedMemory(item)) {
        validMemories.push(item);
      } else {
        console.log("[Memory Extraction] Skipping invalid memory entry:", item);
      }
    }

    return validMemories;
  } catch (error) {
    console.error("[Memory Extraction] Failed to parse response:", error);
    return [];
  }
}

/**
 * Check if an item is a valid extracted memory
 */
function isValidExtractedMemory(item: unknown): item is ExtractedMemory {
  if (typeof item !== "object" || item === null) return false;

  const obj = item as Record<string, unknown>;

  // Required fields
  if (typeof obj.category !== "string") return false;
  if (typeof obj.content !== "string") return false;
  if (typeof obj.reasoning !== "string") return false;
  if (typeof obj.confidence !== "number") return false;
  if (typeof obj.factors !== "object" || obj.factors === null) return false;

  // Validate category
  const validCategories: MemoryCategory[] = [
    "visual_preferences",
    "communication_style",
    "workflow_patterns",
    "domain_knowledge",
    "business_rules",
  ];
  if (!validCategories.includes(obj.category as MemoryCategory)) return false;

  // Validate factors object has required fields
  const factors = obj.factors as Record<string, unknown>;
  const requiredFactors = ["repetition", "impact", "specificity", "recency", "conflictResolution"];
  for (const factor of requiredFactors) {
    if (typeof factors[factor] !== "number") return false;
  }

  return true;
}

/**
 * Check if a memory is a duplicate of an existing one
 * Uses simple string similarity
 */
function isDuplicate(content: string, existingMemories: MemoryEntry[]): boolean {
  const normalizedContent = normalizeString(content);

  for (const existing of existingMemories) {
    const normalizedExisting = normalizeString(existing.content);

    // Check for high similarity
    if (stringSimilarity(normalizedContent, normalizedExisting) > 0.8) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a memory is a duplicate within the current extraction batch
 */
function isDuplicateInBatch(content: string, batchMemories: MemoryEntry[]): boolean {
  const normalizedContent = normalizeString(content);

  for (const existing of batchMemories) {
    const normalizedExisting = normalizeString(existing.content);

    // Check for high similarity
    if (stringSimilarity(normalizedContent, normalizedExisting) > 0.8) {
      return true;
    }
  }

  return false;
}

/**
 * Normalize a string for comparison
 */
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Calculate simple string similarity (Jaccard index on words)
 */
function stringSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.split(" "));
  const wordsB = new Set(b.split(" "));

  const intersection = new Set([...wordsA].filter((x) => wordsB.has(x)));
  const union = new Set([...wordsA, ...wordsB]);

  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

/**
 * Truncate content to reasonable length for extraction
 */
function truncateContent(content: string, maxLength: number = 2000): string {
  if (content.length <= maxLength) return content;
  return content.substring(0, maxLength) + "... [truncated]";
}
