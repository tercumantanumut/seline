import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  requireAuth: vi.fn(async () => "auth-user-1"),
}));

const settingsMocks = vi.hoisted(() => ({
  loadSettings: vi.fn(() => ({ localUserEmail: "local@example.com" })),
}));

const dbMocks = vi.hoisted(() => ({
  getOrCreateLocalUser: vi.fn(async () => ({ id: "user-1" })),
  getSession: vi.fn(async () => ({
    id: "session-1",
    userId: "user-1",
    metadata: {
      discoveredTools: {
        toolNames: ["existing_tool"],
      },
    },
  })),
  updateSession: vi.fn(async () => undefined),
}));

const characterMocks = vi.hoisted(() => ({
  getCharacter: vi.fn(async () => ({
    id: "character-1",
    userId: "user-1",
    metadata: {
      enabledTools: ["existing_tool"],
      customComfyUIWorkflowIds: ["wf_existing"],
    },
  })),
  updateCharacter: vi.fn(async () => undefined),
}));

const analyzerMocks = vi.hoisted(() => ({
  analyzeWorkflow: vi.fn(() => ({
    format: "api",
    inputs: [
      {
        id: "1:text",
        name: "text",
        type: "string",
        nodeId: "1",
        inputField: "text",
        required: false,
        enabled: true,
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

const storeMocks = vi.hoisted(() => {
  let createCounter = 0;

  return {
    listCustomComfyUIWorkflows: vi.fn(async () => []),
    createCustomComfyUIWorkflow: vi.fn(async (payload: Record<string, unknown>) => {
      createCounter += 1;
      return {
        id: `wf_${createCounter}`,
        name: payload.name,
        inputs: payload.inputs || [],
        outputs: payload.outputs || [],
      };
    }),
    resetCounter: () => {
      createCounter = 0;
    },
  };
});

vi.mock("@/lib/auth/local-auth", () => authMocks);
vi.mock("@/lib/settings/settings-manager", () => settingsMocks);
vi.mock("@/lib/db/queries", () => dbMocks);
vi.mock("@/lib/characters/queries", () => characterMocks);
vi.mock("@/lib/comfyui/custom/analyzer", () => analyzerMocks);
vi.mock("@/lib/comfyui/custom/store", () => ({
  createCustomComfyUIWorkflow: storeMocks.createCustomComfyUIWorkflow,
  listCustomComfyUIWorkflows: storeMocks.listCustomComfyUIWorkflows,
}));
vi.mock("@/lib/comfyui/custom/workflow-utils", async () => {
  const actual = await vi.importActual<typeof import("@/lib/comfyui/custom/workflow-utils")>(
    "@/lib/comfyui/custom/workflow-utils"
  );

  return {
    ...actual,
    looksLikeComfyUIWorkflow: vi.fn(() => true),
  };
});

import { POST } from "@/app/api/comfyui/custom-workflows/import/route";

describe("/api/comfyui/custom-workflows/import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeMocks.resetCounter();
    storeMocks.listCustomComfyUIWorkflows.mockResolvedValue([]);
  });

  it("applies per-file name overrides and stores basename in description", async () => {
    const formData = new FormData();
    const file = new File([JSON.stringify({ "1": { class_type: "KSampler", inputs: { text: "hello" } } })], "ignored.json", {
      type: "application/json",
    });

    formData.append("files", file, "folder/sub-folder/my-workflow.json");
    formData.append("name:folder/sub-folder/my-workflow.json", "Custom Hero Workflow");
    formData.append("characterId", "character-1");
    formData.append("sessionId", "session-1");

    const response = await POST(new Request("http://localhost/api/comfyui/custom-workflows/import", {
      method: "POST",
      body: formData,
    }) as any);

    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.createdWorkflows).toHaveLength(1);
    expect(payload.createdWorkflows[0].name).toBe("Custom Hero Workflow");

    expect(storeMocks.createCustomComfyUIWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Custom Hero Workflow",
        description: "Imported from my-workflow.json",
      })
    );

    expect(characterMocks.updateCharacter).toHaveBeenCalledWith(
      "character-1",
      expect.objectContaining({
        metadata: expect.objectContaining({
          customComfyUIWorkflowIds: expect.arrayContaining(["wf_existing", "wf_1"]),
          enabledTools: expect.arrayContaining(["existing_tool", "customComfyUI_wf_1"]),
        }),
      })
    );

    expect(dbMocks.updateSession).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        metadata: expect.objectContaining({
          discoveredTools: expect.objectContaining({
            toolNames: expect.arrayContaining(["existing_tool", "customComfyUI_wf_1"]),
          }),
        }),
      })
    );
  });

  it("uses basename for auto names and suffixes duplicates", async () => {
    storeMocks.listCustomComfyUIWorkflows.mockResolvedValue([
      { name: "Cool Workflow" },
    ]);

    const formData = new FormData();
    const file = new File([JSON.stringify({ "1": { class_type: "KSampler", inputs: { text: "hello" } } })], "ignored.json", {
      type: "application/json",
    });

    formData.append("files", file, "nested/path/cool-workflow.json");

    const response = await POST(new Request("http://localhost/api/comfyui/custom-workflows/import", {
      method: "POST",
      body: formData,
    }) as any);

    expect(response.status).toBe(200);

    expect(storeMocks.createCustomComfyUIWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Cool Workflow 2",
      })
    );
  });
});
