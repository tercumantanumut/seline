"use client";

import { useMemo, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Shell } from "@/components/layout/shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Loader2 } from "lucide-react";

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export default function NewSkillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: characterId } = use(params);
  const router = useRouter();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [promptTemplate, setPromptTemplate] = useState("");
  const [category, setCategory] = useState("general");
  const [toolHints, setToolHints] = useState("");
  const [triggerExamples, setTriggerExamples] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => name.trim().length > 0 && promptTemplate.trim().length > 0, [name, promptTemplate]);

  const handleSubmit = async () => {
    if (!canSubmit || saving) return;
    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId,
          name: name.trim(),
          description: description.trim() || undefined,
          promptTemplate: promptTemplate.trim(),
          category: category.trim() || "general",
          toolHints: splitLines(toolHints),
          triggerExamples: splitLines(triggerExamples),
          status: "active",
          sourceType: "manual",
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to create skill");
      }

      const skillId = payload?.skill?.id;
      if (typeof skillId === "string" && skillId.length > 0) {
        router.push(`/agents/${characterId}/skills/${skillId}`);
      } else {
        router.push(`/agents/${characterId}/skills`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create skill");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell>
      <div className="mx-auto w-full max-w-4xl px-6 py-8">
        <Button asChild variant="ghost" className="mb-4 font-mono">
          <Link href={`/agents/${characterId}/skills`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Skills
          </Link>
        </Button>

        <Card className="border-terminal-border">
          <CardHeader>
            <CardTitle className="font-mono text-terminal-dark">Create Skill</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-mono text-terminal-dark">
                Name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm"
                  placeholder="Weekly competitor summary"
                />
              </label>
              <label className="text-sm font-mono text-terminal-dark">
                Category
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm"
                  placeholder="marketing"
                />
              </label>
            </div>

            <label className="block text-sm font-mono text-terminal-dark">
              Description
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 min-h-[84px] w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm"
                placeholder="Summarize weekly competitor changes with concise bullets."
              />
            </label>

            <label className="block text-sm font-mono text-terminal-dark">
              Prompt Template
              <textarea
                value={promptTemplate}
                onChange={(e) => setPromptTemplate(e.target.value)}
                className="mt-1 min-h-[180px] w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm"
                placeholder="Analyze the last 7 days and provide 5 bullets max."
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-mono text-terminal-dark">
                Tool Hints (one per line)
                <textarea
                  value={toolHints}
                  onChange={(e) => setToolHints(e.target.value)}
                  className="mt-1 min-h-[110px] w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm"
                  placeholder="webSearch\nwebBrowse"
                />
              </label>
              <label className="block text-sm font-mono text-terminal-dark">
                Trigger Examples (one per line)
                <textarea
                  value={triggerExamples}
                  onChange={(e) => setTriggerExamples(e.target.value)}
                  className="mt-1 min-h-[110px] w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm"
                  placeholder="What changed with our competitors this week?"
                />
              </label>
            </div>

            {error ? <p className="text-sm font-mono text-red-600">{error}</p> : null}

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" className="font-mono" asChild>
                <Link href={`/agents/${characterId}/skills`}>Cancel</Link>
              </Button>
              <Button onClick={handleSubmit} className="font-mono" disabled={!canSubmit || saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Create Skill
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Shell>
  );
}