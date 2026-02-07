export interface TTSOptions {
  text: string;
  voice?: string;
  speed?: number;
  /** Hint for channel-specific format optimization (e.g., "telegram" for native Opus) */
  channelHint?: string;
}

export interface TTSResult {
  audio: Buffer;
  mimeType: string;
  durationMs?: number;
}

export interface TTSProvider {
  name: string;
  synthesize(options: TTSOptions): Promise<TTSResult>;
  isAvailable(): boolean;
}
