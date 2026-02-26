/**
 * Seline Platform MCP Server for Claude Agent SDK
 *
 * Creates an in-process MCP server (via createSdkMcpServer) that bridges
 * Seline's ToolRegistry and per-agent MCP servers to the Claude Agent SDK.
 *
 * This lets the SDK agent see and call all Seline platform tools (vectorSearch,
 * memorize, getSkill, scheduleTask, etc.) and any MCP server tools configured
 * for the active agent — not just Claude Code's built-in tools.
 *
 * Tool exposure rules:
 *  - Built-in ToolRegistry tools: exposed if env-enabled + passes enabledTools filter
 *  - alwaysLoad utility tools (searchTools, listAllTools): always exposed
 *  - MCP tools: scoped to the active agent's enabledMcpServers / enabledMcpTools
 *    (uses getMCPToolsForAgent, NOT getAllTools — prevents cross-agent tool leakage)
 *
 * Deferred loading (when ctx.toolLoadingMode === "deferred"):
 *  - Non-alwaysLoad tools require searchTools discovery before they can be called.
 *  - A session-scoped `activatedTools` Set tracks which tools have been discovered.
 *  - searchTools execution auto-activates tools by scanning the result for tool names.
 *  - Previously discovered tools (from session metadata) are pre-seeded.
 *
 * Rich outputs (images, videos, files):
 *  - When a tool result contains image/video URLs, ctx.onRichOutput is called.
 *  - Route.ts wires this into the streaming state so media chips appear in the UI.
 */

