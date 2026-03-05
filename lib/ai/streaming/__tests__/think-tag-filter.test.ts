/**
 * Tests for the think-tag stream filter.
 */

import { describe, it, expect } from "vitest";
import {
  createThinkTagFilter,
  shouldFilterThinkTags,
} from "../think-tag-filter";

// ---------------------------------------------------------------------------
// Helper: simulate streaming by feeding an array of chunks through a filter
// ---------------------------------------------------------------------------

function filterChunks(chunks: string[], config?: Parameters<typeof createThinkTagFilter>[0]): string {
  const filter = createThinkTagFilter(config);
  let output = "";
  for (const chunk of chunks) {
    output += filter.process(chunk);
  }
  output += filter.flush();
  return output;
}

// ---------------------------------------------------------------------------
// createThinkTagFilter — core state machine
// ---------------------------------------------------------------------------

describe("createThinkTagFilter", () => {
  describe("normal text passthrough", () => {
    it("passes through text with no think tags", () => {
      expect(filterChunks(["Hello, world!"])).toBe("Hello, world!");
    });

    it("passes through text with angle brackets that are not think tags", () => {
      expect(filterChunks(["Use <div> and </div> for layout"])).toBe(
        "Use <div> and </div> for layout"
      );
    });

    it("passes through empty chunks", () => {
      expect(filterChunks(["", "hello", "", "world", ""])).toBe("helloworld");
    });

    it("passes through text with less-than signs not followed by tag chars", () => {
      expect(filterChunks(["a < b and c > d"])).toBe("a < b and c > d");
    });
  });

  describe("complete <think>...</think> removal", () => {
    it("removes a complete think block in a single chunk", () => {
      expect(filterChunks(["Hello <think>reasoning here</think> world"])).toBe(
        "Hello  world"
      );
    });

    it("removes think block at the start of text", () => {
      expect(filterChunks(["<think>reasoning</think>Answer here"])).toBe(
        "Answer here"
      );
    });

    it("removes think block at the end of text", () => {
      expect(filterChunks(["Answer here<think>reasoning</think>"])).toBe(
        "Answer here"
      );
    });

    it("removes multiple think blocks", () => {
      expect(
        filterChunks(["A<think>x</think>B<think>y</think>C"])
      ).toBe("ABC");
    });
  });

  describe("partial tag across chunk boundaries", () => {
    it("handles opening tag split across two chunks", () => {
      expect(filterChunks(["Hello <thi", "nk>reasoning</think> world"])).toBe(
        "Hello  world"
      );
    });

    it("handles opening tag split character by character", () => {
      expect(
        filterChunks(["<", "t", "h", "i", "n", "k", ">", "hidden", "<", "/", "t", "h", "i", "n", "k", ">", "visible"])
      ).toBe("visible");
    });

    it("handles closing tag split across chunks", () => {
      expect(
        filterChunks(["<think>hidden</thi", "nk>visible"])
      ).toBe("visible");
    });

    it("handles think block spread across many small chunks", () => {
      const chunks = "Hello <think>internal reasoning</think> World".split("");
      expect(filterChunks(chunks)).toBe("Hello  World");
    });
  });

  describe("<thinking> variant", () => {
    it("removes <thinking>...</thinking> blocks", () => {
      expect(
        filterChunks(["Hello <thinking>deep thought</thinking> world"])
      ).toBe("Hello  world");
    });

    it("handles <thinking> split across chunks", () => {
      expect(
        filterChunks(["<thinki", "ng>hidden</thinking>visible"])
      ).toBe("visible");
    });

    it("handles </thinking> split across chunks", () => {
      expect(
        filterChunks(["<thinking>hidden</thinki", "ng>visible"])
      ).toBe("visible");
    });
  });

  describe("< character re-examination on failed prefix match", () => {
    it("re-examines < that breaks a partial open tag prefix", () => {
      // "<thi" starts matching <think>, then "<" breaks the prefix.
      // The "<" should be re-examined as a new potential tag start.
      expect(filterChunks(["<thi<think>hidden</think>visible"])).toBe(
        "<thivisible"
      );
    });

    it("re-examines < that breaks a partial close tag inside think block", () => {
      // Inside <think>, "</th" starts matching </think>, then "<" breaks it.
      // The "<" should be re-examined as a new potential close tag start.
      expect(filterChunks(["<think>abc</th<</think>def"])).toBe("def");
    });

    it("handles </th</think> where second attempt closes the block", () => {
      expect(filterChunks(["<think>abc</th</think>def"])).toBe("def");
    });
  });

  describe("nested think tags", () => {
    it("handles text that looks like nested think tags (inner ones are just content)", () => {
      // When already inside <think>, an inner <think> is just content to be stripped.
      // The first </think> ends the block.
      expect(
        filterChunks(["<think>outer <think>inner</think> after</think>visible"])
      ).toBe(" after</think>visible");
      // The state machine matches the first </think> to close the block.
      // "after</think>visible" is what remains visible — this is correct behavior
      // since true nesting is not expected from LLMs.
    });
  });

  describe("empty think blocks", () => {
    it("removes empty <think></think>", () => {
      expect(filterChunks(["before<think></think>after"])).toBe("beforeafter");
    });

    it("removes empty <thinking></thinking>", () => {
      expect(filterChunks(["before<thinking></thinking>after"])).toBe(
        "beforeafter"
      );
    });
  });

  describe("malformed/unclosed tags", () => {
    it("discards content after an unclosed <think> tag", () => {
      // Unclosed think tag — everything after it is discarded (graceful degradation).
      expect(filterChunks(["Hello <think>this never closes"])).toBe("Hello ");
    });

    it("emits partial tag prefix that never completes on flush", () => {
      // "<thi" never becomes a full tag, so flush emits it as normal text.
      expect(filterChunks(["Hello <thi"])).toBe("Hello <thi");
    });

    it("handles unclosed </think partial in INSIDE_THINK", () => {
      // Inside a think block, a partial closing tag that never completes.
      expect(filterChunks(["<think>hidden</thi"])).toBe("");
    });

    it("handles < followed by non-tag characters", () => {
      expect(filterChunks(["Hello <span>world</span>"])).toBe(
        "Hello <span>world</span>"
      );
    });
  });

  describe("interleaved think and normal content", () => {
    it("handles alternating think and text blocks", () => {
      expect(
        filterChunks([
          "A",
          "<think>",
          "hidden1",
          "</think>",
          "B",
          "<think>",
          "hidden2",
          "</think>",
          "C",
        ])
      ).toBe("ABC");
    });

    it("handles text immediately adjacent to think blocks in single chunk", () => {
      expect(
        filterChunks(["start<think>r1</think>mid<think>r2</think>end"])
      ).toBe("startmidend");
    });
  });

  describe("captureThinking option", () => {
    it("captures thinking content when enabled", () => {
      const filter = createThinkTagFilter({ captureThinking: true });
      filter.process("Hello <think>my reasoning</think> world");
      filter.flush();
      expect(filter.capturedThinking).toBe("my reasoning");
    });

    it("captures thinking from multiple blocks", () => {
      const filter = createThinkTagFilter({ captureThinking: true });
      filter.process("<think>first</think>middle<think>second</think>");
      filter.flush();
      expect(filter.capturedThinking).toBe("firstsecond");
    });

    it("does not capture thinking when disabled (default)", () => {
      const filter = createThinkTagFilter();
      filter.process("<think>hidden</think>visible");
      filter.flush();
      expect(filter.capturedThinking).toBe("");
    });
  });

  describe("tags with attributes (not exact match)", () => {
    it("passes through <think> tag with attributes unfiltered", () => {
      // Attributes break the exact tag match — `<think type="reasoning">` is not `<think>`.
      expect(
        filterChunks(['<think type="reasoning">content</think>'])
      ).toBe('<think type="reasoning">content</think>');
    });
  });

  describe("custom tag names", () => {
    it("filters custom tag names", () => {
      expect(
        filterChunks(["Hello <reasoning>deep</reasoning> world"], {
          tagNames: ["reasoning"],
        })
      ).toBe("Hello  world");
    });

    it("only filters configured tags", () => {
      expect(
        filterChunks(["<reasoning>hidden</reasoning><think>visible</think>"], {
          tagNames: ["reasoning"],
        })
      ).toBe("<think>visible</think>");
    });
  });

  describe("state tracking", () => {
    it("reports NORMAL state initially", () => {
      const filter = createThinkTagFilter();
      expect(filter.state).toBe("NORMAL");
    });

    it("reports INSIDE_THINK state after opening tag", () => {
      const filter = createThinkTagFilter();
      filter.process("<think>");
      expect(filter.state).toBe("INSIDE_THINK");
    });

    it("returns to NORMAL after complete block", () => {
      const filter = createThinkTagFilter();
      filter.process("<think>reasoning</think>");
      expect(filter.state).toBe("NORMAL");
    });
  });
});

