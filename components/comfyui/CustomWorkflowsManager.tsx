"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
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

export function CustomWorkflowsManager() {
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
      const response = await fetch("/api/comfyui/custom-workflows");
      if (!response.ok) throw new Error("Failed to load workflows");
      const data = (await response.json()) as { workflows?: CustomComfyUIWorkflow[] };
      setWorkflows(data.workflows || []);
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
      const response = await fetch("/api/comfyui/custom-workflows/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflow: workflowJson,
          format,
          validateWithComfyUI,
          comfyuiBaseUrl: comfyuiBaseUrl || undefined,
          comfyuiHost: comfyuiHost || undefined,
          comfyuiPort: comfyuiPort ? Number(comfyuiPort) : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Failed to analyze workflow");
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
      toast.success("Workflow analyzed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Workflow analysis failed");
    } finally {
      setAnalyzing(false);
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
      const response = await fetch(endpoint, {
        method: selectedId !== "new" ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Failed to save workflow");
      }
      toast.success("Workflow saved");
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
      const response = await fetch(`/api/comfyui/custom-workflows/${selectedId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Failed to delete workflow");
      }
      toast.success("Workflow deleted");
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
    <div className="rounded-lg border border-terminal-border bg-white p-4 space-y-4">
      <div>
        <h3 className="font-mono text-sm font-semibold text-terminal-dark">Custom ComfyUI Workflows</h3>
        <p className="font-mono text-xs text-terminal-muted">
          Upload or paste workflow JSON, then review inputs and outputs before saving.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <select
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
          className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark"
        >
          <option value="new">New workflow</option>
          {workflows.map((workflow) => (
            <option key={workflow.id} value={workflow.id}>
              {workflow.name}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadWorkflows} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </Button>
          <Button variant="outline" onClick={resetForm}>
            Clear
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block font-mono text-xs text-terminal-muted">Name</label>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark"
          />
        </div>
        <div>
          <label className="mb-1 block font-mono text-xs text-terminal-muted">Description</label>
          <input
            type="text"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block font-mono text-xs text-terminal-muted">Loading Mode</label>
          <select
            value={loadingMode}
            onChange={(event) => setLoadingMode(event.target.value as "always" | "deferred")}
            className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark"
          >
            <option value="deferred">Deferred</option>
            <option value="always">Always</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block font-mono text-xs text-terminal-muted">Timeout (seconds)</label>
          <input
            type="number"
            value={timeoutSeconds}
            onChange={(event) => setTimeoutSeconds(event.target.value)}
            className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark"
          />
        </div>
        <div className="flex items-center gap-2 pt-5">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="size-4 accent-terminal-green"
          />
          <span className="font-mono text-xs text-terminal-dark">Enabled</span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block font-mono text-xs text-terminal-muted">ComfyUI Base URL</label>
          <input
            type="text"
            value={comfyuiBaseUrl}
            onChange={(event) => setComfyuiBaseUrl(event.target.value)}
            placeholder="http://localhost:8081"
            className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark"
          />
        </div>
        <div>
          <label className="mb-1 block font-mono text-xs text-terminal-muted">Host Override</label>
          <input
            type="text"
            value={comfyuiHost}
            onChange={(event) => setComfyuiHost(event.target.value)}
            className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark"
          />
        </div>
        <div>
          <label className="mb-1 block font-mono text-xs text-terminal-muted">Port Override</label>
          <input
            type="number"
            value={comfyuiPort}
            onChange={(event) => setComfyuiPort(event.target.value)}
            className="w-full rounded border border-terminal-border bg-white px-3 py-2 font-mono text-sm text-terminal-dark"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="mb-1 block font-mono text-xs text-terminal-muted">Workflow JSON</label>
        <Textarea
          value={workflowText}
          onChange={(event) => setWorkflowText(event.target.value)}
          placeholder="Paste ComfyUI UI/API JSON here"
          className="min-h-[180px] font-mono text-xs"
        />
        <input
          type="file"
          accept=".json,application/json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => setWorkflowText(String(reader.result || ""));
            reader.readAsText(file);
          }}
          className="block text-xs text-terminal-muted"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 font-mono text-xs text-terminal-dark">
          <input
            type="checkbox"
            checked={validateWithComfyUI}
            onChange={(event) => setValidateWithComfyUI(event.target.checked)}
            className="size-4 accent-terminal-green"
          />
          Validate with /object_info
        </label>
        <Button onClick={handleAnalyze} disabled={analyzing}>
          {analyzing ? "Analyzing..." : "Analyze"}
        </Button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-mono text-sm font-semibold text-terminal-dark">Inputs</h4>
          <Button variant="outline" onClick={() => setInputs((prev) => [...prev, createInput()])}>
            Add input
          </Button>
        </div>
        {inputs.length === 0 ? (
          <p className="font-mono text-xs text-terminal-muted">No inputs detected yet.</p>
        ) : (
          <div className="space-y-2">
            {inputs.map((input, index) => (
              <div key={input.id} className="grid gap-2 rounded border border-terminal-border p-3 sm:grid-cols-7">
                <input
                  type="text"
                  value={input.name}
                  onChange={(event) => updateInput(index, { name: event.target.value })}
                  placeholder="Name"
                  className="w-full rounded border border-terminal-border bg-white px-2 py-1 font-mono text-xs text-terminal-dark"
                />
                <select
                  value={input.type}
                  onChange={(event) => updateInput(index, { type: event.target.value as CustomComfyUIInput["type"] })}
                  className="w-full rounded border border-terminal-border bg-white px-2 py-1 font-mono text-xs text-terminal-dark"
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
                  placeholder="Node ID"
                  className="w-full rounded border border-terminal-border bg-white px-2 py-1 font-mono text-xs text-terminal-dark"
                />
                <input
                  type="text"
                  value={input.inputField}
                  onChange={(event) => updateInput(index, { inputField: event.target.value })}
                  placeholder="Input field"
                  className="w-full rounded border border-terminal-border bg-white px-2 py-1 font-mono text-xs text-terminal-dark"
                />
                <input
                  type="text"
                  value={formatDefaultValue(input.default)}
                  onChange={(event) => updateInput(index, { default: event.target.value })}
                  placeholder="Default"
                  className="w-full rounded border border-terminal-border bg-white px-2 py-1 font-mono text-xs text-terminal-dark"
                />
                <div className="flex flex-col gap-2 text-xs text-terminal-dark">
                  <label className="flex items-center gap-2 font-mono">
                    <input
                      type="checkbox"
                      checked={input.required ?? false}
                      onChange={(event) => updateInput(index, { required: event.target.checked })}
                      className="size-3 accent-terminal-green"
                    />
                    Required
                  </label>
                  <label className="flex items-center gap-2 font-mono">
                    <input
                      type="checkbox"
                      checked={input.multiple ?? false}
                      onChange={(event) => updateInput(index, { multiple: event.target.checked })}
                      className="size-3 accent-terminal-green"
                    />
                    Multiple
                  </label>
                  <label className="flex items-center gap-2 font-mono">
                    <input
                      type="checkbox"
                      checked={input.enabled !== false}
                      onChange={(event) => updateInput(index, { enabled: event.target.checked })}
                      className="size-3 accent-terminal-green"
                    />
                    Expose
                  </label>
                </div>
                <div className="sm:col-span-7">
                  <div className="flex items-center gap-2">
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
                      placeholder="Enum values (comma-separated)"
                      className="w-full rounded border border-terminal-border bg-white px-2 py-1 font-mono text-xs text-terminal-dark"
                    />
                    <Button
                      variant="outline"
                      onClick={() => setInputs((prev) => prev.filter((_, idx) => idx !== index))}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-mono text-sm font-semibold text-terminal-dark">Outputs</h4>
          <Button variant="outline" onClick={() => setOutputs((prev) => [...prev, createOutput()])}>
            Add output
          </Button>
        </div>
        {outputs.length === 0 ? (
          <p className="font-mono text-xs text-terminal-muted">No outputs detected yet.</p>
        ) : (
          <div className="space-y-2">
            {outputs.map((output, index) => (
              <div key={output.id} className="grid gap-2 rounded border border-terminal-border p-3 sm:grid-cols-5">
                <input
                  type="text"
                  value={output.name}
                  onChange={(event) => updateOutput(index, { name: event.target.value })}
                  placeholder="Name"
                  className="w-full rounded border border-terminal-border bg-white px-2 py-1 font-mono text-xs text-terminal-dark"
                />
                <select
                  value={output.type}
                  onChange={(event) => updateOutput(index, { type: event.target.value as CustomComfyUIOutput["type"] })}
                  className="w-full rounded border border-terminal-border bg-white px-2 py-1 font-mono text-xs text-terminal-dark"
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
                  placeholder="Node ID"
                  className="w-full rounded border border-terminal-border bg-white px-2 py-1 font-mono text-xs text-terminal-dark"
                />
                <input
                  type="text"
                  value={output.outputField || ""}
                  onChange={(event) => updateOutput(index, { outputField: event.target.value })}
                  placeholder="Output field"
                  className="w-full rounded border border-terminal-border bg-white px-2 py-1 font-mono text-xs text-terminal-dark"
                />
                <Button
                  variant="outline"
                  onClick={() => setOutputs((prev) => prev.filter((_, idx) => idx !== index))}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save workflow"}
        </Button>
        <Button variant="outline" onClick={handleDelete} disabled={saving || selectedId === "new"}>
          Delete
        </Button>
      </div>
    </div>
  );
}
