import {
  extractGenerativeUISpec,
  validateGenerativeUISpec,
  type GenerativeUISpec,
  type GenerativeUISpecExtractionResult,
} from "./spec";

export type GenerativeUISpecSource = "model" | "auto";

export interface GenerativeUISpecMetadata {
  valid: boolean;
  source: GenerativeUISpecSource;
  sourcePath?: string;
  nodeCount?: number;
  provider?: string;
  generatedAt: string;
  errors?: string[];
}

export interface GenerativeUIToolResultPayload {
  uiSpec?: GenerativeUISpec;
  uiSpecMeta?: GenerativeUISpecMetadata;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function getGenerativeUISpecFromResult(result: unknown): {
  spec?: GenerativeUISpec;
  meta?: GenerativeUISpecMetadata;
  extraction?: GenerativeUISpecExtractionResult;
} {
  if (!isRecord(result)) {
    return {};
  }

  const candidateSpec = result.uiSpec;
  const candidateMeta = result.uiSpecMeta;

  const validated = validateGenerativeUISpec(candidateSpec);
  const extraction = extractGenerativeUISpec(result);
  const extractedSpec = extraction.valid ? extraction.spec : undefined;
  const spec = validated.valid ? validated.spec : extractedSpec;

  const meta = isRecord(candidateMeta)
    ? (candidateMeta as unknown as GenerativeUISpecMetadata)
    : undefined;

  return { spec, meta, extraction };
}
