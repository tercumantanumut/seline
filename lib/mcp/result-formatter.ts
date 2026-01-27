/**
 * MCP Result Formatter
 *
 * Formats MCP tool results to match Seline's tool result conventions
 * and strips base64 payloads to avoid context bloat.
 */

import { saveBase64Image, saveBase64Video } from "@/lib/storage/local-storage";
import { getRunContext } from "@/lib/observability/run-context";

const BASE64_PLACEHOLDER = "[Base64 data removed to prevent context bloat]";
const MAX_BASE64_GUESS_LENGTH = 5000;
const MAX_SANITIZE_DEPTH = 6;

function looksLikeBase64ImageData(text: string): boolean {
    if (text.length < 1000) return false;
    if (text.includes("data:image/") && text.includes(";base64,")) return true;
    const base64Chars = text.match(/[A-Za-z0-9+/=]/g);
    if (base64Chars && base64Chars.length / text.length > 0.95 && text.length > MAX_BASE64_GUESS_LENGTH) {
        return true;
    }
    return false;
}

function parseDataUrl(value: string): { mimeType: string; data: string } | null {
    const match = value.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    return { mimeType: match[1], data: match[2] };
}

async function persistDataUrl(value: string, sessionId?: string): Promise<string | null> {
    if (!sessionId) return null;
    const parsed = parseDataUrl(value);
    if (!parsed) return null;
    const mimeType = parsed.mimeType.toLowerCase();
    const format = mimeType.split("/")[1] || "png";

    if (mimeType.startsWith("image/")) {
        const saved = await saveBase64Image(value, sessionId, "generated", format);
        return saved.url;
    }
    if (mimeType.startsWith("video/") || mimeType.startsWith("application/")) {
        const saved = await saveBase64Video(value, sessionId, "generated", format);
        return saved.url;
    }
    return null;
}

async function sanitizeString(value: string, sessionId?: string): Promise<string> {
    if (value.startsWith("data:")) {
        const persisted = await persistDataUrl(value, sessionId);
        return persisted ?? BASE64_PLACEHOLDER;
    }
    if (looksLikeBase64ImageData(value)) {
        return BASE64_PLACEHOLDER;
    }
    return value;
}

async function sanitizeValue(
    value: unknown,
    sessionId?: string,
    depth: number = 0,
    seen: WeakSet<object> = new WeakSet()
): Promise<unknown> {
    if (depth > MAX_SANITIZE_DEPTH) return value;
    if (typeof value === "string") {
        return sanitizeString(value, sessionId);
    }
    if (Array.isArray(value)) {
        const sanitized = [];
        for (const item of value) {
            sanitized.push(await sanitizeValue(item, sessionId, depth + 1, seen));
        }
        return sanitized;
    }
    if (value && typeof value === "object") {
        const obj = value as Record<string, unknown>;
        if (seen.has(obj)) return obj;
        seen.add(obj);
        const sanitized: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(obj)) {
            sanitized[key] = await sanitizeValue(val, sessionId, depth + 1, seen);
        }
        return sanitized;
    }
    return value;
}

/**
 * Format MCP tool results to match Seline's conventions
 * Follows patterns from execute-command-tool.ts
 */
export async function formatMCPToolResult(
    serverName: string,
    toolName: string,
    result: unknown,
    isError: boolean = false,
    options: { sessionId?: string } = {}
): Promise<Record<string, unknown>> {
    const sessionId = options.sessionId ?? getRunContext()?.sessionId;
    if (isError) {
        return {
            status: "error",
            source: "mcp",
            server: serverName,
            tool: toolName,
            metadata: {
                server: serverName,
                tool: toolName,
            },
            error: typeof result === "string" ? await sanitizeString(result, sessionId) : JSON.stringify(result),
        };
    }

    // Handle different result types
    if (typeof result === "string") {
        return {
            status: "success",
            source: "mcp",
            server: serverName,
            tool: toolName,
            metadata: {
                server: serverName,
                tool: toolName,
            },
            content: await sanitizeString(result, sessionId),
        };
    }

    if (Array.isArray(result)) {
        return {
            status: "success",
            source: "mcp",
            server: serverName,
            tool: toolName,
            metadata: {
                server: serverName,
                tool: toolName,
                itemCount: result.length,
            },
            content: await sanitizeValue(result, sessionId),
        };
    }

    if (typeof result === "object" && result !== null) {
        // Check for MCP content array format
        const mcpResult = result as {
            content?: Array<{ type: string; text?: string; data?: string; mimeType?: string; url?: string }>;
        };
        if (mcpResult.content && Array.isArray(mcpResult.content)) {
            const textParts: string[] = [];
            const images: Array<{ url: string }> = [];
            const sanitizedContent: Array<Record<string, unknown>> = [];

            for (const item of mcpResult.content) {
                if (item.type === "image") {
                    const dataUrl = item.url?.startsWith("data:")
                        ? item.url
                        : item.data?.startsWith("data:")
                            ? item.data
                            : item.data && item.mimeType
                                ? `data:${item.mimeType};base64,${item.data}`
                                : item.data;
                    const resolvedUrl = dataUrl && typeof dataUrl === "string"
                        ? await persistDataUrl(dataUrl, sessionId)
                        : null;
                    if (resolvedUrl) {
                        images.push({ url: resolvedUrl });
                    }
                    sanitizedContent.push({
                        ...item,
                        url: resolvedUrl ?? item.url,
                        data: resolvedUrl ? undefined : BASE64_PLACEHOLDER,
                    });
                } else if (item.type === "text" && item.text) {
                    const sanitizedText = await sanitizeString(item.text, sessionId);
                    textParts.push(sanitizedText);
                    sanitizedContent.push({
                        ...item,
                        text: sanitizedText,
                    });
                } else {
                    sanitizedContent.push(await sanitizeValue(item, sessionId) as Record<string, unknown>);
                }
            }
            const textContent = textParts.join("\n");

            return {
                status: "success",
                source: "mcp",
                server: serverName,
                tool: toolName,
                metadata: {
                    server: serverName,
                    tool: toolName,
                },
                ...(images.length > 0 ? { images } : {}),
                ...(textContent ? { text: textContent } : {}),
                content: textContent || sanitizedContent,
            };
        }

        return {
            status: "success",
            source: "mcp",
            server: serverName,
            tool: toolName,
            metadata: {
                server: serverName,
                tool: toolName,
            },
            content: await sanitizeValue(result, sessionId),
        };
    }

    return {
        status: "success",
        source: "mcp",
        server: serverName,
        tool: toolName,
        metadata: {
            server: serverName,
            tool: toolName,
        },
        content: String(result),
    };
}
