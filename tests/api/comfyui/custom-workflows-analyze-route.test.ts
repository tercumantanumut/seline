import { beforeEach, describe, expect, it, vi } from "vitest";

const analyzerMocks = vi.hoisted(() => ({
  analyzeWorkflow: vi.fn(() => ({
    format: "api",
    inputs: [
      {
        id: "1:text",
        name: "prompt",
        type: "string",
        nodeId: "1",
        inputField: "text",
      },
    ],
    outputs: [
      {
        id: "2:output",
        name: "SaveImage",
        type: "image",
        nodeId: "2",
      },
    ],
  })),
}));

const clientMocks = vi.hoisted(() => ({
  resolveCustomComfyUIBaseUrl: vi.fn(async () => ({ baseUrl: "http://127.0.0.1:8188" })),
  fetchObjectInfo: vi.fn(async () => ({ KSampler: {} })),
}));

const previewMocks = vi.hoisted(() => ({
  buildWorkflowChatPreview: vi.fn(async () => ({
    summary: "Utility summary",
    importantInputIds: ["1:text"],
  })),
}));

vi.mock("@/lib/comfyui/custom/analyzer", () => analyzerMocks);
vi.mock("@/lib/comfyui/custom/client", () => clientMocks);
vi.mock("@/lib/comfyui/custom/chat-preview", () => previewMocks);

import { POST } from "@/app/api/comfyui/custom-workflows/analyze/route";

describe("/api/comfyui/custom-workflows/analyze", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns nodeCount and utility preview metadata", async () => {
    const response = await POST(new Request("http://localhost/api/comfyui/custom-workflows/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workflow: {
          "1": {
            class_type: "KSampler",
            inputs: {
              text: "hello",
            },
          },
          "2": {
            class_type: "SaveImage",
            inputs: {
              images: ["1", 0],
            },
          },
        },
        fileName: "portrait-flow.json",
      }),
    }) as any);

    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload).toMatchObject({
      format: "api",
      nodeCount: 2,
      summary: "Utility summary",
      importantInputIds: ["1:text"],
    });

    expect(previewMocks.buildWorkflowChatPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: "portrait-flow.json",
        nodeCount: 2,
      })
    );
  });

  it("passes ComfyUI validation through when requested", async () => {
    await POST(new Request("http://localhost/api/comfyui/custom-workflows/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workflow: { "1": { class_type: "KSampler", inputs: {} } },
        validateWithComfyUI: true,
        comfyuiHost: "127.0.0.1",
        comfyuiPort: 8188,
      }),
    }) as any);

    expect(clientMocks.resolveCustomComfyUIBaseUrl).toHaveBeenCalled();
    expect(clientMocks.fetchObjectInfo).toHaveBeenCalledWith("http://127.0.0.1:8188");
  });
});
