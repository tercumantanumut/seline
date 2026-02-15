"use client";

import { use } from "react";
import Link from "next/link";
import { Shell } from "@/components/layout/shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

export default function NewSkillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: characterId } = use(params);
  const t = useTranslations("skills");

  return (
    <Shell>
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <Button asChild variant="ghost" className="mb-4 font-mono">
          <Link href={`/agents/${characterId}/skills`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Skills
          </Link>
        </Button>

        <Card className="border-terminal-border">
          <CardHeader>
            <CardTitle className="font-mono text-terminal-dark">{t("title")}</CardTitle>
            <CardDescription className="font-mono">
              Manual skill creation is optional in V1. The primary flow is: run a task in chat and say "save this as a skill".
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-terminal-border/70 bg-terminal-cream/50 p-4 text-sm font-mono text-terminal-muted">
              <p className="flex items-center gap-2 text-terminal-dark">
                <Sparkles className="h-4 w-4 text-terminal-green" />
                Tip: use chat-first creation for best results.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </Shell>
  );
}
