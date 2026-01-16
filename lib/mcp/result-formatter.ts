/**
 * MCP Result Formatter
 * 
 * Formats MCP tool results to match Seline's tool result conventions.
 */

/**
 * Format MCP tool results to match Seline's conventions
 * Follows patterns from execute-command-tool.ts
 */
export function formatMCPToolResult(
    serverName: string,
    toolName: string,
    result: unknown,
    isError: boolean = false
): Record<string, unknown> {
    if (isError) {
        return {
            status: "error",
            source: "mcp",
            metadata: {
                server: serverName,
                tool: toolName,
            },
            error: typeof result === "string" ? result : JSON.stringify(result),
        };
    }

    // Handle different result types
    if (typeof result === "string") {
        return {
            status: "success",
            source: "mcp",
            metadata: {
                server: serverName,
                tool: toolName,
            },
            content: result,
        };
    }

    if (Array.isArray(result)) {
        return {
            status: "success",
            source: "mcp",
            metadata: {
                server: serverName,
                tool: toolName,
                itemCount: result.length,
            },
            content: result,
        };
    }

    if (typeof result === "object" && result !== null) {
        // Check for MCP content array format
        const mcpResult = result as { content?: Array<{ type: string; text?: string }> };
        if (mcpResult.content && Array.isArray(mcpResult.content)) {
            // Extract text content from MCP response
            const textContent = mcpResult.content
                .filter(c => c.type === "text" && c.text)
                .map(c => c.text)
                .join("\n");

            return {
                status: "success",
                source: "mcp",
                metadata: {
                    server: serverName,
                    tool: toolName,
                },
                content: textContent || mcpResult.content,
            };
        }

        return {
            status: "success",
            source: "mcp",
            metadata: {
                server: serverName,
                tool: toolName,
            },
            content: result,
        };
    }

    return {
        status: "success",
        source: "mcp",
        metadata: {
            server: serverName,
            tool: toolName,
        },
        content: String(result),
    };
}
