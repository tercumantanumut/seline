/**
 * MCP Tool Adapter
 * 
 * Converts MCP tools to Seline's ToolMetadata format and creates AI SDK-compatible wrappers.
 */

import { tool, jsonSchema } from "ai";
import type { Tool } from "ai";
import type { ToolMetadata, ToolFactory } from "@/lib/ai/tool-registry/types";
import { ToolRegistry } from "@/lib/ai/tool-registry/registry";
import { MCPClientManager, type MCPDiscoveredTool } from "@/lib/mcp/client-manager";
import { formatMCPToolResult } from "@/lib/mcp/result-formatter";

const MCP_SCHEMA_DRAFT = "https://json-schema.org/draft/2020-12/schema";

const DEFAULT_MCP_INPUT_SCHEMA: Record<string, unknown> = {
    $schema: MCP_SCHEMA_DRAFT,
    type: "object",
    properties: {},
    additionalProperties: true,
};

const MCP_ALLOWED_SCHEMA_KEYS = new Set([
    "$schema",
    "$id",
    "$ref",
    "$defs",
    "$comment",
    "title",
    "description",
    "type",
    "enum",
    "const",
    "default",
    "examples",
    "format",
    "properties",
    "patternProperties",
    "additionalProperties",
    "required",
    "items",
    "prefixItems",
    "minItems",
    "maxItems",
    "uniqueItems",
    "contains",
    "minContains",
    "maxContains",
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "multipleOf",
    "minLength",
    "maxLength",
    "pattern",
    "dependentRequired",
    "dependentSchemas",
    "if",
    "then",
    "else",
    "allOf",
    "anyOf",
    "oneOf",
    "not",
    "unevaluatedProperties",
    "unevaluatedItems",
    "propertyNames",
    "contentMediaType",
    "contentEncoding",
    "contentSchema",
    "readOnly",
    "writeOnly",
    "deprecated",
    "minProperties",
    "maxProperties",
]);

const MCP_STRING_KEYS = new Set([
    "$schema",
    "$id",
    "$ref",
    "$comment",
    "title",
    "description",
    "format",
    "pattern",
    "contentMediaType",
    "contentEncoding",
]);

const MCP_NUMBER_KEYS = new Set([
    "minItems",
    "maxItems",
    "minContains",
    "maxContains",
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "multipleOf",
    "minLength",
    "maxLength",
    "minProperties",
    "maxProperties",
]);

const MCP_BOOLEAN_KEYS = new Set([
    "uniqueItems",
    "readOnly",
    "writeOnly",
    "deprecated",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeSchemaValue(value: unknown): Record<string, unknown> | boolean | undefined {
    if (typeof value === "boolean") {
        return value;
    }
    if (!isPlainObject(value)) {
        return undefined;
    }
    return sanitizeSchema(value);
}

function sanitizeSchemaArray(value: unknown): Array<Record<string, unknown> | boolean> | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }
    const sanitized = value
        .map((entry) => sanitizeSchemaValue(entry))
        .filter((entry): entry is Record<string, unknown> | boolean => entry !== undefined);
    return sanitized.length > 0 ? sanitized : undefined;
}

function sanitizeSchemaRecord(value: unknown): Record<string, unknown> | undefined {
    if (!isPlainObject(value)) {
        return undefined;
    }
    const sanitized: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
        const normalized = sanitizeSchemaValue(entry);
        if (normalized !== undefined) {
            sanitized[key] = normalized;
        }
    }
    return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function ensureSchemaCompleteness(schema: Record<string, unknown>): Record<string, unknown> {
    // Claude's API strictly requires array schemas to have "items" and
    // object schemas to have "properties". Fix nested schemas that lack these.
    const type = schema.type;

    if (type === "array" || (Array.isArray(type) && type.includes("array"))) {
        if (!("items" in schema) && !("prefixItems" in schema)) {
            schema.items = { type: "string" };
        }
    }

    if (type === "object" || (Array.isArray(type) && type.includes("object"))) {
        if (!("properties" in schema)) {
            schema.properties = {};
        }
    }

    // Recurse into nested schemas
    for (const key of ["properties", "patternProperties", "$defs", "dependentSchemas"]) {
        const val = schema[key];
        if (isPlainObject(val)) {
            for (const [k, v] of Object.entries(val)) {
                if (isPlainObject(v)) {
                    (val as Record<string, unknown>)[k] = ensureSchemaCompleteness(v as Record<string, unknown>);
                }
            }
        }
    }

    for (const key of ["items", "additionalProperties", "contains", "not", "if", "then", "else", "contentSchema", "propertyNames", "unevaluatedProperties", "unevaluatedItems"]) {
        const val = schema[key];
        if (isPlainObject(val)) {
            schema[key] = ensureSchemaCompleteness(val as Record<string, unknown>);
        }
    }

    for (const key of ["allOf", "anyOf", "oneOf", "prefixItems"]) {
        const val = schema[key];
        if (Array.isArray(val)) {
            schema[key] = val.map((entry: unknown) =>
                isPlainObject(entry) ? ensureSchemaCompleteness(entry as Record<string, unknown>) : entry
            );
        }
    }

    return schema;
}

