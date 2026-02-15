export type SkillsTrack = "A" | "B" | "C" | "D" | "E";

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function readPercent(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 0), 100);
}

export const SKILLS_V2_ENABLED = readBoolean(process.env.SKILLS_V2_ENABLED, true);

export const SKILLS_V2_TRACK_A = readBoolean(process.env.SKILLS_V2_TRACK_A_ENABLED, SKILLS_V2_ENABLED);
export const SKILLS_V2_TRACK_B = readBoolean(process.env.SKILLS_V2_TRACK_B_ENABLED, SKILLS_V2_ENABLED);
export const SKILLS_V2_TRACK_C = readBoolean(process.env.SKILLS_V2_TRACK_C_ENABLED, SKILLS_V2_ENABLED);
export const SKILLS_V2_TRACK_D = readBoolean(process.env.SKILLS_V2_TRACK_D_ENABLED, SKILLS_V2_ENABLED);
export const SKILLS_V2_TRACK_E = readBoolean(process.env.SKILLS_V2_TRACK_E_ENABLED, SKILLS_V2_ENABLED);

// Track-B aliases called out in Phase 2 rollout guidance.
export const ENABLE_CROSS_AGENT_COPY = readBoolean(process.env.ENABLE_CROSS_AGENT_COPY, SKILLS_V2_TRACK_B);
export const ENABLE_PUBLIC_LIBRARY = readBoolean(process.env.ENABLE_PUBLIC_LIBRARY, SKILLS_V2_TRACK_B);

export function getSkillsTrackEnabled(track: SkillsTrack): boolean {
  switch (track) {
    case "A":
      return SKILLS_V2_TRACK_A;
    case "B":
      return SKILLS_V2_TRACK_B;
    case "C":
      return SKILLS_V2_TRACK_C;
    case "D":
      return SKILLS_V2_TRACK_D;
    case "E":
      return SKILLS_V2_TRACK_E;
    default:
      return false;
  }
}

export function getTrackCohortPercent(track: SkillsTrack): number {
  return readPercent(process.env[`SKILLS_V2_TRACK_${track}_COHORT_PERCENT`], 100);
}