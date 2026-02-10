import { describe, expect, it } from "vitest";
import { getChannelFormattingBlock } from "@/lib/ai/prompts/channel-formatting";

describe("getChannelFormattingBlock", () => {
  it("returns empty string for app/undefined", () => {
    expect(getChannelFormattingBlock()).toBe("");
    expect(getChannelFormattingBlock(null)).toBe("");
    expect(getChannelFormattingBlock("app")).toBe("");
  });

  it("returns Telegram plain-text guidance", () => {
    const block = getChannelFormattingBlock("telegram");
    expect(block).toContain("Delivery Channel: Telegram");
    expect(block).toContain("plain text");
    expect(block).toContain("NO Markdown");
  });

  it("returns Slack mrkdwn guidance", () => {
    const block = getChannelFormattingBlock("slack");
    expect(block).toContain("Delivery Channel: Slack");
    expect(block).toContain("Slack mrkdwn");
    expect(block).toContain("*bold*");
  });

  it("returns WhatsApp formatting guidance", () => {
    const block = getChannelFormattingBlock("whatsapp");
    expect(block).toContain("Delivery Channel: WhatsApp");
    expect(block).toContain("WhatsApp formatting");
    expect(block).toContain("Paste URLs directly");
  });

  it("returns Discord note", () => {
    const block = getChannelFormattingBlock("discord");
    expect(block).toContain("Delivery Channel: Discord");
    expect(block).toContain("standard Markdown");
  });
});
