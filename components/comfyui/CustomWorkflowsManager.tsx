"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Braces,
  FileJson,
  Lock,
  Plus,
  Radar,
  SlidersHorizontal,
  Workflow,
  Wrench,
  Package,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { resilientFetch, resilientPost, resilientPut, resilientDelete } from "@/lib/utils/resilient-fetch";
import type { CustomComfyUIInput, CustomComfyUIOutput, CustomComfyUIWorkflow } from "@/lib/comfyui/custom/types";

const INPUT_TYPES: CustomComfyUIInput["type"][] = [
  "string",
  "number",
  "boolean",
  "image",
  "mask",
  "video",
  "json",
  "file",
];

const OUTPUT_TYPES: CustomComfyUIOutput["type"][] = ["image", "video", "file"];

function formatDefaultValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function coerceDefaultValue(value: string, type: CustomComfyUIInput["type"]): unknown {
  if (value.trim().length === 0) return undefined;
  if (type === "number") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  if (type === "boolean") {
    return value === "true";
  }
  if (type === "json") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function createInput(): CustomComfyUIInput {
  return {
    id: `new-${Date.now()}`,
    name: "",
    type: "string",
    nodeId: "",
    inputField: "",
    required: false,
    enabled: true,
  };
}

function createOutput(): CustomComfyUIOutput {
  return {
    id: `new-${Date.now()}`,
    name: "",
    type: "image",
    nodeId: "",
  };
}

interface CustomWorkflowsManagerProps {
  connectionBaseUrl: string;
  connectionHost: string;
  connectionPort: number;
  connectionUseHttps: boolean;
  connectionAutoDetect: boolean;
  onConnectionBaseUrlChange: (value: string) => void;
  onConnectionHostChange: (value: string) => void;
  onConnectionPortChange: (value: number) => void;
  onConnectionUseHttpsChange: (value: boolean) => void;
  onConnectionAutoDetectChange: (value: boolean) => void;
}

export function CustomWorkflowsManager({
  connectionBaseUrl,
  connectionHost,
  connectionPort,
  connectionUseHttps,
  connectionAutoDetect,
  onConnectionBaseUrlChange,
  onConnectionHostChange,
  onConnectionPortChange,
  onConnectionUseHttpsChange,
  onConnectionAutoDetectChange,
}: CustomWorkflowsManagerProps) {
  const t = useTranslations("comfyui.workflows");
  const [workflows, setWorkflows] = useState<CustomComfyUIWorkflow[]>([]);
  const [selectedId, setSelectedId] = useState<string>("new");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [workflowText, setWorkflowText] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [format, setFormat] = useState<"ui" | "api">("api");
  const [enabled, setEnabled] = useState(true);
  const [loadingMode, setLoadingMode] = useState<"always" | "deferred">("deferred");
  const [inputs, setInputs] = useState<CustomComfyUIInput[]>([]);
  const [outputs, setOutputs] = useState<CustomComfyUIOutput[]>([]);
  const [validateWithComfyUI, setValidateWithComfyUI] = useState(true);
  const [comfyuiBaseUrl, setComfyuiBaseUrl] = useState("");
  const [comfyuiHost, setComfyuiHost] = useState("");
  const [comfyuiPort, setComfyuiPort] = useState("");
  const [timeoutSeconds, setTimeoutSeconds] = useState("300");
  const workflowFileRef = useRef<HTMLInputElement | null>(null);

  const baseUrlPreview = (() => {
    if (connectionBaseUrl.trim()) return connectionBaseUrl.trim();
    const host = connectionHost?.trim() || "127.0.0.1";
    const port = connectionPort || 8188;
    return `${connectionUseHttps ? "https" : "http"}://${host}:${port}`;
  })();

  const selectedWorkflow = useMemo(
    () => workflows.find((workflow) => workflow.id === selectedId),
    [workflows, selectedId]
  );

  useEffect(() => {
    void loadWorkflows();
  }, []);

  useEffect(() => {
    if (!selectedWorkflow) {
      resetForm();
      return;
    }
    setName(selectedWorkflow.name);
    setDescription(selectedWorkflow.description || "");
    setFormat(selectedWorkflow.format);
    setEnabled(selectedWorkflow.enabled !== false);
    setLoadingMode(selectedWorkflow.loadingMode || "deferred");
    setInputs(selectedWorkflow.inputs || []);
    setOutputs(selectedWorkflow.outputs || []);
    setWorkflowText(JSON.stringify(selectedWorkflow.workflow, null, 2));
    setComfyuiBaseUrl(selectedWorkflow.comfyuiBaseUrl || "");
    setComfyuiHost(selectedWorkflow.comfyuiHost || "");
    setComfyuiPort(selectedWorkflow.comfyuiPort ? String(selectedWorkflow.comfyuiPort) : "");
    setTimeoutSeconds(selectedWorkflow.timeoutSeconds ? String(selectedWorkflow.timeoutSeconds) : "300");
  }, [selectedWorkflow]);

  const resetForm = () => {
    setName("");
    setDescription("");
    setFormat("api");
    setEnabled(true);
    setLoadingMode("deferred");
    setInputs([]);
    setOutputs([]);
    setWorkflowText("");
    setComfyuiBaseUrl("");
    setComfyuiHost("");
    setComfyuiPort("");
    setTimeoutSeconds("300");
  };

  const loadWorkflows = async () => {
    try {
      setLoading(true);
      const { data, error } = await resilientFetch<{ workflows?: CustomComfyUIWorkflow[] }>("/api/comfyui/custom-workflows");
      if (error) throw new Error(error);
      setWorkflows(data?.workflows || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load workflows");
    } finally {
      setLoading(false);
    }
  };

  const parseWorkflowJson = () => {
    if (!workflowText.trim()) {
      throw new Error("Workflow JSON is empty.");
    }
    return JSON.parse(workflowText) as Record<string, unknown>;
  };

  const handleAnalyze = async () => {
    try {
      const workflowJson = parseWorkflowJson();
      setAnalyzing(true);
      const { data, error: postError } = await resilientPost<{
        format: "ui" | "api";
        inputs?: CustomComfyUIInput[];
        outputs?: CustomComfyUIOutput[];
        error?: string;
      }>("/api/comfyui/custom-workflows/analyze", {
        workflow: workflowJson,
        format,
        validateWithComfyUI,
        comfyuiBaseUrl: comfyuiBaseUrl || undefined,
        comfyuiHost: comfyuiHost || undefined,
        comfyuiPort: comfyuiPort ? Number(comfyuiPort) : undefined,
      });
      if (postError || !data) {
        throw new Error(data?.error || postError || "Failed to analyze workflow");
      }
      setFormat(data.format);
      setInputs((prev) => {
        const existing = new Map<string, CustomComfyUIInput>();
        prev.forEach((item) => {
          existing.set(`${item.nodeId}:${item.inputField}`, item);
        });
        return (data.inputs || []).map((item: CustomComfyUIInput) => {
          const match = existing.get(`${item.nodeId}:${item.inputField}`);
          return match ? { ...item, enabled: match.enabled } : item;
        });
      });
      setOutputs(data.outputs || []);
      toast.success(t("analyzed"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Workflow analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleFormatJson = () => {
    try {
      if (!workflowText.trim()) return;
      const parsed = parseWorkflowJson();
      setWorkflowText(JSON.stringify(parsed, null, 2));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to format JSON");
    }
  };

  const normalizeInputs = (items: CustomComfyUIInput[]) =>
    items.map((input) => ({
      ...input,
      id: `${input.nodeId}:${input.inputField}`,
      default: coerceDefaultValue(formatDefaultValue(input.default), input.type),
      enum: input.enum?.length ? input.enum : undefined,
      enabled: input.enabled !== false,
    }));

  const normalizeOutputs = (items: CustomComfyUIOutput[]) =>
    items.map((output) => ({
      ...output,
      id: `${output.nodeId}:${output.outputField || "output"}`,
    }));

  const handleSave = async () => {
    try {
      if (!name.trim()) {
        throw new Error("Workflow name is required.");
      }
      const workflowJson = parseWorkflowJson();
      setSaving(true);
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        workflow: workflowJson,
        format,
        inputs: normalizeInputs(inputs),
        outputs: normalizeOutputs(outputs),
        enabled,
        loadingMode,
        comfyuiBaseUrl: comfyuiBaseUrl || undefined,
        comfyuiHost: comfyuiHost || undefined,
        comfyuiPort: comfyuiPort ? Number(comfyuiPort) : undefined,
        timeoutSeconds: timeoutSeconds ? Number(timeoutSeconds) : undefined,
      };

      const endpoint =
        selectedId !== "new"
          ? `/api/comfyui/custom-workflows/${selectedId}`
          : "/api/comfyui/custom-workflows";
      const saveHelper = selectedId !== "new" ? resilientPut : resilientPost;
      const { data, error: saveError } = await saveHelper<{ workflow?: { id: string }; error?: string }>(endpoint, payload);
      if (saveError || !data) {
        throw new Error(data?.error || saveError || "Failed to save workflow");
      }
      toast.success(t("saved"));
      setSelectedId(data.workflow?.id || "new");
      await loadWorkflows();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Workflow save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (selectedId === "new") return;
    try {
      setSaving(true);
      const { error: deleteError } = await resilientDelete<{ error?: string }>(`/api/comfyui/custom-workflows/${selectedId}`);
      if (deleteError) {
        throw new Error(deleteError);
      }
      toast.success(t("deleted"));
      setSelectedId("new");
      resetForm();
      await loadWorkflows();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Workflow delete failed");
    } finally {
      setSaving(false);
    }
  };

  const updateInput = (index: number, update: Partial<CustomComfyUIInput>) => {
    setInputs((prev) => prev.map((item, idx) => (idx === index ? { ...item, ...update } : item)));
  };

  const updateOutput = (index: number, update: Partial<CustomComfyUIOutput>) => {
    setOutputs((prev) => prev.map((item, idx) => (idx === index ? { ...item, ...update } : item)));
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-terminal-text">{t("createWorkflow")}</h3>
        <p className="text-sm text-terminal-muted">
          {t("createWorkflowDescription")}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-terminal-border bg-terminal-bg/60 p-4 space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-terminal-border bg-terminal-green/15 text-terminal-green">
              <Wrench className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-terminal-text">{t("connection.heading")}</p>
              <p className="text-xs text-terminal-muted">{t("connection.description")}</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-terminal-muted">{t("connection.hostLabel")}</label>
              <input
                type="text"
                value={connectionHost}
                onChange={(event) => onConnectionHostChange(event.target.value)}
                placeholder="127.0.0.1"
                className="w-full rounded border border-terminal-border bg-terminal-bg/50 px-3 py-2 text-sm text-terminal-text placeholder:text-terminal-muted/60 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-terminal-muted">{t("connection.portLabel")}</label>
              <input
                type="number"
                value={connectionPort}
                onChange={(event) => onConnectionPortChange(Number(event.target.value))}
                placeholder="8188"
                className="w-full rounded border border-terminal-border bg-terminal-bg/50 px-3 py-2 text-sm text-terminal-text placeholder:text-terminal-muted/60 focus:border-terminal-green focus:outline-none focus:ring-1 focus:ring-terminal-green"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md border border-terminal-border bg-terminal-bg/60 text-terminal-muted">
                <Lock className="h-3.5 w-3.5" />
              </div>
              <Switch
                checked={connectionUseHttps}
                onCheckedChange={onConnectionUseHttpsChange}
                className="data-[state=checked]:bg-terminal-green"
              />
              <span className="text-xs text-terminal-text">{t("connection.useHttps")}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md border border-terminal-border bg-terminal-bg/60 text-terminal-muted">
                <Radar className="h-3.5 w-3.5" />
              </div>
              <Switch
                checked={connectionAutoDetect}
                onCheckedChange={onConnectionAutoDetectChange}
                className="data-[state=checked]:bg-terminal-green"
              />
              <span className="text-xs text-terminal-text">{t("connection.autoDetect")}</span>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-terminal-muted">{t("connection.baseUrlLabel")}</label>
            <input
              type="text"
              value={baseUrlPreview}
              onChange={(event) => onConnectionBaseUrlChange(event.target.value)}
              className="w-full rounded border border-terminal-border bg-terminal-bg/40 px-3 py-2 text-xs text-terminal-text"
            />
          </div>
        </div>

        <div className="rounded-xl border border-terminal-border bg-terminal-bg/60 p-4 space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-terminal-border bg-blue-500/15 text-blue-400">
              <Workflow className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-terminal-text">{t("metadata.heading")}</p>
              <p className="text-xs text-terminal-muted">{t("metadata.description")}</p>
            </div>
          </div>

          <select
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
            className="w-full rounded border border-terminal-border bg-terminal-bg/50 px-3 py-2 text-sm text-terminal-text"
          >
            <option value="new">{t("metadata.createNew")}</option>
            {workflows.map((workflow) => (
              <option key={workflow.id} value={workflow.id}>
                {workflow.name}
              </option>
            ))}
          </select>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-terminal-muted">{t("metadata.nameLabel")}</label>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("metadata.namePlaceholder")}
                className="w-full rounded border border-terminal-border bg-terminal-bg/50 px-3 py-2 text-sm text-terminal-text placeholder:text-terminal-muted/60"
              />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Switch checked={enabled} onCheckedChange={setEnabled} className="data-[state=checked]:bg-terminal-green" />
              <span className="text-xs text-terminal-text">{t("metadata.enabledLabel")}</span>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-terminal-muted">{t("metadata.descriptionLabel")}</label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t("metadata.descriptionPlaceholder")}
              className="min-h-[80px] w-full rounded border border-terminal-border bg-terminal-bg/50 px-3 py-2 text-sm text-terminal-text placeholder:text-terminal-muted/60"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-terminal-muted">{t("metadata.loadingModeLabel")}</label>
              <select
                value={loadingMode}
                onChange={(event) => setLoadingMode(event.target.value as "always" | "deferred")}
                className="w-full rounded border border-terminal-border bg-terminal-bg/50 px-3 py-2 text-sm text-terminal-text"
              >
                <option value="deferred">{t("metadata.loadingDeferred")}</option>
                <option value="always">{t("metadata.loadingAlways")}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-terminal-muted">{t("metadata.timeoutLabel")}</label>
              <input
                type="number"
                value={timeoutSeconds}
                onChange={(event) => setTimeoutSeconds(event.target.value)}
                className="w-full rounded border border-terminal-border bg-terminal-bg/50 px-3 py-2 text-sm text-terminal-text"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={loadWorkflows} disabled={loading}>
              {loading ? t("metadata.loading") : t("metadata.refresh")}
            </Button>
            <Button variant="outline" onClick={resetForm}>
              {t("metadata.clear")}
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-terminal-border bg-terminal-bg/60 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-terminal-border bg-terminal-bg/70 text-terminal-muted">
              <Braces className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-terminal-text">{t("definition.heading")}</p>
              <p className="text-xs text-terminal-muted">{t("definition.description")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleFormatJson}>
              <Braces className="h-3.5 w-3.5 mr-2" />
              {t("definition.formatJson")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => workflowFileRef.current?.click()}>
              <FileJson className="h-3.5 w-3.5 mr-2" />
              {t("definition.loadFromFile")}
            </Button>
            <input
              ref={workflowFileRef}
              type="file"
              accept=".json,application/json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => setWorkflowText(String(reader.result || ""));
                reader.readAsText(file);
              }}
              className="hidden"
            />
          </div>
        </div>

        <Textarea
          value={workflowText}
          onChange={(event) => setWorkflowText(event.target.value)}
          placeholder={t("definition.placeholder")}
          className="min-h-[220px] font-mono text-xs text-terminal-text"
        />

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-terminal-text">
            <input
              type="checkbox"
              checked={validateWithComfyUI}
              onChange={(event) => setValidateWithComfyUI(event.target.checked)}
              className="size-4 accent-terminal-green"
            />
            {t("definition.validateWithObjectInfo")}
          </label>
          <Button onClick={handleAnalyze} disabled={analyzing}>
            {analyzing ? t("definition.analyzing") : t("definition.analyze")}
          </Button>
        </div>

        <details className="rounded-lg border border-terminal-border/60 bg-terminal-bg/40 p-3">
          <summary className="cursor-pointer text-xs text-terminal-muted">
            {t("definition.overrideTarget")}
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-terminal-muted">{t("definition.baseUrlOverride")}</label>
              <input
                type="text"
                value={comfyuiBaseUrl}
                onChange={(event) => setComfyuiBaseUrl(event.target.value)}
                placeholder="http://localhost:8188"
                className="w-full rounded border border-terminal-border bg-terminal-bg/50 px-3 py-2 text-xs text-terminal-text"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-terminal-muted">{t("definition.hostOverride")}</label>
              <input
                type="text"
                value={comfyuiHost}
                onChange={(event) => setComfyuiHost(event.target.value)}
                className="w-full rounded border border-terminal-border bg-terminal-bg/50 px-3 py-2 text-xs text-terminal-text"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-terminal-muted">{t("definition.portOverride")}</label>
              <input
                type="number"
                value={comfyuiPort}
                onChange={(event) => setComfyuiPort(event.target.value)}
                className="w-full rounded border border-terminal-border bg-terminal-bg/50 px-3 py-2 text-xs text-terminal-text"
              />
            </div>
          </div>
        </details>
      </div>

      <div className="rounded-xl border border-terminal-border bg-terminal-bg/60 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-terminal-border bg-terminal-bg/70 text-terminal-green">
              <SlidersHorizontal className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-terminal-text">{t("inputs.heading")}</p>
              <p className="text-xs text-terminal-muted">{t("inputs.description")}</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setInputs((prev) => [...prev, createInput()])}
            className="border-terminal-green/60 text-terminal-green hover:text-terminal-green"
          >
            <Plus className="h-3.5 w-3.5 mr-2" />
            {t("inputs.addInput")}
          </Button>
        </div>

        {inputs.length === 0 ? (
          <p className="text-xs text-terminal-muted">{t("inputs.noInputs")}</p>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 text-[11px] uppercase tracking-wide text-terminal-muted sm:grid-cols-[1.2fr_0.8fr_0.8fr_1fr_1fr_0.9fr_0.5fr]">
              <span>{t("inputs.columnName")}</span>
              <span>{t("inputs.columnType")}</span>
              <span>{t("inputs.columnNodeId")}</span>
              <span>{t("inputs.columnParameter")}</span>
              <span>{t("inputs.columnDefault")}</span>
              <span>{t("inputs.columnOpts")}</span>
              <span>{t("inputs.columnAction")}</span>
            </div>
            {inputs.map((input, index) => (
              <div key={input.id} className="rounded-lg border border-terminal-border/70 bg-terminal-bg/40 p-3 space-y-2">
                <div className="grid gap-3 sm:grid-cols-[1.2fr_0.8fr_0.8fr_1fr_1fr_0.9fr_0.5fr]">
                  <input
                    type="text"
                    value={input.name}
                    onChange={(event) => updateInput(index, { name: event.target.value })}
                    placeholder="sampler_name"
                    className="w-full rounded border border-terminal-border bg-terminal-bg/60 px-2 py-1 text-xs text-terminal-text"
                  />
                  <select
                    value={input.type}
                    onChange={(event) => updateInput(index, { type: event.target.value as CustomComfyUIInput["type"] })}
                    className="w-full rounded border border-terminal-border bg-terminal-bg/60 px-2 py-1 text-xs text-terminal-text"
                  >
                    {INPUT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={input.nodeId}
                    onChange={(event) => updateInput(index, { nodeId: event.target.value })}
                    placeholder="5189:5099"
                    className="w-full rounded border border-terminal-green/50 bg-terminal-bg/70 px-2 py-1 text-xs text-terminal-green"
                  />
                  <input
                    type="text"
                    value={input.inputField}
                    onChange={(event) => updateInput(index, { inputField: event.target.value })}
                    placeholder="sampler_name"
                    className="w-full rounded border border-terminal-border bg-terminal-bg/60 px-2 py-1 text-xs text-terminal-text"
                  />
                  <input
                    type="text"
                    value={formatDefaultValue(input.default)}
                    onChange={(event) => updateInput(index, { default: event.target.value })}
                    placeholder="euler"
                    className="w-full rounded border border-terminal-border bg-terminal-bg/60 px-2 py-1 text-xs text-terminal-text"
                  />
                  <div className="flex flex-col gap-2 text-xs text-terminal-text">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={input.required ?? false}
                        onChange={(event) => updateInput(index, { required: event.target.checked })}
                        className="size-3 accent-terminal-green"
                      />
                      {t("inputs.required")}
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={input.multiple ?? false}
                        onChange={(event) => updateInput(index, { multiple: event.target.checked })}
                        className="size-3 accent-terminal-green"
                      />
                      {t("inputs.multiple")}
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={input.enabled !== false}
                        onChange={(event) => updateInput(index, { enabled: event.target.checked })}
                        className="size-3 accent-terminal-green"
                      />
                      {t("inputs.expose")}
                    </label>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setInputs((prev) => prev.filter((_, idx) => idx !== index))}
                  >
                    {t("inputs.remove")}
                  </Button>
                </div>
                <input
                  type="text"
                  value={input.enum?.join(", ") || ""}
                  onChange={(event) =>
                    updateInput(index, {
                      enum: event.target.value
                        .split(",")
                        .map((value) => value.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder={t("inputs.enumPlaceholder")}
                  className="w-full rounded border border-terminal-border bg-terminal-bg/60 px-2 py-1 text-xs text-terminal-text"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-terminal-border bg-terminal-bg/60 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-terminal-border bg-terminal-bg/70 text-terminal-green">
              <Package className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-terminal-text">{t("outputs.heading")}</p>
              <p className="text-xs text-terminal-muted">{t("outputs.description")}</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOutputs((prev) => [...prev, createOutput()])}
            className="border-terminal-green/60 text-terminal-green hover:text-terminal-green"
          >
            <Plus className="h-3.5 w-3.5 mr-2" />
            {t("outputs.addOutput")}
          </Button>
        </div>

        {outputs.length === 0 ? (
          <p className="text-xs text-terminal-muted">{t("outputs.noOutputs")}</p>
        ) : (
          <div className="space-y-3">
            {outputs.map((output, index) => (
              <div key={output.id} className="grid gap-3 rounded-lg border border-terminal-border/70 bg-terminal-bg/40 p-3 sm:grid-cols-[1fr_0.7fr_0.7fr_1fr_auto]">
                <input
                  type="text"
                  value={output.name}
                  onChange={(event) => updateOutput(index, { name: event.target.value })}
                  placeholder="SaveVideo"
                  className="w-full rounded border border-terminal-border bg-terminal-bg/60 px-2 py-1 text-xs text-terminal-text"
                />
                <select
                  value={output.type}
                  onChange={(event) => updateOutput(index, { type: event.target.value as CustomComfyUIOutput["type"] })}
                  className="w-full rounded border border-terminal-border bg-terminal-bg/60 px-2 py-1 text-xs text-terminal-text"
                >
                  {OUTPUT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={output.nodeId}
                  onChange={(event) => updateOutput(index, { nodeId: event.target.value })}
                  placeholder="4958"
                  className="w-full rounded border border-terminal-green/50 bg-terminal-bg/70 px-2 py-1 text-xs text-terminal-green"
                />
                <input
                  type="text"
                  value={output.outputField || ""}
                  onChange={(event) => updateOutput(index, { outputField: event.target.value })}
                  placeholder="Output field description..."
                  className="w-full rounded border border-terminal-border bg-terminal-bg/60 px-2 py-1 text-xs text-terminal-text"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOutputs((prev) => prev.filter((_, idx) => idx !== index))}
                >
                  {t("outputs.remove")}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? t("saving") : t("save")}
        </Button>
        <Button variant="outline" onClick={handleDelete} disabled={saving || selectedId === "new"}>
          {t("delete")}
        </Button>
      </div>
    </div>
  );
}

