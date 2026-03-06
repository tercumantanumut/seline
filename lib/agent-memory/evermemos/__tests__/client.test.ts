import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EverMemOSClient } from "../client";
import type { EverMemOSConfig } from "../types";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeConfig(overrides?: Partial<EverMemOSConfig>): EverMemOSConfig {
  return {
    serverUrl: "http://localhost:8765",
    enabled: true,
    timeout: 5000,
    ...overrides,
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: { "Content-Type": "application/json" },
  });
}

describe("EverMemOSClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // search
  // =========================================================================
  describe("search", () => {
    it("returns results on successful search", async () => {
      const entries = [
        { id: "m1", content: "User prefers dark mode", category: "visual_preferences", createdAt: "2025-01-01T00:00:00Z", score: 0.95 },
        { id: "m2", content: "Always use TypeScript", category: "workflow_patterns", createdAt: "2025-01-02T00:00:00Z", score: 0.8 },
      ];
      mockFetch.mockResolvedValueOnce(jsonResponse({ entries, totalResults: 2 }));

      const client = new EverMemOSClient(makeConfig());
      const result = await client.search("dark mode");

      expect(result.query).toBe("dark mode");
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].id).toBe("m1");
      expect(result.totalResults).toBe(2);

      // Verify the fetch call
      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("http://localhost:8765/search");
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body as string)).toEqual({ query: "dark mode" });
    });

    it("passes search options in the request body", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ entries: [], totalResults: 0 }));

      const client = new EverMemOSClient(makeConfig());
      await client.search("test", { limit: 5, category: "domain_knowledge", agentId: "agent-1" });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body).toEqual({
        query: "test",
        limit: 5,
        category: "domain_knowledge",
        agentId: "agent-1",
      });
    });

    it("returns empty result when disabled", async () => {
      const client = new EverMemOSClient(makeConfig({ enabled: false }));
      const result = await client.search("anything");

      expect(result.entries).toHaveLength(0);
      expect(result.query).toBe("anything");
      expect(result.totalResults).toBe(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("returns empty result on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

      const client = new EverMemOSClient(makeConfig());
      const result = await client.search("test query");

      expect(result.entries).toHaveLength(0);
      expect(result.query).toBe("test query");
      expect(result.totalResults).toBe(0);
    });

    it("returns empty result on server error (500)", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ error: "Internal Server Error" }, 500));

      const client = new EverMemOSClient(makeConfig());
      const result = await client.search("test query");

      expect(result.entries).toHaveLength(0);
      expect(result.totalResults).toBe(0);
    });

    it("handles timeout gracefully", async () => {
      // Simulate a fetch that never resolves within timeout
      mockFetch.mockImplementationOnce(
        (_url: string, init: RequestInit) =>
          new Promise((resolve, reject) => {
            const signal = init.signal;
            if (signal) {
              signal.addEventListener("abort", () => {
                reject(new DOMException("The operation was aborted.", "AbortError"));
              });
            }
            // Never resolve -- rely on abort
          })
      );

      const client = new EverMemOSClient(makeConfig({ timeout: 50 }));
      const result = await client.search("slow query");

      expect(result.entries).toHaveLength(0);
      expect(result.totalResults).toBe(0);
    }, 10000);

    it("handles missing entries field in response", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ totalResults: 0 }));

      const client = new EverMemOSClient(makeConfig());
      const result = await client.search("test");

      expect(result.entries).toHaveLength(0);
    });
  });

  // =========================================================================
  // store
  // =========================================================================
  describe("store", () => {
    it("returns the stored entry on success", async () => {
      const storedEntry = {
        id: "new-1",
        content: "Remember to use dark mode",
        category: "visual_preferences",
        createdAt: "2025-01-01T00:00:00Z",
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(storedEntry));

      const client = new EverMemOSClient(makeConfig());
      const result = await client.store({
        content: "Remember to use dark mode",
        category: "visual_preferences",
        agentId: "agent-1",
      });

      expect(result.id).toBe("new-1");
      expect(result.content).toBe("Remember to use dark mode");
      expect(result.category).toBe("visual_preferences");

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.content).toBe("Remember to use dark mode");
      expect(body.category).toBe("visual_preferences");
      expect(body.agentId).toBe("agent-1");
    });

    it("returns fallback entry when disabled", async () => {
      const client = new EverMemOSClient(makeConfig({ enabled: false }));
      const result = await client.store({ content: "test memory" });

      expect(result.id).toBe("");
      expect(result.content).toBe("test memory");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("returns fallback entry on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network failure"));

      const client = new EverMemOSClient(makeConfig());
      const result = await client.store({ content: "test memory", category: "domain_knowledge" });

      expect(result.id).toBe("");
      expect(result.content).toBe("test memory");
      expect(result.category).toBe("domain_knowledge");
    });

    it("returns fallback entry on server error (500)", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ error: "Internal error" }, 500));

      const client = new EverMemOSClient(makeConfig());
      const result = await client.store({ content: "test memory" });

      expect(result.id).toBe("");
      expect(result.content).toBe("test memory");
    });

    it("handles malformed store response by falling back to request data", async () => {
      // Server returns unexpected shape without standard fields
      mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

      const client = new EverMemOSClient(makeConfig());
      const result = await client.store({
        content: "Remember dark mode",
        category: "visual_preferences",
        metadata: { source: "test" },
      });

      // Should get a valid entry using request data as fallback
      expect(result.id).toBeTruthy(); // crypto.randomUUID() fallback
      expect(result.id).not.toBe("");
      expect(result.content).toBe("Remember dark mode");
      expect(result.category).toBe("visual_preferences");
      expect(result.metadata).toEqual({ source: "test" });
      expect(result.createdAt).toBeTruthy();
    });
  });

  // =========================================================================
  // healthCheck
  // =========================================================================
  describe("healthCheck", () => {
    it("returns true when server is healthy", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ status: "ok" }));

      const client = new EverMemOSClient(makeConfig());
      const result = await client.healthCheck();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("http://localhost:8765/health");
      expect(init.method).toBe("GET");
    });

    it("returns false when disabled", async () => {
      const client = new EverMemOSClient(makeConfig({ enabled: false }));
      const result = await client.healthCheck();

      expect(result).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("returns false on server error", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 503));

      const client = new EverMemOSClient(makeConfig());
      const result = await client.healthCheck();

      expect(result).toBe(false);
    });

    it("returns false on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

      const client = new EverMemOSClient(makeConfig());
      const result = await client.healthCheck();

      expect(result).toBe(false);
    });

    it("returns false on timeout", async () => {
      mockFetch.mockImplementationOnce(
        (_url: string, init: RequestInit) =>
          new Promise((resolve, reject) => {
            const signal = init.signal;
            if (signal) {
              signal.addEventListener("abort", () => {
                reject(new DOMException("The operation was aborted.", "AbortError"));
              });
            }
          })
      );

      const client = new EverMemOSClient(makeConfig({ timeout: 50 }));
      const result = await client.healthCheck();

      expect(result).toBe(false);
    }, 10000);
  });

  // =========================================================================
  // isEnabled
  // =========================================================================
  describe("isEnabled", () => {
    it("returns true when enabled", () => {
      const client = new EverMemOSClient(makeConfig({ enabled: true }));
      expect(client.isEnabled()).toBe(true);
    });

    it("returns false when disabled", () => {
      const client = new EverMemOSClient(makeConfig({ enabled: false }));
      expect(client.isEnabled()).toBe(false);
    });
  });

  // =========================================================================
  // URL normalization
  // =========================================================================
  describe("URL normalization", () => {
    it("strips trailing slashes from server URL", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ status: "ok" }));

      const client = new EverMemOSClient(makeConfig({ serverUrl: "http://localhost:8765///" }));
      await client.healthCheck();

      expect(mockFetch.mock.calls[0][0]).toBe("http://localhost:8765/health");
    });
  });
});
