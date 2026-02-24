/**
 * Agent Memory Manager
 *
 * Manages file-based storage for agent memories.
 * Storage structure per agent:
 * - memory.md: Human-readable memory document (injected into prompts)
 * - memory-log.jsonl: Append-only event log for audit trail
 * - memory-metadata.json: Stats and version info
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "fs";
import { join } from "path";
import { nanoid } from "nanoid";
import type {
  MemoryEntry,
  MemoryMetadata,
  MemoryLogEvent,
  MemoryLogEventType,
  MemoryCategory,
  MemoryStatus,
  CreateMemoryInput,
  UpdateMemoryInput,
  MEMORY_CATEGORIES,
} from "./types";

const METADATA_VERSION = 1;

export class AgentMemoryManager {
  private characterId: string;
  private basePath: string;
  private memoryFilePath: string;
  private logFilePath: string;
  private metadataFilePath: string;
  private memoriesFilePath: string; // JSON file storing all memories

  constructor(characterId: string) {
    this.characterId = characterId;
    this.basePath = this.getAgentDataPath(characterId);
    this.memoryFilePath = join(this.basePath, "memory.md");
    this.logFilePath = join(this.basePath, "memory-log.jsonl");
    this.metadataFilePath = join(this.basePath, "memory-metadata.json");
    this.memoriesFilePath = join(this.basePath, "memories.json");
    this.ensureDirectoryExists();
  }

  private getAgentDataPath(characterId: string): string {
    const basePath = process.env.LOCAL_DATA_PATH || join(process.cwd(), ".local-data");
    return join(basePath, "agents", characterId);
  }

  private ensureDirectoryExists(): void {
    if (!existsSync(this.basePath)) {
      mkdirSync(this.basePath, { recursive: true });
    }
  }

  // ============================================================================
  // MEMORY CRUD OPERATIONS
  // ============================================================================

  /**
   * Load all memories from storage
   */
  async loadAllMemories(): Promise<MemoryEntry[]> {
    if (!existsSync(this.memoriesFilePath)) {
      return [];
    }

    try {
      const data = readFileSync(this.memoriesFilePath, "utf-8");
      return JSON.parse(data) as MemoryEntry[];
    } catch (error) {
      console.error("[MemoryManager] Error loading memories:", error);
      return [];
    }
  }

  /**
   * Load only approved memories
   */
  async loadApprovedMemories(): Promise<MemoryEntry[]> {
    const memories = await this.loadAllMemories();
    return memories.filter((m) => m.status === "approved");
  }

  /**
   * Load only pending memories (awaiting approval)
   */
  async loadPendingMemories(): Promise<MemoryEntry[]> {
    const memories = await this.loadAllMemories();
    return memories.filter((m) => m.status === "pending");
  }

  /**
   * Get a single memory by ID
   */
  async getMemory(id: string): Promise<MemoryEntry | null> {
    const memories = await this.loadAllMemories();
    return memories.find((m) => m.id === id) || null;
  }

  /**
   * Add a new memory
   */
  async addMemory(input: CreateMemoryInput): Promise<MemoryEntry> {
    const now = new Date().toISOString();
    const id = nanoid();

    const memory: MemoryEntry = {
      id,
      category: input.category,
      content: input.content,
      reasoning: input.reasoning || "",
      confidence: input.confidence ?? 1.0,
      importance: input.importance ?? 1.0,
      factors: input.factors ?? {
        repetition: 1.0,
        impact: 1.0,
        specificity: 1.0,
        recency: 1.0,
        conflictResolution: 0,
      },
      status: input.status ?? "pending",
      source: input.source,
      createdAt: now,
      updatedAt: now,
      sessionId: input.sessionId,
      messageIds: input.messageIds,
    };

    // If status is approved, set approvedAt
    if (memory.status === "approved") {
      memory.approvedAt = now;
    }

    // Load existing memories, add new one, save
    const memories = await this.loadAllMemories();
    memories.push(memory);
    await this.saveMemories(memories);

    // Log the event
    const eventType: MemoryLogEventType = input.source === "manual" ? "manual_added" : "extracted";
    this.logEvent({
      type: eventType,
      memoryId: id,
      data: { category: input.category, content: input.content },
    });

    // Update metadata
    await this.updateMetadata();

    // Regenerate memory.md if memory is approved
    if (memory.status === "approved") {
      await this.regenerateMemoryMarkdown();
    }

    return memory;
  }

  /**
   * Update an existing memory
   */
  async updateMemory(id: string, updates: UpdateMemoryInput): Promise<MemoryEntry | null> {
    const memories = await this.loadAllMemories();
    const index = memories.findIndex((m) => m.id === id);

    if (index === -1) {
      return null;
    }

    const now = new Date().toISOString();
    const memory = memories[index];

    // Apply updates
    if (updates.category !== undefined) memory.category = updates.category;
    if (updates.content !== undefined) memory.content = updates.content;
    if (updates.reasoning !== undefined) memory.reasoning = updates.reasoning;
    if (updates.status !== undefined) {
      memory.status = updates.status;
      if (updates.status === "approved") {
        memory.approvedAt = now;
      } else if (updates.status === "rejected") {
        memory.rejectedAt = now;
      }
    }
    memory.updatedAt = now;

    memories[index] = memory;
    await this.saveMemories(memories);

    // Log the event
    this.logEvent({
      type: "edited",
      memoryId: id,
      data: updates as unknown as Record<string, unknown>,
    });

    // Update metadata and regenerate markdown
    await this.updateMetadata();
    await this.regenerateMemoryMarkdown();

    return memory;
  }

  /**
   * Approve a pending memory
   */
  async approveMemory(id: string, edits?: Partial<UpdateMemoryInput>): Promise<MemoryEntry | null> {
    const memories = await this.loadAllMemories();
    const index = memories.findIndex((m) => m.id === id);

    if (index === -1) {
      return null;
    }

    const now = new Date().toISOString();
    const memory = memories[index];

    // Apply any edits
    if (edits?.category !== undefined) memory.category = edits.category;
    if (edits?.content !== undefined) memory.content = edits.content;

    memory.status = "approved";
    memory.approvedAt = now;
    memory.updatedAt = now;

    memories[index] = memory;
    await this.saveMemories(memories);

    // Log the event
    this.logEvent({
      type: "approved",
      memoryId: id,
      data: edits || {},
    });

    // Update metadata and regenerate markdown
    await this.updateMetadata();
    await this.regenerateMemoryMarkdown();

    return memory;
  }

  /**
   * Reject a pending memory
   */
  async rejectMemory(id: string): Promise<boolean> {
    const memories = await this.loadAllMemories();
    const index = memories.findIndex((m) => m.id === id);

    if (index === -1) {
      return false;
    }

    const now = new Date().toISOString();
    const memory = memories[index];

    memory.status = "rejected";
    memory.rejectedAt = now;
    memory.updatedAt = now;

    memories[index] = memory;
    await this.saveMemories(memories);

    // Log the event
    this.logEvent({
      type: "rejected",
      memoryId: id,
      data: {},
    });

    // Update metadata
    await this.updateMetadata();

    return true;
  }

  /**
   * Delete a memory permanently
   */
  async deleteMemory(id: string): Promise<boolean> {
    const memories = await this.loadAllMemories();
    const index = memories.findIndex((m) => m.id === id);

    if (index === -1) {
      return false;
    }

    const deletedMemory = memories[index];
    memories.splice(index, 1);
    await this.saveMemories(memories);

    // Log the event
    this.logEvent({
      type: "deleted",
      memoryId: id,
      data: { category: deletedMemory.category, content: deletedMemory.content },
    });

    // Update metadata and regenerate markdown
    await this.updateMetadata();
    await this.regenerateMemoryMarkdown();

    return true;
  }

  // ============================================================================
  // MARKDOWN GENERATION (for prompt injection)
  // ============================================================================

  /**
   * Format approved memories as markdown for system prompt injection
   */
  formatForPrompt(): string {
    const memoriesData = this.loadAllMemoriesSync();
    const approvedMemories = memoriesData.filter((m) => m.status === "approved");

    if (approvedMemories.length === 0) {
      return "";
    }

    // Group by category
    const byCategory: Record<MemoryCategory, MemoryEntry[]> = {
      visual_preferences: [],
      communication_style: [],
      workflow_patterns: [],
      domain_knowledge: [],
      business_rules: [],
    };

    for (const memory of approvedMemories) {
      if (byCategory[memory.category]) {
        byCategory[memory.category].push(memory);
      }
    }

    // Build markdown
    const sections: string[] = ["## Agent Memory\n"];
    const categoryLabels: Record<MemoryCategory, string> = {
      visual_preferences: "Visual/Creative Preferences",
      communication_style: "Communication Style",
      workflow_patterns: "Workflow Patterns",
      domain_knowledge: "Domain Knowledge",
      business_rules: "Business Rules",
    };

    for (const [category, memories] of Object.entries(byCategory) as [MemoryCategory, MemoryEntry[]][]) {
      if (memories.length === 0) continue;

      sections.push(`### ${categoryLabels[category]}`);
      for (const memory of memories) {
        sections.push(`- ${memory.content}`);
      }
      sections.push(""); // Empty line between categories
    }

    return sections.join("\n").trim();
  }

  /**
   * Synchronous version for use in prompt building
   */
  private loadAllMemoriesSync(): MemoryEntry[] {
    if (!existsSync(this.memoriesFilePath)) {
      return [];
    }

    try {
      const data = readFileSync(this.memoriesFilePath, "utf-8");
      return JSON.parse(data) as MemoryEntry[];
    } catch (error) {
      console.error("[MemoryManager] Error loading memories sync:", error);
      return [];
    }
  }

  /**
   * Regenerate the memory.md file from approved memories
   */
  private async regenerateMemoryMarkdown(): Promise<void> {
    const markdown = this.formatForPrompt();

    if (markdown) {
      writeFileSync(this.memoryFilePath, markdown, "utf-8");
    } else if (existsSync(this.memoryFilePath)) {
      // Remove file if no approved memories
      writeFileSync(this.memoryFilePath, "", "utf-8");
    }
  }

  // ============================================================================
  // STORAGE HELPERS
  // ============================================================================

  /**
   * Save all memories to storage
   */
  private async saveMemories(memories: MemoryEntry[]): Promise<void> {
    writeFileSync(this.memoriesFilePath, JSON.stringify(memories, null, 2), "utf-8");
  }

  /**
   * Log an event to the append-only log
   */
  private logEvent(event: Omit<MemoryLogEvent, "id" | "timestamp">): void {
    const fullEvent: MemoryLogEvent = {
      id: nanoid(),
      timestamp: new Date().toISOString(),
      ...event,
    };

    const line = JSON.stringify(fullEvent) + "\n";
    appendFileSync(this.logFilePath, line, "utf-8");
  }

  // ============================================================================
  // METADATA
  // ============================================================================

  /**
   * Get current metadata
   */
  async getMetadata(): Promise<MemoryMetadata> {
    if (existsSync(this.metadataFilePath)) {
      try {
        const data = readFileSync(this.metadataFilePath, "utf-8");
        return JSON.parse(data) as MemoryMetadata;
      } catch (error) {
        console.error("[MemoryManager] Error loading metadata:", error);
      }
    }

    // Return default metadata
    return this.createDefaultMetadata();
  }

  /**
   * Update metadata based on current memories
   */
  private async updateMetadata(): Promise<void> {
    const memories = await this.loadAllMemories();
    const now = new Date().toISOString();

    // Calculate stats
    const categoryStats: Record<MemoryCategory, number> = {
      visual_preferences: 0,
      communication_style: 0,
      workflow_patterns: 0,
      domain_knowledge: 0,
      business_rules: 0,
    };

    let pendingCount = 0;
    let approvedCount = 0;
    let rejectedCount = 0;

    for (const memory of memories) {
      if (memory.status === "approved") {
        categoryStats[memory.category]++;
        approvedCount++;
      } else if (memory.status === "pending") {
        pendingCount++;
      } else if (memory.status === "rejected") {
        rejectedCount++;
      }
    }

    // Load existing metadata for timestamps
    const existingMetadata = await this.getMetadata();

    const metadata: MemoryMetadata = {
      version: METADATA_VERSION,
      characterId: this.characterId,
      totalMemories: memories.length,
      pendingCount,
      approvedCount,
      rejectedCount,
      categoryStats,
      lastExtractionAt: existingMetadata.lastExtractionAt,
      lastApprovalAt: approvedCount > existingMetadata.approvedCount ? now : existingMetadata.lastApprovalAt,
      createdAt: existingMetadata.createdAt || now,
      updatedAt: now,
    };

    writeFileSync(this.metadataFilePath, JSON.stringify(metadata, null, 2), "utf-8");
  }

  /**
   * Mark extraction timestamp
   */
  async markExtractionTime(): Promise<void> {
    const metadata = await this.getMetadata();
    metadata.lastExtractionAt = new Date().toISOString();
    metadata.updatedAt = new Date().toISOString();
    writeFileSync(this.metadataFilePath, JSON.stringify(metadata, null, 2), "utf-8");
  }

  /**
   * Create default metadata object
   */
  private createDefaultMetadata(): MemoryMetadata {
    const now = new Date().toISOString();
    return {
      version: METADATA_VERSION,
      characterId: this.characterId,
      totalMemories: 0,
      pendingCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      categoryStats: {
        visual_preferences: 0,
        communication_style: 0,
        workflow_patterns: 0,
        domain_knowledge: 0,
        business_rules: 0,
      },
      createdAt: now,
      updatedAt: now,
    };
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Check if memories directory exists for this agent
   */
  hasMemoryData(): boolean {
    return existsSync(this.memoriesFilePath);
  }

  /**
   * Get the base path for this agent's memory data
   */
  getBasePath(): string {
    return this.basePath;
  }
}
