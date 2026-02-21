import { beforeEach, describe, expect, it, vi } from "vitest";

const syncServiceMocks = vi.hoisted(() => ({
  getSyncFolders: vi.fn(),
}));

const commandExecutionMocks = vi.hoisted(() => ({
  executeCommandWithValidation: vi.fn(),
}));

const validatorMocks = vi.hoisted(() => ({
  validateExecutionDirectory: vi.fn(),
}));

vi.mock("@/lib/vectordb/sync-service", () => ({
  getSyncFolders: syncServiceMocks.getSyncFolders,
}));

vi.mock("@/lib/command-execution", () => ({
  executeCommandWithValidation: commandExecutionMocks.executeCommandWithValidation,
}));

vi.mock("@/lib/command-execution/validator", () => ({
  validateExecutionDirectory: validatorMocks.validateExecutionDirectory,
}));

import {
  createExecuteCommandTool,
  normalizeExecuteCommandInput,
} from "@/lib/ai/tools/execute-command-tool";

function createToolContext() {
  return {
    toolCallId: "tc-1",
    messages: [],
    abortSignal: new AbortController().signal,
  };
}

describe("execute-command-tool normalization", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    syncServiceMocks.getSyncFolders.mockResolvedValue([
      { folderPath: "C:\\workspace" },
    ]);

    // Mock path validation to pass (returns valid result with resolved path)
    validatorMocks.validateExecutionDirectory.mockResolvedValue({
      valid: true,
      resolvedPath: "C:\\workspace",
    });

    commandExecutionMocks.executeCommandWithValidation.mockResolvedValue({
      success: true,
      stdout: "ok",
      stderr: "",
      exitCode: 0,
      signal: null,
      executionTime: 12,
    });
  });

  it("normalizes inline python -c from single command string", () => {
    const normalized = normalizeExecuteCommandInput(
      "python -c from math import sin;print(sin(0))",
      []
    );

    expect(normalized).toEqual({
      command: "python",
      args: ["-c", "from math import sin;print(sin(0))"],
    });
  });

  it("normalizes split python -c script args into one script argument", () => {
    const normalized = normalizeExecuteCommandInput("python", [
      "-c",
      "from",
      "math",
      "import",
      "sin;print(sin(0))",
    ]);

    expect(normalized).toEqual({
      command: "python",
      args: ["-c", "from math import sin;print(sin(0))"],
    });
  });

  it("keeps non-python commands unchanged", () => {
    const normalized = normalizeExecuteCommandInput("git", ["status"]);

    expect(normalized).toEqual({
      command: "git",
      args: ["status"],
    });
  });

  it("applies normalization before executeCommandWithValidation", async () => {
    const tool = createExecuteCommandTool({
      sessionId: "sess-1",
      characterId: "char-1",
    });

    await tool.execute(
      {
        command: "python -c from math import sin;print(sin(0))",
      },
      createToolContext()
    );

    expect(commandExecutionMocks.executeCommandWithValidation).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "python",
        // The tool may wrap the `-c` payload in quotes on Windows for compatibility.
        args: ["-c", expect.any(String)],
        cwd: "C:\\workspace",
        characterId: "char-1",
      }),
      ["C:\\workspace"]
    );

    const call = commandExecutionMocks.executeCommandWithValidation.mock.calls[0]?.[0];
    expect(call.args[1]).toContain("from math import sin;print(sin(0))");
  });

  it("resolves ${CLAUDE_PLUGIN_ROOT} command placeholders from local plugin folders", async () => {
    const tool = createExecuteCommandTool({
      sessionId: "sess-1",
      characterId: "char-1",
    });

    await tool.execute(
      {
        command: "${CLAUDE_PLUGIN_ROOT}/scripts/setup-ralph-loop.sh",
      },
      createToolContext()
    );

    expect(commandExecutionMocks.executeCommandWithValidation).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.stringMatching(/test_plugins[\\/]ralph-loop[\\/]scripts[\\/]setup-ralph-loop\.sh/),
      }),
      ["C:\\workspace"]
    );
  });
});
