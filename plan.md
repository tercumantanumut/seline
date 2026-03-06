# Plan: Streaming TTS — Avatar speaks during response generation

## Problem
`AutoSpeakBridge` waits for the full response to finish (`isRunning: true → false`), then sends the entire text to `/api/voice/speak` in one shot. For long responses this means 5-10 seconds of silence before audio starts.

## Goal
Avatar starts speaking ~1-2 seconds into the response, while tokens are still streaming. Sentences are synthesized and played as they complete.

## Architecture

### New utility: `lib/voice/streaming-tts.ts`

**SentenceSplitter** — buffers streaming text, emits complete sentences:
- Split on sentence boundaries: `.` `!` `?` followed by space/newline, or `\n\n`
- Skip code blocks (``` fences), markdown headers, URLs
- Minimum sentence length threshold (20 chars) to avoid tiny fragments
- `flush()` on stream end to emit remaining buffer

**StreamingTTSQueue** — manages sequential TTS playback:
- Accepts sentences via `enqueue(text)`
- Synthesizes via `POST /api/voice/speak`
- Prefetch: starts synthesizing next sentence while current is playing
- Sequential playback: sentences play in order, no overlap
- `cancel()` — stops current playback, clears queue (for interrupts)
- Returns a promise/callback for each completed audio so the caller can route to `playAudio()`

### Modified: `components/chat/chat-interface.tsx`

**Replace `AutoSpeakBridge` with `StreamingAutoSpeakBridge`**:
- Uses `useThread()` to observe the last message's streaming content
- On each content update, feeds new text delta to `SentenceSplitter`
- When splitter emits a sentence → `ttsQueue.enqueue(sentence)`
- Queue calls `playAudio(blobUrl)` for each synthesized chunk → routes to avatar via existing `AvatarAudioBridge`
- On `isRunning: false` → `splitter.flush()` to catch trailing text
- On new user message → `ttsQueue.cancel()` to stop mid-sentence

### Modified: `components/assistant-ui/voice-context.tsx`

**Add `cancelAudio()` to VoiceContext**:
- Stops current HTML5 Audio playback (or avatar speak)
- Called by StreamingAutoSpeakBridge on cancel/interrupt

## Data flow

```
Streaming tokens → SentenceSplitter → complete sentence
                                         ↓
                                   StreamingTTSQueue
                                         ↓
                              POST /api/voice/speak (sentence)
                                         ↓
                              Blob URL → playAudio()
                                         ↓
                         AvatarAudioBridge → avatar.speak(buffer)
                              (or HTML5 Audio fallback)
```

## Edge cases
- **Code blocks**: Splitter skips content inside triple backticks
- **Short responses**: If response finishes before first sentence boundary, flush catches it
- **Rapid sentences**: Queue handles backpressure — synthesizes up to 2 ahead, waits for playback
- **User interrupts**: Cancel clears the queue and stops current audio
- **Muted state**: StreamingAutoSpeakBridge respects `avatarMutedRef` — skips TTS entirely when muted
- **Tool calls mid-response**: If assistant uses tools (response pauses), splitter buffers — resumes when text continues

## Files changed
| # | File | Change |
|---|---|---|
| 1 | `lib/voice/streaming-tts.ts` | New — SentenceSplitter + StreamingTTSQueue |
| 2 | `components/chat/chat-interface.tsx` | Replace AutoSpeakBridge with StreamingAutoSpeakBridge |
| 3 | `components/assistant-ui/voice-context.tsx` | Add cancelAudio() to context |

## Test plan
- Unit tests for SentenceSplitter (sentence boundaries, code blocks, flush)
- Unit tests for StreamingTTSQueue (sequential playback, cancel, prefetch)
- Manual: send long prompt, avatar should start speaking within ~2s while text is still streaming
