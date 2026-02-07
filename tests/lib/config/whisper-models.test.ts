import { describe, expect, it } from "vitest";
import {
  WHISPER_MODELS,
  DEFAULT_WHISPER_MODEL,
  getWhisperModel,
  type WhisperModelInfo,
} from "@/lib/config/whisper-models";

describe("Whisper Model Registry", () => {
  // ── Registry structure ─────────────────────────────────────────────────

  describe("WHISPER_MODELS registry", () => {
    it("contains at least 4 models", () => {
      expect(WHISPER_MODELS.length).toBeGreaterThanOrEqual(4);
    });

    it("has unique IDs for all models", () => {
      const ids = WHISPER_MODELS.map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("all models have required fields", () => {
      for (const model of WHISPER_MODELS) {
        expect(model.id).toBeTruthy();
        expect(model.name).toBeTruthy();
        expect(model.size).toBeTruthy();
        expect(["en", "multilingual"]).toContain(model.language);
        expect(model.description).toBeTruthy();
        expect(model.hfRepo).toBeTruthy();
        expect(model.hfFile).toBeTruthy();
      }
    });

    it("all HuggingFace files end with .bin", () => {
      for (const model of WHISPER_MODELS) {
        expect(model.hfFile).toMatch(/\.bin$/);
      }
    });

    it("all models reference ggerganov/whisper.cpp repo", () => {
      for (const model of WHISPER_MODELS) {
        expect(model.hfRepo).toBe("ggerganov/whisper.cpp");
      }
    });

    it("has exactly one recommended model", () => {
      const recommended = WHISPER_MODELS.filter((m) => m.recommended);
      expect(recommended).toHaveLength(1);
    });

    it("includes both English-only and multilingual models", () => {
      const english = WHISPER_MODELS.filter((m) => m.language === "en");
      const multilingual = WHISPER_MODELS.filter((m) => m.language === "multilingual");
      expect(english.length).toBeGreaterThan(0);
      expect(multilingual.length).toBeGreaterThan(0);
    });
  });

  // ── Specific models ────────────────────────────────────────────────────

  describe("specific models", () => {
    it("includes ggml-tiny.en (recommended default)", () => {
      const model = WHISPER_MODELS.find((m) => m.id === "ggml-tiny.en");
      expect(model).toBeDefined();
      expect(model!.recommended).toBe(true);
      expect(model!.language).toBe("en");
      expect(model!.hfFile).toBe("ggml-tiny.en.bin");
    });

    it("includes ggml-base.en", () => {
      const model = WHISPER_MODELS.find((m) => m.id === "ggml-base.en");
      expect(model).toBeDefined();
      expect(model!.language).toBe("en");
    });

    it("includes ggml-small.en (largest English model)", () => {
      const model = WHISPER_MODELS.find((m) => m.id === "ggml-small.en");
      expect(model).toBeDefined();
      expect(model!.size).toContain("466");
    });

    it("includes multilingual tiny model", () => {
      const model = WHISPER_MODELS.find((m) => m.id === "ggml-tiny");
      expect(model).toBeDefined();
      expect(model!.language).toBe("multilingual");
    });
  });

  // ── DEFAULT_WHISPER_MODEL ──────────────────────────────────────────────

  describe("DEFAULT_WHISPER_MODEL", () => {
    it("is set to ggml-tiny.en", () => {
      expect(DEFAULT_WHISPER_MODEL).toBe("ggml-tiny.en");
    });

    it("corresponds to a model in the registry", () => {
      const model = WHISPER_MODELS.find((m) => m.id === DEFAULT_WHISPER_MODEL);
      expect(model).toBeDefined();
    });

    it("is the recommended model", () => {
      const model = WHISPER_MODELS.find((m) => m.id === DEFAULT_WHISPER_MODEL);
      expect(model!.recommended).toBe(true);
    });
  });

  // ── getWhisperModel ────────────────────────────────────────────────────

  describe("getWhisperModel", () => {
    it("returns model info for valid ID", () => {
      const model = getWhisperModel("ggml-tiny.en");
      expect(model).toBeDefined();
      expect(model!.id).toBe("ggml-tiny.en");
      expect(model!.name).toBe("Tiny (English)");
    });

    it("returns model info for multilingual model", () => {
      const model = getWhisperModel("ggml-base");
      expect(model).toBeDefined();
      expect(model!.language).toBe("multilingual");
    });

    it("returns undefined for unknown model ID", () => {
      expect(getWhisperModel("ggml-nonexistent")).toBeUndefined();
    });

    it("returns undefined for empty string", () => {
      expect(getWhisperModel("")).toBeUndefined();
    });

    it("is case-sensitive", () => {
      expect(getWhisperModel("GGML-TINY.EN")).toBeUndefined();
    });
  });

  // ── Model ordering ─────────────────────────────────────────────────────

  describe("model ordering", () => {
    it("models are ordered from smallest to largest", () => {
      // Extract numeric sizes
      const sizes = WHISPER_MODELS.map((m) => {
        const match = m.size.match(/(\d+)/);
        return match ? parseInt(match[1]) : 0;
      });

      // Each size should be >= the previous (non-strictly since pairs share sizes)
      for (let i = 1; i < sizes.length; i++) {
        expect(sizes[i]).toBeGreaterThanOrEqual(sizes[i - 1]);
      }
    });
  });
});
