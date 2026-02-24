/**
 * Seline Platform MCP Server for Claude Agent SDK
 *
 * Creates an in-process MCP server (via createSdkMcpServer) that bridges
 * Seline's ToolRegistry and per-agent MCP servers to the Claude Agent SDK.
 *
 * This lets the SDK agent see and call all Seline platform tools (vectorSearch,
 * memorize, runSkill, scheduleTask, etc.) and any MCP server tools configured
 * for the active agent — not just Claude Code's built-in tools.
 *
 * Tool exposure rules:
 *  - Built-in ToolRegistry tools: exposed if env-enabled + passes enabledTools filter
 *  - alwaysLoad utility tools (searchTools, listAllTools): always exposed
 *  - MCP tools: exposed as registered by loadMCPToolsForCharacter() (already filtered
 *    by per-agent enabledMcpServers / enabledMcpTools / mcpToolPreferences)
 */

import {
  createSdkMcpServer,
  type McpSdkServerConfigWithInstance,
  type SdkMcpToolDefinition,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { ToolRegistry } from "@/lib/ai/tool-registry/registry";
import { MCPClientManager } from "@/lib/mcp/client-manager";
import { getMCPToolId } from "@/lib/ai/tool-registry/mcp-tool-adapter";
import type { SelineMcpContext } from "./mcp-context-store";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract a Zod raw shape from a Vercel AI SDK Tool's inputSchema.
 *
 * Vercel AI SDK v6 has two schema styles:
 *
 *   1. `z.object(...)` — a ZodObject with `.shape: Record<string, ZodTypeAny>`.
 *      Used by most non-file tools.
 *
 *   2. `jsonSchema(...)` — a `Schema<T>` wrapper with `.jsonSchema: JSONSchema7`.
 *      Used by file tools (writeFile, editFile, readFile, etc.) and MCP adapters.
 *      When this is present we convert the JSON Schema to a Zod shape so the SDK
 *      MCP server can correctly parse and forward all parameters to the handler.
 *
 * If neither form is recognised the tool gets an empty shape ({}), which means
 * the SDK still calls it but strips all parameters — handled gracefully by each
 * tool's own error path.
 */
function zodShapeFromInputSchema(inputSchema: unknown): Record<string, z.ZodTypeAny> {
  if (!inputSchema || typeof inputSchema !== "object") return {};

  // Case 1: ZodObject — has .shape
  if (
    "shape" in inputSchema &&
    (inputSchema as { shape: unknown }).shape !== null &&
    typeof (inputSchema as { shape: unknown }).shape === "object"
  ) {
    return (inputSchema as { shape: Record<string, z.ZodTypeAny> }).shape;
  }

  // Case 2: Vercel AI jsonSchema() wrapper — has .jsonSchema (raw JSONSchema7)
  if ("jsonSchema" in inputSchema) {
    const raw = (inputSchema as { jsonSchema: unknown }).jsonSchema;
    if (raw && typeof raw === "object") {
      return jsonSchemaToZodShape(raw as Record<string, unknown>);
    }
  }

  return {};
}

/**
 * Convert a simple JSON Schema object (type:object with properties) into a
 * Zod raw shape. Used for MCP tools whose schemas come in JSON Schema format.
 *
 * Maps:
 *   "string"          → z.string()
 *   "number"/"integer"→ z.number()
 *   "boolean"         → z.boolean()
 *   "array"           → z.array(z.unknown())
 *   "object"          → z.record(z.unknown())
 *   anything else     → z.unknown()
 *
 * Non-required fields are made optional.
 */
function jsonSchemaToZodShape(
  schema: Record<string, unknown>
): Record<string, z.ZodTypeAny> {
  const properties = schema.properties as Record<string, unknown> | undefined;
  if (!properties || typeof properties !== "object") return {};

  const required = new Set<string>(
    Array.isArray(schema.required) ? (schema.required as string[]) : []
  );

  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, prop] of Object.entries(properties)) {
    if (!prop || typeof prop !== "object") {
      shape[key] = z.unknown().optional();
      continue;
    }

    const p = prop as Record<string, unknown>;
    let zodType: z.ZodTypeAny;

    switch (p.type) {
      case "string":
        zodType = z.string();
        break;
      case "number":
      case "integer":
        zodType = z.number();
        break;
      case "boolean":
        zodType = z.boolean();
        break;
      case "array":
        zodType = z.array(z.unknown());
        break;
      case "object":
        zodType = z.record(z.unknown());
        break;
      default:
        zodType = z.unknown();
    }

    if (!required.has(key)) {
      zodType = zodType.optional();
    }

    shape[key] = zodType;
  }

  return shape;
}

