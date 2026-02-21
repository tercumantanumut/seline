import { describe, expect, it } from "vitest";

import {
  addSessionMessage,
  clearSession,
  getEnhancementSession,
  getSessionMemorySignature,
  setSessionMemorySignature,
} from "@/lib/ai/prompt-enhancement-llm";

describe("prompt enhancement session isolation", () => {
  it("keeps enhancement history isolated per session key", () => {
    const sessionA = "enhance:session-a";
    const sessionB = "enhance:session-b";

    clearSession(sessionA);
    clearSession(sessionB);

    addSessionMessage(sessionA, { role: "user", content: "A1" });
    addSessionMessage(sessionA, { role: "assistant", content: "A2" });
    addSessionMessage(sessionB, { role: "user", content: "B1" });

    const storedA = getEnhancementSession(sessionA);
    const storedB = getEnhancementSession(sessionB);

    expect(storedA.id).not.toBe(storedB.id);
    expect(storedA.messages).toHaveLength(2);
    expect(storedB.messages).toHaveLength(1);
    expect(storedA.messages[0].content).toBe("A1");
    expect(storedB.messages[0].content).toBe("B1");
  });

  it("stores memory signatures per session key without cross-session bleed", () => {
    const sessionA = "enhance:session-memory-a";
    const sessionB = "enhance:session-memory-b";

    clearSession(sessionA);
    clearSession(sessionB);

    setSessionMemorySignature(sessionA, "sig-a");
    setSessionMemorySignature(sessionB, "sig-b");

    expect(getSessionMemorySignature(sessionA)).toBe("sig-a");
    expect(getSessionMemorySignature(sessionB)).toBe("sig-b");

    setSessionMemorySignature(sessionA, "sig-a-2");

    expect(getSessionMemorySignature(sessionA)).toBe("sig-a-2");
    expect(getSessionMemorySignature(sessionB)).toBe("sig-b");
  });
});
