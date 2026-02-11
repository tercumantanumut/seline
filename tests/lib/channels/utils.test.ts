import { describe, expect, it } from "vitest";
import { buildConversationKey, ensureChannelType, normalizeChannelText } from "@/lib/channels/utils";

describe("channel utils", () => {
  it("builds a deterministic conversation key", () => {
    expect(buildConversationKey({ connectionId: "c1", peerId: "p1" })).toBe("c1:p1:root");
    expect(buildConversationKey({ connectionId: "c1", peerId: "p1", threadId: "t1" })).toBe("c1:p1:t1");
  });

  it("normalizes incoming channel text", () => {
    expect(normalizeChannelText("  hello ")).toBe("hello");
    expect(normalizeChannelText("\n")).toBe("");
    expect(normalizeChannelText(undefined)).toBe("");
  });

  it("ensures supported channel types", () => {
    expect(ensureChannelType("whatsapp")).toBe("whatsapp");
    expect(ensureChannelType("telegram")).toBe("telegram");
    expect(ensureChannelType("slack")).toBe("slack");
    expect(ensureChannelType("discord")).toBe("discord");
    expect(() => ensureChannelType("unknown")).toThrow("Unsupported channel type");
  });
});
