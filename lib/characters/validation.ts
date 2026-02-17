import { z } from "zod";

// ============================================================================
// ENUM SCHEMAS
// ============================================================================

export const characterStatusSchema = z.enum(["draft", "active", "archived"]);

export const characterImageTypeSchema = z.enum([
  "portrait", "full_body", "expression", "outfit", "scene", "avatar"
]);

// ============================================================================
// BASE CHARACTER SCHEMA
// ============================================================================

export const createCharacterSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  displayName: z.string().max(100).optional(),
  tagline: z.string().max(200).optional(),
  isDefault: z.boolean().optional().default(false),
});

export const updateCharacterSchema = createCharacterSchema.partial().extend({
  status: characterStatusSchema.optional(),
});

// ============================================================================
// CHARACTER IMAGE SCHEMA
// ============================================================================

export const characterImageSchema = z.object({
  imageType: characterImageTypeSchema,
  isPrimary: z.boolean().optional().default(false),
  s3Key: z.string().min(1),
  url: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  format: z.string().max(20).optional(),
  prompt: z.string().max(2000).optional(),
  seed: z.number().optional(),
  generationModel: z.string().max(50).optional(),
  sortOrder: z.number().int().optional().default(0),
  metadata: z.record(z.unknown()).optional().default({}),
});

// ============================================================================
// AGENT METADATA SCHEMA (B2B Agent Configuration)
// ============================================================================

/**
 * Agent metadata for B2B agent configuration.
 * Stored in characters.metadata JSON column.
 */
export const agentMetadataSchema = z.object({
  /** List of enabled tool names for this agent */
  enabledTools: z.array(z.string()).optional(),
  /** Optional cache/fallback list of enabled plugin IDs for this agent */
  enabledPlugins: z.array(z.string()).optional(),
  /** Agent's purpose/responsibilities description */
  purpose: z.string().max(2000).optional(),
  /** Custom system prompt override (replaces auto-generated prompt if provided) */
  systemPromptOverride: z.string().max(10000).optional(),

  /**
   * Per-agent MCP configuration
   * Can override or extend global MCP servers
   */
  mcpServers: z.object({
    mcpServers: z.record(z.object({
      type: z.enum(["http", "sse", "stdio"]).optional(),
      url: z.string().optional(),
      command: z.string().optional(),
      args: z.array(z.string()).optional(),
      env: z.record(z.string()).optional(),
      headers: z.record(z.string()).optional(),
      timeout: z.number().optional(),
    })),
  }).optional(),

  /**
   * Which MCP servers are enabled for this agent
   * If not specified, all configured servers are enabled
   */
  enabledMcpServers: z.array(z.string()).optional(),

  /**
   * Which MCP tools are enabled for this agent
   * Format: "serverName:toolName"
   * If not specified, all tools from enabled servers are available
   */
  enabledMcpTools: z.array(z.string()).optional(),

  /**
   * Per-MCP-tool preferences for loading behavior
   * Key format: "serverName:toolName"
   */
  mcpToolPreferences: z.record(
    z.string(),  // Key: "serverName:toolName"
    z.object({
      /** Whether this specific tool is enabled (overrides server-level enablement) */
      enabled: z.boolean().default(true),
      /** Loading mode: "always" loads immediately, "deferred" requires discovery */
      loadingMode: z.enum(["always", "deferred"]).default("deferred"),
    })
  ).optional(),

  /**
   * Whether task scheduling is enabled for this agent
   * When enabled, the agent can use the scheduleTask tool
   */
  schedulingEnabled: z.boolean().optional().default(false),

  /**
   * Scheduling preferences for this agent
   */
  schedulingPreferences: z.object({
    /** Tool loading mode: "always" includes scheduleTask in initial context, "deferred" requires discovery */
    loadingMode: z.enum(["always", "deferred"]).default("deferred"),
    /** Maximum concurrent scheduled tasks for this agent */
    maxConcurrent: z.number().min(1).max(10).default(1),
    /** Default timezone for scheduled tasks */
    defaultTimezone: z.string().default("UTC"),
  }).optional(),
});

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type CreateCharacterInput = z.infer<typeof createCharacterSchema>;
export type UpdateCharacterInput = z.infer<typeof updateCharacterSchema>;
export type CharacterImageInput = z.infer<typeof characterImageSchema>;
export type AgentMetadata = z.infer<typeof agentMetadataSchema>;
