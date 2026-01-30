import { NextRequest, NextResponse } from "next/server";
import { analyzeWorkflow } from "@/lib/comfyui/custom/analyzer";
import { fetchObjectInfo, resolveCustomComfyUIBaseUrl } from "@/lib/comfyui/custom/client";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      workflow?: Record<string, unknown> | string;
      format?: "ui" | "api";
      validateWithComfyUI?: boolean;
      comfyuiBaseUrl?: string;
      comfyuiHost?: string;
      comfyuiPort?: number;
    };
    if (!body.workflow) {
      return NextResponse.json({ error: "Missing workflow JSON." }, { status: 400 });
    }

    const workflowJson = typeof body.workflow === "string"
      ? JSON.parse(body.workflow)
      : body.workflow;

    let objectInfo: Record<string, unknown> | undefined;
    if (body.validateWithComfyUI) {
      const resolved = await resolveCustomComfyUIBaseUrl({
        comfyuiBaseUrl: body.comfyuiBaseUrl,
        comfyuiHost: body.comfyuiHost,
        comfyuiPort: body.comfyuiPort,
      });
      objectInfo = await fetchObjectInfo(resolved.baseUrl);
    }

    const analysis = analyzeWorkflow(workflowJson, body.format, { objectInfo });
    return NextResponse.json(analysis);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to analyze workflow" },
      { status: 500 }
    );
  }
}
