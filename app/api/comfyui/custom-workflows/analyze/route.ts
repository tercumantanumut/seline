import { NextRequest, NextResponse } from "next/server";
import { analyzeWorkflow } from "@/lib/comfyui/custom/analyzer";
import { fetchObjectInfo, resolveCustomComfyUIBaseUrl } from "@/lib/comfyui/custom/client";
import { buildWorkflowChatPreview } from "@/lib/comfyui/custom/chat-preview";
import { countWorkflowNodes } from "@/lib/comfyui/custom/workflow-utils";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      workflow?: Record<string, unknown> | string;
      format?: "ui" | "api";
      validateWithComfyUI?: boolean;
      comfyuiBaseUrl?: string;
      comfyuiHost?: string;
      comfyuiPort?: number;
      fileName?: string;
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
    const nodeCount = countWorkflowNodes(workflowJson);
    const preview = await buildWorkflowChatPreview({
      fileName: body.fileName || "workflow.json",
      nodeCount,
      inputs: analysis.inputs,
      outputs: analysis.outputs,
    });

    return NextResponse.json({
      ...analysis,
      nodeCount,
      summary: preview.summary,
      importantInputIds: preview.importantInputIds,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to analyze workflow";
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
