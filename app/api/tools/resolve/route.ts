import { NextResponse } from "next/server";
import { loadSettings } from "@/lib/settings/settings-manager";
import { resolveSelineTemplateTools, type ToolWarning } from "@/lib/characters/templates/resolve-tools";

/**
 * GET /api/tools/resolve
 *
 * Returns the resolved tool configuration for the Seline default template
 * based on the current user settings. Includes warnings about tools that
 * are disabled due to missing prerequisites.
 *
 * Used by the capabilities page and onboarding flow to show users which
 * tools they can use and what they need to configure.
 *
 * Query params:
 * - templateId: Template ID to resolve (currently only "seline-default" supported)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const templateId = searchParams.get("templateId") || "seline-default";

    if (templateId !== "seline-default") {
      return NextResponse.json(
        { error: `Template resolution not supported for: ${templateId}` },
        { status: 400 }
      );
    }

    const settings = loadSettings();
    const resolution = resolveSelineTemplateTools(settings);

    return NextResponse.json({
      templateId,
      enabledTools: resolution.enabledTools,
      warnings: resolution.warnings,
      summary: {
        totalEnabled: resolution.enabledTools.length,
        totalWarnings: resolution.warnings.length,
        disabledTools: resolution.warnings.map((w: ToolWarning) => w.toolId),
      },
    });
  } catch (error) {
    console.error("[Tools Resolve API] Error:", error);
    return NextResponse.json(
      { error: "Failed to resolve template tools" },
      { status: 500 }
    );
  }
}
