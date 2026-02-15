"use client";

import { useRouter } from "next/navigation";
import { Shell } from "@/components/layout/shell";
import { SkillLibrary } from "@/components/skills/skill-library";
import { SKILLS_V2_TRACK_B, ENABLE_PUBLIC_LIBRARY } from "@/lib/flags";

export default function SkillLibraryPage() {
  const router = useRouter();

  if (!SKILLS_V2_TRACK_B || !ENABLE_PUBLIC_LIBRARY) {
    return (
      <Shell>
        <div className="mx-auto max-w-3xl px-6 py-10 font-mono text-terminal-muted">
          Cross-agent skill library is disabled for this rollout.
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <SkillLibrary onOpenSkill={(skillId, characterId) => router.push(`/agents/${characterId}/skills/${skillId}`)} />
      </div>
    </Shell>
  );
}