function sanitizeSchema(schema: Record<string, unknown>): Record<string, unknown> {
    const input = { ...schema };

    if (isPlainObject(input.definitions)) {
        const existing = isPlainObject(input.$defs) ? input.$defs : {};
        input.$defs = { ...input.definitions, ...existing };
    }
    delete input.definitions;

    if (typeof input.id === "string" && typeof input.$id !== "string") {
        input.$id = input.id;
    }
    delete input.id;

    if (typeof input.nullable === "boolean") {
        if (input.nullable) {
            const currentType = input.type;
            if (typeof currentType === "string") {
                input.type = currentType === "null" ? currentType : [currentType, "null"];
            } else if (Array.isArray(currentType)) {
                if (!currentType.includes("null")) {
                    input.type = [...currentType, "null"];
                }
            }
        }
        delete input.nullable;
    }

    if (typeof input.exclusiveMinimum === "boolean") {
        if (input.exclusiveMinimum) {
            if (typeof input.minimum === "number") {
                input.exclusiveMinimum = input.minimum;
                delete input.minimum;
            } else {
                delete input.exclusiveMinimum;
            }
        } else {
            delete input.exclusiveMinimum;
        }
    }

    if (typeof input.exclusiveMaximum === "boolean") {
        if (input.exclusiveMaximum) {
            if (typeof input.maximum === "number") {
                input.exclusiveMaximum = input.maximum;
                delete input.maximum;
            } else {
                delete input.exclusiveMaximum;
            }
        } else {
            delete input.exclusiveMaximum;
        }
    }

    if (Array.isArray(input.items)) {
        if (!input.prefixItems) {
            input.prefixItems = input.items;
        }
        delete input.items;
    }

    if ("additionalItems" in input) {
        if (input.items === undefined && (isPlainObject(input.additionalItems) || typeof input.additionalItems === "boolean")) {
            input.items = input.additionalItems;
        }
        delete input.additionalItems;
    }

    if (isPlainObject(input.dependencies)) {
        const dependentRequired: Record<string, string[]> = {};
        const dependentSchemas: Record<string, Record<string, unknown>> = {};

        for (const [key, value] of Object.entries(input.dependencies)) {
            if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
                dependentRequired[key] = value as string[];
            } else if (isPlainObject(value)) {
                dependentSchemas[key] = value as Record<string, unknown>;
            }
        }

        if (Object.keys(dependentRequired).length > 0) {
            const existing = isPlainObject(input.dependentRequired) ? input.dependentRequired : {};
            input.dependentRequired = { ...existing, ...dependentRequired };
        }

        if (Object.keys(dependentSchemas).length > 0) {
            const existing = isPlainObject(input.dependentSchemas) ? input.dependentSchemas : {};
            input.dependentSchemas = { ...existing, ...dependentSchemas };
        }
    }
    delete input.dependencies;

    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
        if (!MCP_ALLOWED_SCHEMA_KEYS.has(key)) {
            continue;
        }

        switch (key) {
            case "$ref":
                if (typeof value === "string") {
                    sanitized[key] = value
                        .replace(/#\/definitions\//g, "#/$defs/")
                        .replace(/#\/definitions$/g, "#/$defs");
                }
                break;
            case "properties":
            case "patternProperties":
            case "$defs":
            case "dependentSchemas": {
                const record = sanitizeSchemaRecord(value);
                if (record) {
                    sanitized[key] = record;
                }
                break;
            }
            case "items":
            case "additionalProperties":
            case "unevaluatedProperties":
            case "unevaluatedItems":
            case "contains":
            case "propertyNames":
            case "not":
            case "if":
            case "then":
            case "else":
            case "contentSchema": {
                const normalized = sanitizeSchemaValue(value);
                if (normalized !== undefined) {
                    sanitized[key] = normalized;
                }
                break;
            }
            case "allOf":
            case "anyOf":
            case "oneOf":
            case "prefixItems": {
                const array = sanitizeSchemaArray(value);
                if (array) {
                    sanitized[key] = array;
                }
                break;
            }
            case "required":
                if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
                    sanitized[key] = value;
                }
                break;
            case "enum":
                if (Array.isArray(value)) {
                    sanitized[key] = value;
                }
                break;
            case "examples":
                if (Array.isArray(value)) {
                    sanitized[key] = value;
                }
                break;
            case "type":
                if (typeof value === "string" || (Array.isArray(value) && value.every((entry) => typeof entry === "string"))) {
                    sanitized[key] = value;
                }
                break;
            default:
                if (MCP_STRING_KEYS.has(key)) {
                    if (typeof value === "string") {
                        sanitized[key] = value;
                    }
                    break;
                }
                if (MCP_NUMBER_KEYS.has(key)) {
                    if (typeof value === "number") {
                        sanitized[key] = value;
                    }
                    break;
                }
                if (MCP_BOOLEAN_KEYS.has(key)) {
                    if (typeof value === "boolean") {
                        sanitized[key] = value;
                    }
                    break;
                }
                if (key === "const" || key === "default") {
                    sanitized[key] = value;
                }
                break;
        }
    }

    return sanitized;
}

