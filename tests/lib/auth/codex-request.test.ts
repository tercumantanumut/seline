import { describe, expect, it } from "vitest";

import { transformCodexRequest } from "@/lib/auth/codex-request";

describe("transformCodexRequest", () => {
  it("strips leaked internal fallback text and reconstructs orphaned outputs structurally", async () => {
    const body = {
      model: "gpt-5-codex",
      input: [
        {
          type: "message",
          role: "assistant",
          content:
            '[Previous tool result; call_id=call_old]: {"status":"success","stdout":"..." }',
        },
        {
          type: "function_call_output",
          call_id: "call_orphan",
          name: "localGrep",
          output: { status: "success", matchCount: 3 },
        },
      ],
    } as Record<string, any>;

    const transformed = await transformCodexRequest(body, "");
    const input = transformed.input as Array<Record<string, unknown>>;

    expect(input).toHaveLength(2);
    expect(input[0]).toMatchObject({
      type: "function_call",
      call_id: "call_orphan",
      name: "localGrep",
    });
    expect(input[1]).toMatchObject({
      type: "function_call_output",
      call_id: "call_orphan",
      name: "localGrep",
    });
    expect(JSON.stringify(input)).not.toContain("[Previous tool result;");
  });

  it("reconstructs missing outputs without converting calls to assistant messages", async () => {
    const body = {
      model: "gpt-5-codex",
      input: [
        {
          type: "function_call",
          call_id: "call_only",
          name: "executeCommand",
          arguments: "{\"command\":\"pwd\"}",
        },
      ],
    } as Record<string, any>;

    const transformed = await transformCodexRequest(body, "");
    const input = transformed.input as Array<Record<string, unknown>>;

    expect(input).toHaveLength(2);
    expect(input[0]).toMatchObject({
      type: "function_call",
      call_id: "call_only",
    });
    expect(input[1]).toMatchObject({
      type: "function_call_output",
      call_id: "call_only",
      output: { reconstructed: true },
    });
  });
});
