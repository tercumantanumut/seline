"use client";

import { useEffect, useMemo, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Shell } from "@/components/layout/shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, Loader2, Play } from "lucide-react";

type SkillStatus = "draft" | "active" | "archived";

type SkillRecord = {
  id: string;
  characterId: string;
  name: string;
  description: string | null;
  promptTemplate: string;
  toolHints: string[];
  triggerExamples: string[];
  category: string;
  status: SkillStatus;
  version: number;
};

type SkillRun = {
  runId: string;
  status: string;
  taskName: string;
  createdAt: string;
  durationMs: number | null;
  error: string | null;
};

type SkillVersion = {
  id: string;
  version: number;
  createdAt: string;
  changeReason: string | null;
};

type CharacterOption = { id: string; name: string; displayName?: string | null };

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export default function SkillDetailPage({ params }: { params: Promise<{ id: string; skillId: string }> }) {
  const { id: characterId, skillId } = use(params);
  const router = useRouter();
  const t = useTranslations("skills.detail");
  const tNew = useTranslations("skills.new");
  const tStatus = useTranslations("skills.status");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [copying, setCopying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [skill, setSkill] = useState<SkillRecord | null>(null);
  const [runs, setRuns] = useState<SkillRun[]>([]);
  const [versions, setVersions] = useState<SkillVersion[]>([]);
  const [characters, setCharacters] = useState<CharacterOption[]>([]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [promptTemplate, setPromptTemplate] = useState("");
  const [category, setCategory] = useState("general");
  const [status, setStatus] = useState<SkillStatus>("active");
  const [toolHints, setToolHints] = useState("");
  const [triggerExamples, setTriggerExamples] = useState("");
  const [copyTargetCharacterId, setCopyTargetCharacterId] = useState("");

  const loadSkill = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/skills/${skillId}?includeRuns=true&includeHistory=true`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || t("loadFailed"));

      const nextSkill = payload.skill as SkillRecord;
      const nextRuns = Array.isArray(payload.runs) ? payload.runs : [];
      const nextVersions = Array.isArray(payload.versions) ? payload.versions : [];

      setSkill(nextSkill);
      setRuns(nextRuns);
      setVersions(nextVersions);

      setName(nextSkill.name || "");
      setDescription(nextSkill.description || "");
      setPromptTemplate(nextSkill.promptTemplate || "");
      setCategory(nextSkill.category || "general");
      setStatus(nextSkill.status || "active");
      setToolHints((nextSkill.toolHints || []).join("\n"));
      setTriggerExamples((nextSkill.triggerExamples || []).join("\n"));

      await fetch("/api/skills/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType: "skill_detail_viewed", skillId: nextSkill.id, characterId: nextSkill.characterId }),
      });

      const charsRes = await fetch("/api/characters");
      if (charsRes.ok) {
        const charsPayload = await charsRes.json();
        const list = Array.isArray(charsPayload.characters) ? charsPayload.characters : [];
        setCharacters(list.filter((item: CharacterOption) => item.id !== characterId));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSkill();
  }, [skillId]);

  const canSave = useMemo(() => name.trim().length > 0 && promptTemplate.trim().length > 0, [name, promptTemplate]);

  const onSave = async () => {
    if (!canSave || saving || !skill) return;
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/skills/${skill.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          promptTemplate: promptTemplate.trim(),
          category: category.trim() || "general",
          toolHints: splitLines(toolHints),
          triggerExamples: splitLines(triggerExamples),
          status,
          expectedVersion: skill.version,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || t("saveFailed"));
      }

      setMessage(t("updatedSuccess"));
      await loadSkill();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const onRunNow = async () => {
    if (!skill || running) return;
    setRunning(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/skills/${skill.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parameters: {} }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || t("runFailed"));
      }

      // Redirect to the session where the skill is running
      if (payload.sessionId && payload.characterId) {
        router.push(`/chat/${payload.characterId}?sessionId=${payload.sessionId}`);
        return;
      }

      setMessage(t("runTriggered"));
      await loadSkill();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("runFailed"));
    } finally {
      setRunning(false);
    }
  };

  const onCopySkill = async () => {
    if (!skill || !copyTargetCharacterId || copying) return;
    setCopying(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/skills/${skill.id}/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetCharacterId: copyTargetCharacterId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || t("copyFailed"));
      }
      setMessage(t("copiedSuccess"));
      setCopyTargetCharacterId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("copyFailed"));
    } finally {
      setCopying(false);
    }
  };

  const onExportSkill = async () => {
    if (!skill || exporting) return;
    setExporting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/skills/${skill.id}/export`);
      if (!response.ok) {
        let errorMessage = t("exportFailed");
        try {
          const payload = await response.json();
          errorMessage = payload?.error || errorMessage;
        } catch {
          // Keep default export error when response is not JSON.
        }
        throw new Error(errorMessage);
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get("Content-Disposition") || "";
      const filenameMatch = contentDisposition.match(/filename="([^"]+)"/i);
      const fileName = filenameMatch?.[1] || "skill.zip";

      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);

      setMessage(t("exportSuccess"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("exportFailed"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Shell>
      <div className="mx-auto w-full max-w-6xl space-y-4 px-6 py-8">
        <Button asChild variant="ghost" className="font-mono">
          <Link href={`/agents/${characterId}/skills`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("backToSkills")}
          </Link>
        </Button>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : null}

        {error ? <p className="text-sm font-mono text-red-600">{error}</p> : null}
        {message ? <p className="text-sm font-mono text-green-700">{message}</p> : null}

        {!loading && !skill ? (
          <Card><CardContent className="pt-6 font-mono">{t("notFound")}</CardContent></Card>
        ) : null}

        {skill ? (
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <Card className="border-terminal-border">
              <CardHeader>
                <CardTitle className="font-mono">{t("title")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-mono text-terminal-dark">
                    {tNew("nameLabel")}
                    <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm" />
                  </label>
                  <label className="text-sm font-mono text-terminal-dark">
                    {tNew("categoryLabel")}
                    <input value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm" />
                  </label>
                </div>

                <label className="block text-sm font-mono text-terminal-dark">
                  {tNew("descriptionLabel")}
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 min-h-[80px] w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm" />
                </label>

                <label className="block text-sm font-mono text-terminal-dark">
                  {tNew("promptLabel")}
                  <textarea value={promptTemplate} onChange={(e) => setPromptTemplate(e.target.value)} className="mt-1 min-h-[180px] w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm" />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-mono text-terminal-dark">
                    {tNew("toolHintsLabel")}
                    <textarea value={toolHints} onChange={(e) => setToolHints(e.target.value)} className="mt-1 min-h-[110px] w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm" />
                  </label>
                  <label className="block text-sm font-mono text-terminal-dark">
                    {tNew("triggerLabel")}
                    <textarea value={triggerExamples} onChange={(e) => setTriggerExamples(e.target.value)} className="mt-1 min-h-[110px] w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm" />
                  </label>
                </div>

                <label className="block text-sm font-mono text-terminal-dark">
                  {t("statusLabel")}
                  <select value={status} onChange={(e) => setStatus(e.target.value as SkillStatus)} className="mt-1 w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm">
                    <option value="active">{tStatus("active")}</option>
                    <option value="draft">{tStatus("draft")}</option>
                    <option value="archived">{tStatus("archived")}</option>
                  </select>
                </label>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-mono">{t("version", { version: skill.version })}</Badge>
                  <Button onClick={onSave} disabled={!canSave || saving} className="font-mono">
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {t("save")}
                  </Button>
                  <Button variant="outline" onClick={onRunNow} disabled={running} className="font-mono">
                    {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                    {t("runNow")}
                  </Button>
                  <Button variant="outline" onClick={onExportSkill} disabled={exporting} className="font-mono">
                    {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    {t("export")}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="border-terminal-border">
                <CardHeader><CardTitle className="font-mono text-base">{t("copySkill")}</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  <select value={copyTargetCharacterId} onChange={(e) => setCopyTargetCharacterId(e.target.value)} className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm">
                    <option value="">{t("selectAgent")}</option>
                    {characters.map((character) => (
                      <option key={character.id} value={character.id}>{character.displayName || character.name}</option>
                    ))}
                  </select>
                  <Button onClick={onCopySkill} disabled={!copyTargetCharacterId || copying} className="w-full font-mono" variant="outline">
                    {copying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {t("copyToAgent")}
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-terminal-border">
                <CardHeader><CardTitle className="font-mono text-base">{t("runHistory")}</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {runs.length === 0 ? <p className="text-sm font-mono text-terminal-muted">{t("noRuns")}</p> : null}
                  {runs.map((run) => (
                    <div key={run.runId} className="rounded border border-terminal-border/70 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-mono text-terminal-dark truncate">{run.taskName}</span>
                        <Badge variant="outline" className="font-mono text-[10px]">{run.status}</Badge>
                      </div>
                      <p className="mt-1 text-[11px] font-mono text-terminal-muted">{new Date(run.createdAt).toLocaleString()}</p>
                      {run.durationMs != null ? <p className="text-[11px] font-mono text-terminal-muted">{run.durationMs} ms</p> : null}
                      {run.error ? <p className="text-[11px] font-mono text-red-600">{run.error}</p> : null}
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="border-terminal-border">
                <CardHeader><CardTitle className="font-mono text-base">{t("versionHistory")}</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {versions.length === 0 ? <p className="text-sm font-mono text-terminal-muted">{t("noPriorVersions")}</p> : null}
                  {versions.map((version) => (
                    <div key={version.id} className="rounded border border-terminal-border/70 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-mono text-terminal-dark">v{version.version}</span>
                        <span className="text-[11px] font-mono text-terminal-muted">{new Date(version.createdAt).toLocaleString()}</span>
                      </div>
                      {version.changeReason ? <p className="mt-1 text-[11px] font-mono text-terminal-muted">{version.changeReason}</p> : null}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        ) : null}
      </div>
    </Shell>
  );
}