function normalizeMcpInputSchema(
    inputSchema: unknown,
    mcpTool: MCPDiscoveredTool
): Record<string, unknown> {
    if (!isPlainObject(inputSchema)) {
        console.warn(
            `[MCP] Invalid input schema for ${mcpTool.serverName}:${mcpTool.name}; using default schema.`
        );
        return { ...DEFAULT_MCP_INPUT_SCHEMA };
    }

    const sanitized = sanitizeSchema(inputSchema);
    if (!Object.keys(sanitized).length) {
        console.warn(
            `[MCP] Empty input schema for ${mcpTool.serverName}:${mcpTool.name}; using default schema.`
        );
        return { ...DEFAULT_MCP_INPUT_SCHEMA };
    }

    const normalizedType = sanitized.type;
    if (!normalizedType) {
        sanitized.type = "object";
    } else if (Array.isArray(normalizedType)) {
        if (!normalizedType.includes("object")) {
            sanitized.type = "object";
        }
    } else if (typeof normalizedType === "string" && normalizedType !== "object") {
        sanitized.type = "object";
    }

    if (!("properties" in sanitized)) {
        sanitized.properties = {};
    }

    if (!("additionalProperties" in sanitized)) {
        sanitized.additionalProperties = true;
    }

    sanitized.$schema = MCP_SCHEMA_DRAFT;

    // Ensure nested schemas are complete (Claude strictly requires items/properties)
    return ensureSchemaCompleteness(sanitized);
}

/**
 * Category for MCP tools - they get their own category
 */
export const MCP_TOOL_CATEGORY = "mcp" as const;

/**
 * Per-tool loading preference from agent settings
 */
export interface MCPToolLoadingPreference {
    enabled: boolean;
    loadingMode: "always" | "deferred";
}

/**
 * Convert an MCP tool to Seline's ToolMetadata format
 * @param mcpTool - The MCP tool from the server
 * @param preference - Optional per-tool loading preference from agent settings
 */
export function mcpToolToMetadata(
    mcpTool: MCPDiscoveredTool,
    preference?: MCPToolLoadingPreference
): ToolMetadata {
    // Determine loading configuration based on preference
    const loadingConfig = preference?.loadingMode === "always"
        ? { alwaysLoad: true, deferLoading: false }
        : { alwaysLoad: false, deferLoading: true };  // Default to deferred

    // Defensive: handle missing name/serverName from a deleted or partially-loaded tool
    const toolName = mcpTool.name || "unknown_tool";
    const serverName = mcpTool.serverName || "unknown_server";
    const description = mcpTool.description || "";

    return {
        displayName: `${toolName} (${serverName})`,
        category: MCP_TOOL_CATEGORY,
        keywords: [
            toolName,
            serverName,
            "mcp",
            "external",
            ...(description.toLowerCase().split(/\s+/).slice(0, 5)),
        ].filter(Boolean),
        shortDescription: description || `MCP tool from ${serverName}`,
        fullInstructions: description || undefined,
        loading: loadingConfig,  // Now dynamic based on preference
        requiresSession: false,
        // MCP tool results are shown in UI but excluded from AI conversation history
        // to save tokens (large outputs like browser snapshots are processed once)
        ephemeralResults: true,
    };
}