/**
 * Wrap any Vercel AI / raw tool result into the MCP CallToolResult shape
 * expected by createSdkMcpServer tool handlers.
 */
function toCallToolResult(
  result: unknown
): { content: Array<{ type: "text"; text: string }> } {
  const text =
    typeof result === "string" ? result : JSON.stringify(result, null, 2);
  return { content: [{ type: "text" as const, text }] };
}

function toCallToolError(
  err: unknown
): { content: Array<{ type: "text"; text: string }>; isError: boolean } {
  const msg = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build an in-process MCP server that exposes all Seline platform tools
 * available for the current agent to the Claude Agent SDK.
 *
 * Call this once per SDK query — the underlying MCP server is lightweight
 * (no subprocess, no network) and is garbage-collected when the query ends.
 */
export function createSelineSdkMcpServer(
  ctx: SelineMcpContext
): McpSdkServerConfigWithInstance {
  const registry = ToolRegistry.getInstance();
  const mcpManager = MCPClientManager.getInstance();

  const enabledSet = ctx.enabledTools ? new Set(ctx.enabledTools) : null;
  const factoryOpts = {
    sessionId: ctx.sessionId,
    userId: ctx.userId,
    characterId: ctx.characterId ?? undefined,
  };

  const sdkTools: SdkMcpToolDefinition<any>[] = [];

  // ── 1. Built-in ToolRegistry tools (non-MCP) ────────────────────────────
  for (const name of registry.getToolNames()) {
    const registeredTool = registry.get(name);
    if (!registeredTool) continue;

    // Skip MCP tools — they are handled separately below
    if (registeredTool.metadata.category === "mcp") continue;

    // Skip tools disabled by environment variable
    if (!registry.isToolEnabled(name)) continue;

    // Per-agent filtering: alwaysLoad tools always pass through
    const isAlwaysLoad = registeredTool.metadata.loading.alwaysLoad === true;
    if (enabledSet && !isAlwaysLoad && !enabledSet.has(name)) continue;

    try {
      const toolInstance = registeredTool.factory(factoryOpts);
      const inputSchema = zodShapeFromInputSchema(toolInstance.inputSchema);
      const description =
        toolInstance.description ??
        registeredTool.metadata.shortDescription;

      sdkTools.push({
        name,
        description,
        inputSchema,
        handler: async (args: Record<string, unknown>) => {
          try {
            const result = await (toolInstance as any).execute?.(args, {});
            return toCallToolResult(result);
          } catch (err) {
            return toCallToolError(err);
          }
        },
      });
    } catch (err) {
      console.warn(`[SelineMcpServer] Failed to instantiate tool "${name}":`, err);
    }
  }

  // ── 2. Per-agent MCP tools (already loaded by loadMCPToolsForCharacter) ─
  const mcpTools = mcpManager.getAllTools();
  for (const mcpTool of mcpTools) {
    const toolId = getMCPToolId(mcpTool.serverName, mcpTool.name);
    const inputSchema = jsonSchemaToZodShape(
      (mcpTool.inputSchema as Record<string, unknown>) ?? {}
    );
    const description =
      mcpTool.description ?? `MCP tool from ${mcpTool.serverName}`;

    sdkTools.push({
      name: toolId,
      description,
      inputSchema,
      handler: async (args: Record<string, unknown>) => {
        try {
          const result = await mcpManager.executeTool(
            mcpTool.serverName,
            mcpTool.name,
            args
          );
          return toCallToolResult(result);
        } catch (err) {
          return toCallToolError(err);
        }
      },
    });
  }

  console.log(
    `[SelineMcpServer] Exposing ${sdkTools.length} platform tools to SDK agent` +
      ` (${sdkTools.length - mcpTools.length} built-in, ${mcpTools.length} MCP)`
  );

  return createSdkMcpServer({
    name: "seline-platform",
    version: "1.0.0",
    tools: sdkTools,
  });
}
