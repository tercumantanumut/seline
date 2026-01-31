import { NextRequest, NextResponse } from "next/server";
import { analyzeWorkflow } from "@/lib/comfyui/custom/analyzer";
import { fetchObjectInfo, resolveCustomComfyUIBaseUrl } from "@/lib/comfyui/custom/client";
import {
  createCustomComfyUIWorkflow,
  listCustomComfyUIWorkflows,
} from "@/lib/comfyui/custom/store";
import type { CustomComfyUIWorkflow } from "@/lib/comfyui/custom/types";

export async function GET() {
  const workflows = await listCustomComfyUIWorkflows();
  return NextResponse.json({ workflows });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<CustomComfyUIWorkflow> & {
      workflow?: Record<string, unknown> | string;
      validateWithComfyUI?: boolean;
    };
    if (!body.name || !body.workflow) {
      return NextResponse.json({ error: "Missing workflow name or JSON." }, { status: 400 });
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

    const analysis = analyzeWorkflow(workflowJson as Record<string, unknown>, body.format, { objectInfo });
    const created = await createCustomComfyUIWorkflow({
      name: body.name,
      description: body.description,
      workflow: workflowJson as Record<string, unknown>,
      format: body.format || analysis.format,
      inputs: body.inputs && body.inputs.length > 0 ? body.inputs : analysis.inputs,
      outputs: body.outputs && body.outputs.length > 0 ? body.outputs : analysis.outputs,
      enabled: body.enabled !== false,
      loadingMode: body.loadingMode || "deferred",
      comfyuiHost: body.comfyuiHost,
      comfyuiPort: body.comfyuiPort,
      comfyuiBaseUrl: body.comfyuiBaseUrl,
      timeoutSeconds: body.timeoutSeconds,
    });

    return NextResponse.json({ workflow: created });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create workflow";
    const isConnectionError =
      typeof message === "string" &&
      (message.includes("ComfyUI connection failed") ||
        message.includes("ComfyUI instance not reachable"));
    return NextResponse.json(
      { error: message },
      { status: isConnectionError ? 503 : 500 }
    );
  }
}