/**
 * Create an AI SDK tool wrapper for an MCP tool
 */
export function createMCPToolWrapper(mcpTool: MCPDiscoveredTool): Tool {
    const manager = MCPClientManager.getInstance();

    // Defensive: ensure we have valid identifiers even if tool was partially deleted
    const toolName = mcpTool.name || "unknown_tool";
    const serverName = mcpTool.serverName || "unknown_server";

    // Convert MCP input schema to AI SDK jsonSchema format
    const normalizedSchema = normalizeMcpInputSchema(mcpTool.inputSchema, mcpTool);
    console.log(`[MCP] Normalized schema for ${serverName}:${toolName}:`, JSON.stringify(normalizedSchema));
    const schema = jsonSchema<Record<string, unknown>>(normalizedSchema as any);

    return tool({
        description: mcpTool.description || `MCP tool: ${toolName}`,
        inputSchema: schema,
        execute: async (args: Record<string, unknown>) => {
            try {
                // Guard: check if the server is still connected before executing.
                // The tool may have been removed from the agent's config mid-session.
                if (!manager.isConnected(serverName)) {
                    const msg = `MCP server "${serverName}" is no longer connected. The tool "${toolName}" may have been removed.`;
                    console.warn(`[MCP Tool] ${msg}`);
                    return await formatMCPToolResult(
                        serverName,
                        toolName,
                        msg,
                        true
                    );
                }

                const result = await manager.executeTool(
                    serverName,
                    toolName,
                    args
                );

                // Format result according to Seline's conventions (strip base64 payloads)
                return await formatMCPToolResult(
                    serverName,
                    toolName,
                    result,
                    false
                );
            } catch (error) {
                console.error(`[MCP Tool] Error executing ${serverName}:${toolName}:`, error);
                return await formatMCPToolResult(
                    serverName,
                    toolName,
                    error instanceof Error ? error.message : String(error),
                    true
                );
            }
        },
    });
}

/**
 * Generate a unique tool ID for an MCP tool
 * Format: mcp_{serverName}_{toolName}
 */
export function getMCPToolId(serverName: string, toolName: string): string {
    // Sanitize names for use as identifiers
    const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9]/g, "_");
    return `mcp_${sanitize(serverName)}_${sanitize(toolName)}`;
}

/**
 * Register all tools from connected MCP servers with the ToolRegistry
 */
export function registerMCPTools(): void {
    const manager = MCPClientManager.getInstance();
    const registry = ToolRegistry.getInstance();

    const allTools = manager.getAllTools();

    for (const mcpTool of allTools) {
        const toolId = getMCPToolId(mcpTool.serverName, mcpTool.name);
        const metadata = mcpToolToMetadata(mcpTool);
        const factory: ToolFactory = () => createMCPToolWrapper(mcpTool);

        registry.register(toolId, metadata, factory);
        console.log(`[MCP] Registered tool: ${toolId}`);
    }

    console.log(`[MCP] Registered ${allTools.length} MCP tools`);
}

/**
 * Get MCP tools filtered by enabled servers/tools for an agent.
 * 
 * Returns only tools that are currently available from connected MCP servers.
 * If the agent's metadata references tools that no longer exist (e.g., removed
 * mid-session), those tools are silently excluded rather than causing errors.
 */
export function getMCPToolsForAgent(
    enabledServers?: string[],
    enabledTools?: string[]
): MCPDiscoveredTool[] {
    const manager = MCPClientManager.getInstance();
    let tools: MCPDiscoveredTool[];

    try {
        tools = manager.getAllTools();
    } catch (error) {
        console.warn("[MCP] Failed to retrieve tools from MCPClientManager:", error);
        return [];
    }

    // Defensive: filter out any tools with missing critical fields
    tools = tools.filter(t => t && t.name && t.serverName);

    // If enabled tools are explicitly specified, honor that list directly.
    // This allows per-tool enablement even when a server isn't globally enabled.
    // Tools referenced in enabledTools but not present in the manager are silently skipped.
    if (enabledTools) {
        if (enabledTools.length === 0) {
            return [];
        }
        const toolSet = new Set(enabledTools);
        tools = tools.filter(t => toolSet.has(`${t.serverName}:${t.name}`));
        return tools;
    }

    // Otherwise filter by enabled servers (if provided)
    if (enabledServers) {
        if (enabledServers.length === 0) {
            return [];
        }
        const serverSet = new Set(enabledServers);
        tools = tools.filter(t => serverSet.has(t.serverName));
    }

    return tools;
}
