import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAntigravityProvider } from "@/lib/ai/providers/antigravity-provider";
import * as auth from "@/lib/auth/antigravity-auth";

vi.mock("@/lib/auth/antigravity-auth", () => ({
    getAntigravityToken: vi.fn(),
    ANTIGRAVITY_CONFIG: {
        API_BASE_URL: "https://api.test",
        API_VERSION: "v1beta",
        HEADERS: {
            "User-Agent": "test-agent",
            "X-Goog-Api-Client": "test-client",
            "Client-Metadata": "test-metadata",
        },
    },
    ANTIGRAVITY_SYSTEM_INSTRUCTION: "TEST_SYSTEM_INSTRUCTION",
}));

describe("Antigravity Provider", () => {
    const mockToken = {
        access_token: "test-access-token",
        project_id: "test-project-id",
        expires_at: Date.now() + 1000 * 60 * 60,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(auth.getAntigravityToken).mockReturnValue(mockToken as any);
        // Mock global fetch
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            text: () => Promise.resolve(JSON.stringify({ response: { candidates: [{ content: { parts: [{ text: "hello" }] } }] } })),
            clone: function () { return this; },
        } as any);
    });

    it("should strip 'antigravity-' prefix and resolve model", async () => {
        const provider = createAntigravityProvider();
        if (!provider) throw new Error("Provider not created");

        const model = provider("antigravity-gemini-3-flash");
        await model.doGenerate({ input: [{ role: "user", content: [{ type: "text", text: "hi" }] }] } as any);

        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining("models/gemini-3-flash:generateContent"),
            expect.objectContaining({
                body: expect.stringContaining('"model":"gemini-3-flash"'),
            })
        );
    });

    it("should map 'gemini-3-pro' to 'gemini-3-pro-low'", async () => {
        const provider = createAntigravityProvider();
        if (!provider) throw new Error("Provider not created");

        const model = provider("gemini-3-pro");
        await model.doGenerate({ input: [{ role: "user", content: [{ type: "text", text: "hi" }] }] } as any);

        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining("models/gemini-3-pro-low:generateContent"),
            expect.objectContaining({
                body: expect.stringContaining('"model":"gemini-3-pro-low"'),
            })
        );
    });

    it("should inject 'requestType: agent' in the wrapped body", async () => {
        const provider = createAntigravityProvider();
        if (!provider) throw new Error("Provider not created");

        const model = provider("claude-sonnet-4-5");
        await model.doGenerate({ input: [{ role: "user", content: [{ type: "text", text: "hi" }] }] } as any);

        expect(global.fetch).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                body: expect.stringContaining('"requestType":"agent"'),
            })
        );
    });

    it("should inject system instructions into the request", async () => {
        const provider = createAntigravityProvider();
        if (!provider) throw new Error("Provider not created");

        const model = provider("gemini-3-flash");
        await model.doGenerate({
            input: [{ role: "user", content: [{ type: "text", text: "hi" }] }]
        } as any);

        const callArgs = vi.mocked(global.fetch).mock.calls[0];
        const body = JSON.parse(callArgs[1]!.body as string);

        expect(body.request.systemInstruction).toBeDefined();
        expect(body.request.systemInstruction.role).toBe("user");
        expect(body.request.systemInstruction.parts[0].text).toContain("TEST_SYSTEM_INSTRUCTION");
    });
});
