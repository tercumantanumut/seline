import { beforeEach, describe, expect, it, vi } from "vitest";

const aiMocks = vi.hoisted(() => ({
  generateText: vi.fn(async () => ({ text: "Enhanced prompt output" })),
}));

const resolverMocks = vi.hoisted(() => ({
  resolveSessionUtilityModel: vi.fn(() => ({ id: "session-utility" })),
  getSessionProviderTemperature: vi.fn(() => 0.3),
}));

const memoryMocks = vi.hoisted(() => ({
  formatMemoriesForPrompt: vi.fn(() => ({
    markdown: "- Keep outputs concise\n- Keep outputs concise",
    tokenEstimate: 20,
    memoryCount: 2,
  })),
}));

const vectorMocks = vi.hoisted(() => ({
  searchWithRouter: vi.fn(async () => [
    {
      relativePath: "lib/example.ts",
      text: "export function demo() { return true; }",
      chunkIndex: 0,
      score: 0.91,
      startLine: 1,
      endLine: 1,
    },
  ]),
}));

const fileTreeMocks = vi.hoisted(() => ({
  getFileTreeForAgent: vi.fn(async () => []),
  formatFileTreeCompact: vi.fn(() => ""),
}));

vi.mock("ai", () => ({ generateText: aiMocks.generateText }));
vi.mock("@/lib/ai/session-model-resolver", () => resolverMocks);
vi.mock("@/lib/agent-memory/prompt-injection", () => memoryMocks);
vi.mock("@/lib/vectordb", () => vectorMocks);
vi.mock("@/lib/vectordb/client", () => ({ isVectorDBEnabled: () => true }));
vi.mock("@/lib/vectordb/sync-service", () => ({
  getSyncFolders: vi.fn(async () => [{ id: "folder-1" }]),
}));
vi.mock("@/lib/ai/file-tree", () => fileTreeMocks);

import { clearSession } from "@/lib/ai/prompt-enhancement-llm";
import { enhancePromptWithLLM } from "@/lib/ai/prompt-enhancement-v2";

describe("enhancePromptWithLLM session-scoped memory behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearSession("enhance:session-a");
    clearSession("enhance:session-b");
  });

  it("avoids re-injecting unchanged memory in the same session", async () => {
    await enhancePromptWithLLM("Improve this task", "char-1", {
      sessionId: "session-a",
      sessionMetadata: { sessionProvider: "codex", sessionUtilityModel: "gpt-5.1-codex" },
      includeMemories: true,
    });

    await enhancePromptWithLLM("Improve this task", "char-1", {
      sessionId: "session-a",
      sessionMetadata: { sessionProvider: "codex", sessionUtilityModel: "gpt-5.1-codex" },
      includeMemories: true,
    });

    const firstPrompt = aiMocks.generateText.mock.calls[0][0].messages.at(-1).content as string;
    const secondPrompt = aiMocks.generateText.mock.calls[1][0].messages.at(-1).content as string;

    expect(firstPrompt).toContain("## User Preferences & Context");
    expect(firstPrompt.match(/- Keep outputs concise/g)?.length).toBe(1);

    expect(secondPrompt).not.toContain("## User Preferences & Context");
    expect(secondPrompt).not.toContain("- Keep outputs concise");
  });

  it("keeps memory injection isolated across different sessions", async () => {
    await enhancePromptWithLLM("Improve this task", "char-1", {
      sessionId: "session-a",
      includeMemories: true,
    });

    await enhancePromptWithLLM("Improve this task", "char-1", {
      sessionId: "session-b",
      includeMemories: true,
    });

    const firstPrompt = aiMocks.generateText.mock.calls[0][0].messages.at(-1).content as string;
    const secondPrompt = aiMocks.generateText.mock.calls[1][0].messages.at(-1).content as string;

    expect(firstPrompt).toContain("## User Preferences & Context");
    expect(secondPrompt).toContain("## User Preferences & Context");
  });

  it("resolves utility model from session metadata", async () => {
    await enhancePromptWithLLM("Improve this task", "char-1", {
      sessionId: "session-a",
      sessionMetadata: { sessionProvider: "codex", sessionUtilityModel: "gpt-5.3-codex-medium" },
      includeMemories: false,
    });

    expect(resolverMocks.resolveSessionUtilityModel).toHaveBeenCalledWith({
      sessionProvider: "codex",
      sessionUtilityModel: "gpt-5.3-codex-medium",
    });
    expect(resolverMocks.getSessionProviderTemperature).toHaveBeenCalled();
  });
});
