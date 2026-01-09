"use client";

import { Shell } from "@/components/layout/shell";
import { CharacterPicker } from "@/components/character-picker";
import { OnboardingGuard } from "@/components/onboarding";

export default function HomePage() {
  return (
    <OnboardingGuard>
      <Shell>
        <CharacterPicker />
      </Shell>
    </OnboardingGuard>
  );
}
