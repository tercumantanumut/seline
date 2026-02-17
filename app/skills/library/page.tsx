"use client";

import { useRouter } from "next/navigation";
import { Shell } from "@/components/layout/shell";
import { SkillLibrary } from "@/components/skills/skill-library";

export default function SkillLibraryPage() {
  const router = useRouter();

  return (
    <Shell>
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <SkillLibrary onOpenSkill={(skillId, characterId) => router.push(`/agents/${characterId}/skills/${skillId}`)} />
      </div>
    </Shell>
  );
}