// ---------------------------------------------------------------------------
// shouldFilterThinkTags
// ---------------------------------------------------------------------------

describe("shouldFilterThinkTags", () => {
  describe("providers that should NOT filter", () => {
    it("returns false for anthropic", () => {
      expect(shouldFilterThinkTags("anthropic")).toBe(false);
    });

    it("returns false for claudecode", () => {
      expect(shouldFilterThinkTags("claudecode")).toBe(false);
    });

    it("returns false for codex", () => {
      expect(shouldFilterThinkTags("codex")).toBe(false);
    });
  });

  describe("Ollama — always filter", () => {
    it("returns true for ollama regardless of model", () => {
      expect(shouldFilterThinkTags("ollama")).toBe(true);
      expect(shouldFilterThinkTags("ollama", "llama3.1:8b")).toBe(true);
      expect(shouldFilterThinkTags("ollama", "deepseek-r1")).toBe(true);
    });
  });

  describe("OpenRouter — model-dependent", () => {
    it("returns true for deepseek models", () => {
      expect(shouldFilterThinkTags("openrouter", "deepseek/deepseek-chat")).toBe(true);
      expect(shouldFilterThinkTags("openrouter", "deepseek/deepseek-r1")).toBe(true);
    });

    it("returns true for minimax models", () => {
      expect(shouldFilterThinkTags("openrouter", "minimax/minimax-01")).toBe(true);
    });

    it("returns true for qwq models", () => {
      expect(shouldFilterThinkTags("openrouter", "qwen/qwq-32b")).toBe(true);
    });

    it("returns true for qwen models", () => {
      expect(shouldFilterThinkTags("openrouter", "qwen/qwen-2.5-72b")).toBe(true);
    });

    it("returns false for claude models via openrouter", () => {
      expect(shouldFilterThinkTags("openrouter", "anthropic/claude-sonnet-4")).toBe(false);
    });

    it("returns false for gpt models via openrouter", () => {
      expect(shouldFilterThinkTags("openrouter", "openai/gpt-4")).toBe(false);
    });

    it("returns true when no model ID provided (conservative)", () => {
      expect(shouldFilterThinkTags("openrouter")).toBe(true);
    });
  });

  describe("other providers with model patterns", () => {
    it("returns true for antigravity with deepseek model", () => {
      expect(shouldFilterThinkTags("antigravity", "deepseek-v3")).toBe(true);
    });

    it("returns false for antigravity with non-thinking model", () => {
      expect(shouldFilterThinkTags("antigravity", "gemini-3-flash")).toBe(false);
    });

    it("returns true for kimi with r1 model pattern", () => {
      expect(shouldFilterThinkTags("kimi", "kimi-r1-preview")).toBe(true);
    });

    it("returns false for kimi without thinking model", () => {
      expect(shouldFilterThinkTags("kimi", "kimi-k2.5")).toBe(false);
    });
  });
});
