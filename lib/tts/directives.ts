/**
 * TTS Directives Parser
 *
 * Parses [[tts:...]] directives from LLM output to dynamically control voice.
 *
 * Supported directives:
 *   [[tts:provider=elevenlabs voiceId=abc123 speed=1.1]]
 *   [[tts:voice=alloy]]
 *   [[tts:off]] — disable TTS for this message
 *
 * Directives are stripped from the displayed text and applied to the TTS call.
 */

export interface TTSDirective {
  provider?: string;
  voiceId?: string;
  voice?: string;
  speed?: number;
  off?: boolean;
}

interface ParseResult {
  text: string;
  directive: TTSDirective | null;
}

const DIRECTIVE_REGEX = /\[\[tts:([^\]]*)\]\]/gi;

/**
 * Parse and strip [[tts:...]] directives from LLM output.
 * Returns the cleaned text and any TTS overrides found.
 * If multiple directives exist, they are merged (last wins).
 */
export function parseTTSDirectives(text: string): ParseResult {
  if (!text || !text.includes("[[tts:")) {
    return { text, directive: null };
  }

  let merged: TTSDirective | null = null;

  const cleaned = text.replace(DIRECTIVE_REGEX, (_match, params: string) => {
    const directive = parseParams(params.trim());
    if (directive) {
      merged = merged ? { ...merged, ...directive } : directive;
    }
    return "";
  });

  return {
    text: cleaned.replace(/\n{3,}/g, "\n\n").trim(),
    directive: merged,
  };
}

function parseParams(raw: string): TTSDirective | null {
  if (!raw) return null;

  // Handle [[tts:off]]
  if (raw.toLowerCase() === "off") {
    return { off: true };
  }

  const directive: TTSDirective = {};
  // Parse key=value pairs (space-separated)
  const pairs = raw.match(/(\w+)=([^\s]+)/g);
  if (!pairs) return null;

  for (const pair of pairs) {
    const eqIdx = pair.indexOf("=");
    const key = pair.slice(0, eqIdx).toLowerCase();
    const value = pair.slice(eqIdx + 1);

    switch (key) {
      case "provider":
        directive.provider = value;
        break;
      case "voiceid":
        directive.voiceId = value;
        break;
      case "voice":
        directive.voice = value;
        break;
      case "speed":
        directive.speed = parseFloat(value) || undefined;
        break;
    }
  }

  return Object.keys(directive).length > 0 ? directive : null;
}
