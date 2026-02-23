import { beforeEach, describe, expect, it, vi } from "vitest";

const aiMocks = vi.hoisted(() => ({
  generateText: vi.fn(async () => ({ text: "Session title" })),
}));

const resolverMocks = vi.hoisted(() => ({
  resolveSessionUtilityModel: vi.fn(() => ({ id: "session-utility" })),
  getSessionProviderTemperature: vi.fn(() => 0.4),
}));

const dbMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  updateSession: vi.fn(async () => ({})),
}));

vi.mock("ai", () => ({ generateText: aiMocks.generateText }));
vi.mock("@/lib/ai/session-model-resolver", () => resolverMocks);
vi.mock("@/lib/db/queries", () => dbMocks);

import { generateSessionTitle } from "@/lib/ai/title-generator";

describe("generateSessionTitle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses session metadata to resolve utility model and provider temperature", async () => {
    dbMocks.getSession.mockResolvedValue({
      id: "session-1",
      metadata: {
        sessionProvider: "codex",
        sessionUtilityModel: "gpt-5.3-codex-medium",
      },
    });

    await generateSessionTitle("session-1", "Find utility model issue root cause");

    expect(dbMocks.getSession).toHaveBeenCalledWith("session-1");
    expect(resolverMocks.resolveSessionUtilityModel).toHaveBeenCalledWith({
      sessionProvider: "codex",
      sessionUtilityModel: "gpt-5.3-codex-medium",
    });
    expect(resolverMocks.getSessionProviderTemperature).toHaveBeenCalledWith(
      {
        sessionProvider: "codex",
        sessionUtilityModel: "gpt-5.3-codex-medium",
      },
      0.4
    );
    expect(aiMocks.generateText).toHaveBeenCalled();
    expect(dbMocks.updateSession).toHaveBeenCalledWith("session-1", { title: "Session title" });
  });

  it("stops when session does not exist", async () => {
    dbMocks.getSession.mockResolvedValue(null);

    await generateSessionTitle("session-1", "Investigate behavior");

    expect(aiMocks.generateText).not.toHaveBeenCalled();
    expect(dbMocks.updateSession).not.toHaveBeenCalled();
  });
});
