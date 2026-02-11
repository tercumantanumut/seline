import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Set environment variables BEFORE importing the module
process.env.STYLY_AI_API_KEY = "test-api-key";
process.env.WAN22_VIDEO_ENDPOINT = "https://example.test/models/wan-2-2-video/predict";

import {
  callWan22Video,
  isAsyncResult,
  type Wan22VideoInput,
  type Wan22VideoSyncResult,
  type Wan22VideoAsyncResult,
} from "@/lib/ai/wan22-video-client";

// Mock the S3 client
vi.mock("@/lib/s3/client", () => ({
  uploadBase64Video: vi.fn().mockResolvedValue({
    key: "styly-agent/test-session/generated/mock-video.mp4",
    url: "https://cdn.example.com/styly-agent/test-session/generated/mock-video.mp4",
  }),
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("WAN 2.2 Video Client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure API key is set for each test
    process.env.STYLY_AI_API_KEY = "test-api-key";
  });

  describe("isAsyncResult", () => {
    it("should return true for async results", () => {
      const asyncResult: Wan22VideoAsyncResult = {
        jobId: "job-123",
        status: "processing",
        statusUrl: "https://example.test/jobs/job-123",
      };
      expect(isAsyncResult(asyncResult)).toBe(true);
    });

    it("should return false for sync results", () => {
      const syncResult: Wan22VideoSyncResult = {
        videos: [{ url: "https://example.com/video.mp4", format: "mp4", fps: 21, duration: 2 }],
        timeTaken: 30.5,
      };
      expect(isAsyncResult(syncResult)).toBe(false);
    });
  });

  describe("callWan22Video - Input Validation", () => {
    it("should throw error when neither image_url nor base64_image is provided", async () => {
      const input: Wan22VideoInput = {
        positive: "Camera pans left",
      };

      await expect(callWan22Video(input, "test-session-id")).rejects.toThrow(
        "Either image_url or base64_image must be provided"
      );
    });
  });

  describe("callWan22Video - Using image_url", () => {
    it("should generate video from image URL with default parameters", async () => {
      // Mock the image URL fetch
      const mockImageBuffer = Buffer.from("fake-image-data");
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("example.com/source-image")) {
          return {
            ok: true,
            arrayBuffer: async () => mockImageBuffer.buffer,
          };
        }
        // API call
        return {
          ok: true,
          json: async () => ({
            result: "base64-video-data",
            time_taken: 30.5,
            metadata: { request_id: "req-789" },
          }),
        };
      });

      const input: Wan22VideoInput = {
        image_url: "https://example.com/source-image.png",
        positive: "Character waves hand, camera slowly zooms in",
      };

      const result = await callWan22Video(input, "test-session-id");

      expect(isAsyncResult(result)).toBe(false);
      if (!isAsyncResult(result)) {
        expect(result.videos).toHaveLength(1);
        expect(result.videos[0].format).toBe("mp4");
        expect(result.videos[0].fps).toBe(21);
        expect(result.videos[0].duration).toBe(2);
        expect(result.timeTaken).toBe(30.5);
      }
    });
  });

  describe("callWan22Video - Using base64_image", () => {
    it("should generate video from base64 image", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: "base64-video-data",
          time_taken: 25.0,
        }),
      });

      const input: Wan22VideoInput = {
        base64_image: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        positive: "Subtle breathing motion",
      };

      const result = await callWan22Video(input, "test-session-id");

      expect(isAsyncResult(result)).toBe(false);
      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.base64_image).toBeDefined();
    });

    it("should strip data URL prefix from base64 image", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: "base64-video", time_taken: 20.0 }),
      });

      const input: Wan22VideoInput = {
        base64_image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAE=",
        positive: "Wind blowing through hair",
      };

      await callWan22Video(input, "test-session-id");

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.base64_image).not.toContain("data:image");
    });
  });

  describe("callWan22Video - Custom Settings", () => {
    it("should use custom FPS setting", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: "base64-video", time_taken: 20.0 }),
      });

      const input: Wan22VideoInput = {
        base64_image: "base64data",
        positive: "Smooth motion",
        fps: 30,
      };

      const result = await callWan22Video(input, "test-session-id");

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.fps).toBe(30);

      if (!isAsyncResult(result)) {
        expect(result.videos[0].fps).toBe(30);
      }
    });

    it("should use custom duration setting", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: "base64-video", time_taken: 40.0 }),
      });

      const input: Wan22VideoInput = {
        base64_image: "base64data",
        positive: "Longer animation",
        duration: 5,
      };

      const result = await callWan22Video(input, "test-session-id");

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.duration).toBe(5);

      if (!isAsyncResult(result)) {
        expect(result.videos[0].duration).toBe(5);
      }
    });

    it("should keep motion amplitude fixed at 1.0", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: "base64-video", time_taken: 20.0 }),
      });

      const input: Wan22VideoInput = {
        base64_image: "base64data",
        positive: "Dramatic motion",
        motion_amplitude: 3.0,
      };

      await callWan22Video(input, "test-session-id");

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.motion_amplitude).toBe(1.0);
    });

    it("should use seed for reproducibility", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: "base64-video", time_taken: 20.0 }),
      });

      const input: Wan22VideoInput = {
        base64_image: "base64data",
        positive: "Reproducible motion",
        seed: 12345,
      };

      await callWan22Video(input, "test-session-id");

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.seed).toBe(12345);
    });

    it("should use custom negative prompt", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: "base64-video", time_taken: 20.0 }),
      });

      const input: Wan22VideoInput = {
        base64_image: "base64data",
        positive: "Smooth animation",
        negative: "jittery, flickering, distorted",
      };

      await callWan22Video(input, "test-session-id");

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.negative).toBe("jittery, flickering, distorted");
    });
  });

  describe("callWan22Video - Async Mode", () => {
    it("should return async job result when async=true", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          job_id: "video-job-789",
          status: "processing",
          status_url: "https://example.test/jobs/video-job-789",
          model_name: "wan-2-2-video",
          created_at: "2024-01-01T00:00:00Z",
        }),
      });

      const input: Wan22VideoInput = {
        base64_image: "base64data",
        positive: "Async video generation",
        async: true,
      };

      const result = await callWan22Video(input, "test-session-id");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.test/models/wan-2-2-video/predict?async=true",
        expect.any(Object)
      );

      expect(isAsyncResult(result)).toBe(true);
      if (isAsyncResult(result)) {
        expect(result.jobId).toBe("video-job-789");
        expect(result.status).toBe("processing");
        expect(result.statusUrl).toBe("https://example.test/jobs/video-job-789");
      }
    });
  });

  describe("callWan22Video - Error Handling", () => {
    it("should throw error when API key is not configured", async () => {
      delete process.env.STYLY_AI_API_KEY;

      const input: Wan22VideoInput = {
        base64_image: "base64data",
        positive: "Test video",
      };

      await expect(callWan22Video(input, "test-session-id")).rejects.toThrow(
        "STYLY_AI_API_KEY environment variable is not configured"
      );
    });

    it("should throw error on 401 unauthorized", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      });

      const input: Wan22VideoInput = {
        base64_image: "base64data",
        positive: "Test video",
      };

      await expect(callWan22Video(input, "test-session-id")).rejects.toThrow(
        "WAN 2.2 Video API authentication failed: Invalid API key"
      );
    });

    it("should throw error on 422 validation error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        text: async () => "Invalid image format",
      });

      const input: Wan22VideoInput = {
        base64_image: "invalid-base64",
        positive: "Test video",
      };

      await expect(callWan22Video(input, "test-session-id")).rejects.toThrow(
        "WAN 2.2 Video API validation error: Invalid image format"
      );
    });

    it("should throw error on 503 service unavailable", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => "Service temporarily unavailable",
      });

      const input: Wan22VideoInput = {
        base64_image: "base64data",
        positive: "Test video",
      };

      await expect(callWan22Video(input, "test-session-id")).rejects.toThrow(
        "WAN 2.2 Video API is temporarily unavailable. Please try again later."
      );
    });

    it("should throw error on other HTTP errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal server error",
      });

      const input: Wan22VideoInput = {
        base64_image: "base64data",
        positive: "Test video",
      };

      await expect(callWan22Video(input, "test-session-id")).rejects.toThrow(
        "WAN 2.2 Video API error: 500 - Internal server error"
      );
    });
  });
});
