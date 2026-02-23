/**
 * Plugin System — E2E Hook Input/Output Contract Tests
 *
 * Extracted from plugin-e2e.test.ts to keep file sizes manageable.
 * Validates the shape and serialisability of all hook input/output types.
 */

import { describe, it, expect } from "vitest";
import type {
  PreToolUseHookInput,
  PostToolUseHookInput,
  PostToolUseFailureHookInput,
  HookEventType,
} from "@/lib/plugins/types";

// =============================================================================
// E2E: Hook Input/Output Contract
// =============================================================================

describe("E2E: Hook Input/Output Contract", () => {
  it("should construct valid PreToolUseHookInput", () => {
    const input: PreToolUseHookInput = {
      hook_type: "PreToolUse",
      tool_name: "editFile",
      tool_input: { path: "/src/app.ts", content: "new code" },
      session_id: "session-123",
    };

    expect(input.hook_type).toBe("PreToolUse");
    expect(input.tool_name).toBe("editFile");
    expect(input.tool_input.path).toBe("/src/app.ts");
    expect(JSON.stringify(input)).toBeTruthy(); // Serializable
  });

  it("should construct valid PostToolUseHookInput", () => {
    const input: PostToolUseHookInput = {
      hook_type: "PostToolUse",
      tool_name: "editFile",
      tool_input: { path: "/src/app.ts" },
      tool_output: { success: true, linesChanged: 42 },
      session_id: "session-123",
    };

    expect(input.hook_type).toBe("PostToolUse");
    expect(input.tool_output).toEqual({ success: true, linesChanged: 42 });
  });

  it("should construct valid PostToolUseFailureHookInput", () => {
    const input: PostToolUseFailureHookInput = {
      hook_type: "PostToolUseFailure",
      tool_name: "editFile",
      tool_input: { path: "/nonexistent.ts" },
      error: "ENOENT: no such file or directory",
      session_id: "session-123",
    };

    expect(input.hook_type).toBe("PostToolUseFailure");
    expect(input.error).toContain("ENOENT");
  });

  it("should validate all HookEventType values", () => {
    const allEvents: HookEventType[] = [
      "SessionStart",
      "UserPromptSubmit",
      "PreToolUse",
      "PermissionRequest",
      "PostToolUse",
      "PostToolUseFailure",
      "Notification",
      "SubagentStart",
      "SubagentStop",
      "Stop",
      "TeammateIdle",
      "TaskCompleted",
      "PreCompact",
      "SessionEnd",
    ];

    expect(allEvents).toHaveLength(14);
    expect(allEvents).toContain("PreToolUse");
    expect(allEvents).toContain("PostToolUse");
    expect(allEvents).toContain("PostToolUseFailure");
  });
});
