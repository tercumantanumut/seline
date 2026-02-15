import { getSkillsTrackEnabled, getTrackCohortPercent, type SkillsTrack } from "@/lib/flags";

const TRACK_KEYS = ["A", "B", "C", "D", "E"] as const;

export type SkillsTrackKey = SkillsTrack;

function hashToPercent(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash % 100;
}

export interface SkillsRolloutState {
  track: SkillsTrackKey;
  enabled: boolean;
  cohortPercent: number;
  inCohort: boolean;
}

export function getSkillsRolloutState(track: SkillsTrackKey, userId: string): SkillsRolloutState {
  const enabled = getSkillsTrackEnabled(track);
  const cohortPercent = getTrackCohortPercent(track);
  const inCohort = hashToPercent(`${track}:${userId}`) < cohortPercent;

  return {
    track,
    enabled,
    cohortPercent,
    inCohort,
  };
}

export function assertTrackAvailable(track: SkillsTrackKey, userId: string): SkillsRolloutState {
  const state = getSkillsRolloutState(track, userId);
  if (!state.enabled) {
    throw new Error(`Track ${track} is disabled by feature flag.`);
  }
  if (!state.inCohort) {
    throw new Error(`Track ${track} is not available for this rollout cohort yet.`);
  }
  return state;
}

export function getAllTrackStates(userId: string): SkillsRolloutState[] {
  return TRACK_KEYS.map((track) => getSkillsRolloutState(track, userId));
}