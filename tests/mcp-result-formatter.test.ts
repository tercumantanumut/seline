import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  saveBase64Image: vi.fn().mockResolvedValue({
    url: "/api/media/test.png",
    localPath: "session/generated/test.png",
  }),
  saveBase64Video: vi.fn().mockResolvedValue({
    url: "/api/media/test.mp4",
    localPath: "session/generated/test.mp4",
  }),
}));

vi.mock("@/lib/storage/local-storage", () => ({
  saveBase64Image: mocks.saveBase64Image,
  saveBase64Video: mocks.saveBase64Video,
}));

import { formatMCPToolResult } from "@/lib/mcp/result-formatter";

describe("formatMCPToolResult", () => {
  it("converts MCP image data URLs to stored URLs", async () => {
    const result = {
      content: [
        {
          type: "image",
          data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA",
          mimeType: "image/png",
        },
        { type: "text", text: "Screenshot captured" },
      ],
    };

    const formatted = await formatMCPToolResult(
      "chrome-devtools",
      "capture_screenshot",
      result,
      false,
      { sessionId: "session-1" }
    );

    expect(mocks.saveBase64Image).toHaveBeenCalledTimes(1);
    expect(formatted.images).toEqual([{ url: "/api/media/test.png" }]);
    expect(JSON.stringify(formatted)).not.toContain("base64,");
  });
});
