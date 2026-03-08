import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SentenceSplitter, StableStreamingLifecycle, StreamingTTSQueue } from "@/lib/voice/streaming-tts";

describe("SentenceSplitter", () => {
  it("holds short sentences until more prose arrives, then flushes trailing text", () => {
    const sentences: string[] = [];
    const splitter = new SentenceSplitter((sentence) => {
      sentences.push(sentence);
    });

    splitter.feed("Hello world. This is streamed");
    splitter.feed(" text without punctuation yet");
    splitter.feed(". Final tail");
    splitter.flush();

    expect(sentences).toEqual([
      "Hello world. This is streamed text without punctuation yet.",
      "Final tail",
    ]);
  });

  it("skips fenced code blocks while preserving surrounding prose on flush", () => {
    const sentences: string[] = [];
    const splitter = new SentenceSplitter((sentence) => {
      sentences.push(sentence);
    });

    splitter.feed("Intro sentence. ```ts\nconst a = 1;\n```");
    splitter.feed(" After code block.");
    splitter.flush();

    expect(sentences).toEqual(["Intro sentence. After code block."]);
  });
});

describe("StreamingTTSQueue", () => {
  const createObjectURL = vi.fn<(blob: Blob) => string>();
  const revokeObjectURL = vi.fn<(url: string) => void>();
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    createObjectURL.mockImplementation(() => `blob:${Math.random().toString(36).slice(2)}`);
    revokeObjectURL.mockReset();
    fetchMock.mockReset();

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("plays queued sentences sequentially", async () => {
    const playbackOrder: string[] = [];
    const releasePlayback: Array<() => void> = [];

    fetchMock.mockImplementation(async () => {
      const blob = new Blob(["audio"], { type: "audio/mpeg" });
      return new Response(blob, { status: 200 });
    });

    const queue = new StreamingTTSQueue(async (blobUrl) => {
      playbackOrder.push(blobUrl);
      await new Promise<void>((resolve) => {
        releasePlayback.push(resolve);
      });
    });

    queue.enqueue("First sentence.");
    queue.enqueue("Second sentence.");

    await vi.waitFor(() => {
      expect(playbackOrder).toHaveLength(1);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    releasePlayback[0]();

    await vi.waitFor(() => {
      expect(playbackOrder).toHaveLength(2);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    releasePlayback[1]();

    await vi.waitFor(() => {
      expect(revokeObjectURL).toHaveBeenCalledTimes(2);
    });
  });

  it("drops stale playback after reset while allowing new sentences", async () => {
    let resolveFirstFetch: ((value: Response) => void) | null = null;

    fetchMock
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveFirstFetch = resolve;
          }),
      )
      .mockImplementation(async () => {
        const blob = new Blob(["fresh"], { type: "audio/mpeg" });
        return new Response(blob, { status: 200 });
      });

    const played: string[] = [];
    const queue = new StreamingTTSQueue(async (blobUrl) => {
      played.push(blobUrl);
    });

    queue.enqueue("Old sentence.");
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    queue.reset();
    queue.enqueue("Fresh sentence.");

    resolveFirstFetch?.(new Response(new Blob(["stale"], { type: "audio/mpeg" }), { status: 200 }));

    await vi.waitFor(() => {
      expect(played).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const freshBlobUrl = played[0];
    expect(createObjectURL).toHaveBeenLastCalledWith(expect.any(Blob));
    expect(typeof freshBlobUrl).toBe("string");
    expect(revokeObjectURL).toHaveBeenCalledWith(freshBlobUrl);
  });
});


describe("StableStreamingLifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not end the stream during a brief idle gap", () => {
    const onStart = vi.fn();
    const onStableEnd = vi.fn();
    const lifecycle = new StableStreamingLifecycle({
      onStart,
      onStableEnd,
      settleDelayMs: 750,
    });

    lifecycle.update(true);
    lifecycle.update(false);
    vi.advanceTimersByTime(500);
    lifecycle.update(true);
    vi.advanceTimersByTime(1000);

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStableEnd).not.toHaveBeenCalled();
  });

  it("ends the stream after the idle gap stays stable", () => {
    const onStart = vi.fn();
    const onStableEnd = vi.fn();
    const lifecycle = new StableStreamingLifecycle({
      onStart,
      onStableEnd,
      settleDelayMs: 750,
    });

    lifecycle.update(true);
    lifecycle.update(false);
    vi.advanceTimersByTime(749);
    expect(onStableEnd).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStableEnd).toHaveBeenCalledTimes(1);
  });
});
