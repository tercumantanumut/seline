import { NextResponse } from "next/server";
import { ToolRegistry, registerAllTools } from "@/lib/ai/tool-registry";
import type { ToolCategory } from "@/lib/ai/tool-registry/types";
import { loadSettings } from "@/lib/settings/settings-manager";

// Ensure settings are loaded (syncs API keys to process.env)
loadSettings();

// Ensure tools are registered
registerAllTools();

/**
 * Configurable tool info returned by the API
 */
export interface ConfigurableTool {
  /** Tool identifier (used in enabledTools) */
  id: string;
  /** Human-readable display name */
  displayName: string;
  /** Brief description */
  description: string;
  /** Tool category */
  category: ToolCategory;
  /** Whether this tool is enabled (based on env vars) */
  isEnabled: boolean;
}

/**
 * GET /api/tools
 *
 * Returns the list of configurable tools from the registry.
 * Excludes utility tools and always-load tools (like searchTools, listAllTools)
 * since those are not meant to be configured per character.
 *
 * Query params:
 * - includeDisabled: if "true", includes tools that are disabled by env vars
 */
export async function GET(request: Request) {
  try {
    // Reload settings to ensure API keys are synced to process.env
    loadSettings();

    try {
      const { loadCustomComfyUITools } = await import("@/lib/comfyui/custom/chat-integration");
      await loadCustomComfyUITools();
    } catch (error) {
      console.error("[Tools API] Failed to load Custom ComfyUI tools:", error);
    }

    const { searchParams } = new URL(request.url);
    const includeDisabled = searchParams.get("includeDisabled") === "true";
    const includeAlwaysLoad = searchParams.get("includeAlwaysLoad") === "true";

    const registry = ToolRegistry.getInstance();
    const allTools = registry.getAvailableToolsList();

    // Filter out utility tools and always-load tools
    const configurableTools: ConfigurableTool[] = [];

    for (const tool of allTools) {
      // Get full tool metadata to check alwaysLoad
      const registeredTool = registry.get(tool.name);
      if (!registeredTool) continue;

      const { metadata } = registeredTool;

      // Skip utility category tools (searchTools, listAllTools)
      if (metadata.category === "utility") continue;

      // Skip always-load tools (these are always available), unless requested or custom-comfyui
      if (metadata.loading.alwaysLoad && !includeAlwaysLoad && metadata.category !== "custom-comfyui") continue;

      // Check if tool is enabled via environment variables
      const isEnabled = registry.isToolEnabled(tool.name);

      // Skip disabled tools unless explicitly requested
      if (!isEnabled && !includeDisabled) continue;

      configurableTools.push({
        id: tool.name,
        displayName: tool.displayName,
        description: tool.description,
        category: tool.category,
        isEnabled,
      });
    }

    // Sort by category then by displayName
    configurableTools.sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.displayName.localeCompare(b.displayName);
    });

    return NextResponse.json({
      tools: configurableTools,
      total: configurableTools.length,
    });
  } catch (error) {
    console.error("[Tools API] Error fetching tools:", error);
    return NextResponse.json(
      { error: "Failed to fetch tools" },
      { status: 500 }
    );
  }
}