import {
  createSdkMcpServer,
  type McpSdkServerConfigWithInstance,
  type SdkMcpToolDefinition,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { ToolRegistry } from "@/lib/ai/tool-registry/registry";
import { getMCPToolsForAgent, getMCPToolId } from "@/lib/ai/tool-registry/mcp-tool-adapter";
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

/**
 * Detect whether a tool result contains rich media outputs (image/video URLs).
 * Looks for common patterns: data URIs, URL fields pointing to media, etc.
 */
function extractRichOutputs(result: unknown): string[] {
  const urls: string[] = [];

  function scan(value: unknown) {
    if (typeof value === "string") {
      // data URIs (e.g. data:image/png;base64,...)
      if (value.startsWith("data:image/") || value.startsWith("data:video/")) {
        urls.push(value);
      }
      // Common URL field values ending in media extensions
      if (/\.(png|jpg|jpeg|gif|webp|mp4|webm|mov)(\?.*)?$/i.test(value) && value.startsWith("http")) {
        urls.push(value);
      }
    } else if (Array.isArray(value)) {
      for (const item of value) scan(item);
    } else if (value && typeof value === "object") {
      for (const v of Object.values(value as Record<string, unknown>)) scan(v);
    }
  }

  scan(result);
  return urls;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build an in-process MCP server that exposes all Seline platform tools
 * available for the current agent to the Claude Agent SDK.
 *
 * Fixes applied vs previous version:
 *  1. MCP ISOLATION: uses getMCPToolsForAgent(enabledMcpServers, enabledMcpTools)
 *     instead of mcpManager.getAllTools(), preventing cross-agent tool leakage.
 *  2. DEFERRED LOADING: tools with alwaysLoad=false require searchTools discovery
 *     before execution when toolLoadingMode === "deferred".
 *  3. RICH OUTPUTS: image/video URLs in tool results are forwarded to
 *     ctx.onRichOutput so the Seline UI renders media chips.
 *
 * Call this once per SDK query — the underlying MCP server is lightweight
 * (no subprocess, no network) and is garbage-collected when the query ends.
 */
export function createSelineSdkMcpServer(
  ctx: SelineMcpContext
): McpSdkServerConfigWithInstance {
  const registry = ToolRegistry.getInstance();

  const enabledSet = ctx.enabledTools ? new Set(ctx.enabledTools) : null;
  const factoryOpts = {
    sessionId: ctx.sessionId,
    userId: ctx.userId,
    characterId: ctx.characterId ?? undefined,
  };

  const useDeferredMode = ctx.toolLoadingMode === "deferred";

  // ── Session-scoped activation state for deferred loading ──────────────────
  // Tools in this Set are callable immediately. All alwaysLoad tools are
  // pre-seeded. Non-alwaysLoad tools must be discovered via searchTools first.
  // Previously discovered tools (from session metadata) are also pre-seeded
  // so that multi-turn conversations carry forward prior discoveries.
  const alwaysLoadMcpSet = new Set(ctx.alwaysLoadMcpToolIds ?? []);
  const activatedTools = new Set<string>([
    ...(ctx.previouslyDiscoveredTools ?? []),
  ]);

  // We'll add alwaysLoad tool names after we know which registry tools are alwaysLoad.
  // Track all known tool names for searchTools result scanning.
  const allKnownToolNames = new Set<string>();

  const sdkTools: SdkMcpToolDefinition<any>[] = [];

  // ── 1. Built-in ToolRegistry tools (non-MCP) ────────────────────────────
  for (const name of registry.getToolNames()) {
    const registeredTool = registry.get(name);
    if (!registeredTool) continue;

    // Skip MCP tools — handled separately below with proper agent scoping
    if (registeredTool.metadata.category === "mcp") continue;

    // Skip tools disabled by environment variable
    if (!registry.isToolEnabled(name)) continue;

    // Per-agent filtering: alwaysLoad tools always pass through
    const isAlwaysLoad = registeredTool.metadata.loading.alwaysLoad === true;
    if (enabledSet && !isAlwaysLoad && !enabledSet.has(name)) continue;

    // Pre-seed alwaysLoad tools into the activated set
    if (isAlwaysLoad) {
      activatedTools.add(name);
    }

    allKnownToolNames.add(name);

    try {
      const toolInstance = registeredTool.factory(factoryOpts);
      const inputSchema = zodShapeFromInputSchema(toolInstance.inputSchema);
      const description =
        toolInstance.description ??
        registeredTool.metadata.shortDescription;

      const isSearchTools = name === "searchTools" || name === "listAllTools";

      sdkTools.push({
        name,
        description,
        inputSchema,
        handler: async (args: Record<string, unknown>) => {
          // Deferred gate: block non-activated tools until searchTools discovers them
          if (useDeferredMode && !isAlwaysLoad && !activatedTools.has(name)) {
            return toCallToolResult(
              `Tool "${name}" requires discovery first. ` +
              `Call searchTools("${name}") to activate it, then retry.`
            );
          }

          try {
            const result = await (toolInstance as any).execute?.(args, {});

            // searchTools/listAllTools: scan result for tool names and auto-activate them
            if (isSearchTools && result != null) {
              const resultText = typeof result === "string"
                ? result
                : JSON.stringify(result);
              for (const toolName of allKnownToolNames) {
                if (resultText.includes(toolName)) {
                  activatedTools.add(toolName);
                }
              }
              // Also activate any MCP tool names mentioned
              for (const mcpName of alwaysLoadMcpSet) {
                activatedTools.add(mcpName);
              }
            }

            // Rich output detection
            if (ctx.onRichOutput) {
              const richUrls = extractRichOutputs(result);
              if (richUrls.length > 0) {
                const toolCallId = `sdk_${name}_${Date.now()}`;
                ctx.onRichOutput(toolCallId, name, result);
              }
            }

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

  // ── 2. Per-agent MCP tools (scoped via getMCPToolsForAgent) ───────────────
  //
  // FIX: Previously used mcpManager.getAllTools() which returns ALL tools from
  // ALL connected agents' MCP servers. Now uses getMCPToolsForAgent() with the
  // agent's enabledMcpServers + enabledMcpTools from character metadata, so
  // each agent only sees its own configured MCP tools.
  let mcpTools: ReturnType<typeof getMCPToolsForAgent> = [];
  try {
    mcpTools = getMCPToolsForAgent(ctx.enabledMcpServers, ctx.enabledMcpTools);
  } catch (err) {
    console.warn("[SelineMcpServer] getMCPToolsForAgent failed, no MCP tools exposed:", err);
  }

  for (const mcpTool of mcpTools) {
    const toolId = getMCPToolId(mcpTool.serverName, mcpTool.name);
    const inputSchema = jsonSchemaToZodShape(
      (mcpTool.inputSchema as Record<string, unknown>) ?? {}
    );
    const description =
      mcpTool.description ?? `MCP tool from ${mcpTool.serverName}`;

    // Determine if this MCP tool is alwaysLoad based on what was resolved in loadMCPToolsForCharacter
    const isMcpAlwaysLoad = alwaysLoadMcpSet.has(toolId);
    if (isMcpAlwaysLoad) {
      activatedTools.add(toolId);
    }

    allKnownToolNames.add(toolId);

    sdkTools.push({
      name: toolId,
      description,
      inputSchema,
      handler: async (args: Record<string, unknown>) => {
        // Deferred gate for MCP tools (same as ToolRegistry tools)
        if (useDeferredMode && !isMcpAlwaysLoad && !activatedTools.has(toolId)) {
          return toCallToolResult(
            `MCP tool "${toolId}" requires discovery first. ` +
            `Call searchTools("${mcpTool.name}") to activate it, then retry.`
          );
        }

        try {
          // Import MCPClientManager lazily to avoid circular deps
          const { MCPClientManager } = await import("@/lib/mcp/client-manager");
          const mcpManager = MCPClientManager.getInstance();
          const result = await mcpManager.executeTool(
            mcpTool.serverName,
            mcpTool.name,
            args
          );

          // Rich output detection
          if (ctx.onRichOutput) {
            const richUrls = extractRichOutputs(result);
            if (richUrls.length > 0) {
              const toolCallId = `sdk_${toolId}_${Date.now()}`;
              ctx.onRichOutput(toolCallId, toolId, result);
            }
          }

          return toCallToolResult(result);
        } catch (err) {
          return toCallToolError(err);
        }
      },
    });
  }

  const builtInCount = sdkTools.length - mcpTools.length;
  console.log(
    `[SelineMcpServer] Exposing ${sdkTools.length} tools to SDK agent` +
    ` (${builtInCount} built-in, ${mcpTools.length} MCP)` +
    (useDeferredMode
      ? `, deferred mode: ${activatedTools.size} pre-activated`
      : ", always mode: all tools active")
  );

  return createSdkMcpServer({
    name: "seline-platform",
    version: "1.0.0",
    tools: sdkTools,
  });
}
