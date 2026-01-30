type WorkflowNode = {
  class_type?: string;
  inputs?: Record<string, unknown>;
};

type UIInputConfig = {
  name?: string;
  link?: number | null;
  widget?: unknown;
};

type UINode = {
  id?: number | string;
  type?: string;
  inputs?: UIInputConfig[];
  widgets_values?: unknown[];
};

type ObjectInfoEntry = {
  input?: {
    required?: Record<string, unknown>;
    optional?: Record<string, unknown>;
  };
};

type ObjectInfoMap = Record<string, ObjectInfoEntry>;

const WIDGET_MAPPINGS: Record<string, string[]> = {
  KSampler: [
    "seed",
    "control_after_generate",
    "steps",
    "cfg",
    "sampler_name",
    "scheduler",
    "denoise",
  ],
  KSamplerAdvanced: [
    "add_noise",
    "noise_seed",
    "control_after_generate",
    "steps",
    "end_at_step",
    "sampler_name",
    "scheduler",
    "start_at_step",
    "return_with_leftover_noise",
  ],
  CheckpointLoaderSimple: ["ckpt_name"],
  CheckpointLoader: ["config_name", "ckpt_name"],
  CLIPTextEncode: ["text"],
  VAEDecode: [],
  VAEEncode: [],
  VAELoader: ["vae_name"],
  LoraLoader: ["lora_name", "strength_model", "strength_clip"],
  LoraLoaderModelOnly: ["lora_name", "strength_model"],
  CLIPLoader: ["clip_name", "type", "device"],
  UNETLoader: ["unet_name", "weight_dtype"],
  EmptyLatentImage: ["width", "height", "batch_size"],
  SaveImage: ["filename_prefix"],
  PreviewImage: [],
  LoadImage: ["image", "upload"],
  ImageScale: ["upscale_method", "width", "height", "crop"],
  LatentUpscale: ["upscale_method", "width", "height", "crop"],
  ModelSamplingSD3: ["shift"],
  ModelSamplingFlux: ["max_shift", "base_shift", "width", "height"],
  ConditioningCombine: [],
  ConditioningSetArea: ["width", "height", "x", "y", "strength"],
  ConditioningSetMask: ["strength", "set_cond_area"],
  CLIPSetLastLayer: ["stop_at_clip_layer"],
  "easy seed": ["seed", "control_after_generate", "control_before_generate"],
  "ShowText|pysssss": ["text"],
  TextInput_: ["text"],
  MagCache: ["cache_mode", "alpha", "beta", "h_w", "start_step", "end_step"],
  Reroute: [],
};

const WIDGET_INPUT_TYPES = new Set(["INT", "FLOAT", "BOOLEAN", "STRING", "COMBO"]);

function parseObjectInfoInputSpec(entry: unknown): { type?: string; enum?: string[] } {
  if (!Array.isArray(entry)) return {};
  if (Array.isArray(entry[0])) {
    const enumValues = entry[0].filter((value) => typeof value === "string") as string[];
    return { type: "COMBO", enum: enumValues.length > 0 ? enumValues : undefined };
  }
  const rawType = typeof entry[0] === "string" ? entry[0] : undefined;
  const config = entry[1] && typeof entry[1] === "object" ? (entry[1] as Record<string, unknown>) : undefined;
  const configEnum = Array.isArray(config?.values)
    ? (config?.values as unknown[]).filter((value) => typeof value === "string")
    : undefined;
  return {
    type: rawType,
    enum: configEnum && configEnum.length > 0 ? (configEnum as string[]) : undefined,
  };
}

function getWidgetNamesFromObjectInfo(classType: string, objectInfo?: ObjectInfoMap): string[] {
  if (!objectInfo) return [];
  const entry = objectInfo[classType];
  if (!entry?.input) return [];
  const names: string[] = [];

  const appendInputs = (inputs?: Record<string, unknown>) => {
    if (!inputs) return;
    for (const [name, spec] of Object.entries(inputs)) {
      const parsed = parseObjectInfoInputSpec(spec);
      const normalized = parsed.type ? parsed.type.toUpperCase() : "";
      if (!normalized || !WIDGET_INPUT_TYPES.has(normalized)) continue;
      names.push(name);
    }
  };

  appendInputs(entry.input.required);
  appendInputs(entry.input.optional);
  return names;
}

function isUiWorkflow(workflow: Record<string, unknown>): boolean {
  if (Array.isArray((workflow as { nodes?: unknown }).nodes)) return true;
  return ["last_node_id", "last_link_id", "groups", "config", "extra"].some(
    (key) => key in workflow
  );
}

export function detectWorkflowFormat(workflow: Record<string, unknown>): "ui" | "api" {
  if (isUiWorkflow(workflow)) return "ui";

  const entries = Object.entries(workflow);
  if (entries.length === 0) return "api";

  const isApi = entries.every(([key, value]) => {
    if (key.startsWith("_")) return true;
    return typeof value === "object" && value !== null && "class_type" in (value as WorkflowNode);
  });

  return isApi ? "api" : "api";
}

function buildLinkMap(links: unknown): Map<number, [number, number]> {
  const map = new Map<number, [number, number]>();
  if (!Array.isArray(links)) return map;
  for (const link of links) {
    if (Array.isArray(link) && link.length >= 5) {
      const linkId = link[0];
      const sourceNode = link[1];
      const sourceSlot = link[2];
      if (typeof linkId === "number" && typeof sourceNode === "number" && typeof sourceSlot === "number") {
        map.set(linkId, [sourceNode, sourceSlot]);
      }
    }
  }
  return map;
}

function isPassthroughNode(nodeType: string): boolean {
  const normalized = nodeType.trim().toLowerCase();
  return normalized.startsWith("reroute") || normalized.startsWith("getnode") || normalized.startsWith("get node");
}

function mapWidgetValues(
  apiNode: { inputs: Record<string, unknown> },
  classType: string,
  widgetValues: unknown[],
  options?: { widgetNames?: string[] }
): void {
  const widgetNames = options?.widgetNames && options.widgetNames.length > 0
    ? options.widgetNames
    : WIDGET_MAPPINGS[classType] || [];
  widgetValues.forEach((value, index) => {
    if (index < widgetNames.length) {
      const widgetName = widgetNames[index];
      if (value !== null && value !== "randomize") {
        apiNode.inputs[widgetName] = value;
      }
    } else if (classType === "KSamplerAdvanced") {
      const mapping: Record<number, string> = {
        0: "add_noise",
        1: "noise_seed",
        2: "control_after_generate",
        3: "steps",
        4: "end_at_step",
        5: "sampler_name",
        6: "scheduler",
        7: "start_at_step",
        8: "return_with_leftover_noise",
      };
      const mapped = mapping[index];
      if (mapped && value !== null && value !== "randomize") {
        apiNode.inputs[mapped] = value;
      }
    }
  });
}

export function uiToApiWorkflow(
  uiWorkflow: Record<string, unknown>,
  options?: { objectInfo?: ObjectInfoMap }
): Record<string, WorkflowNode> {
  const nodes = Array.isArray((uiWorkflow as { nodes?: unknown }).nodes)
    ? ((uiWorkflow as { nodes?: UINode[] }).nodes || [])
    : [];

  if (nodes.length === 0) {
    return {};
  }

  const linkMap = buildLinkMap((uiWorkflow as { links?: unknown }).links);
  const nodeMap = new Map<number, UINode>();
  nodes.forEach((node) => {
    if (typeof node?.id === "number") {
      nodeMap.set(node.id, node);
    }
  });

  const passthroughUpstream = new Map<number, [number, number]>();
  nodes.forEach((node) => {
    if (!node || typeof node.id !== "number" || !node.type) return;
    if (!isPassthroughNode(node.type)) return;
    const inputs = node.inputs || [];
    for (const input of inputs) {
      if (typeof input?.link === "number") {
        const upstream = linkMap.get(input.link);
        if (upstream) {
          passthroughUpstream.set(node.id, upstream);
          break;
        }
      }
    }
  });

  const textInputValues = new Map<number, unknown>();
  nodes.forEach((node) => {
    if (!node || typeof node.id !== "number") return;
    if (node.type !== "TextInput_") return;
    const value = Array.isArray(node.widgets_values) ? node.widgets_values[0] : undefined;
    if (value !== undefined) {
      textInputValues.set(node.id, value);
    }
  });

  const apiWorkflow: Record<string, WorkflowNode> = {};
  nodes.forEach((node) => {
    const nodeId = node?.id;
    if (nodeId === undefined || nodeId === null) return;
    const classType = node?.type;
    if (!classType) return;

    if (isPassthroughNode(classType) || classType === "TextInput_" || classType === "ShowText|pysssss") {
      return;
    }

    const apiNode: WorkflowNode = { class_type: classType, inputs: {} };

    const inputConfigs = node.inputs || [];
    inputConfigs.forEach((inputConfig) => {
      const inputName = inputConfig?.name;
      if (!inputName) return;
      const linkId = inputConfig.link;
      if (typeof linkId === "number") {
        let source = linkMap.get(linkId);
        const visited = new Set<number>();
        while (source && passthroughUpstream.has(source[0]) && !visited.has(source[0])) {
          visited.add(source[0]);
          source = passthroughUpstream.get(source[0]);
        }
        if (source) {
          const [sourceNode, sourceSlot] = source;
          const sourceNodeObj = nodeMap.get(sourceNode);
          if (sourceNodeObj?.type === "TextInput_" && textInputValues.has(sourceNode)) {
            apiNode.inputs![inputName] = textInputValues.get(sourceNode);
            return;
          }
          apiNode.inputs![inputName] = [String(sourceNode), sourceSlot];
        }
      }
    });

    if (Array.isArray(node.widgets_values) && node.widgets_values.length > 0) {
      const widgetNames = getWidgetNamesFromObjectInfo(classType, options?.objectInfo);
      mapWidgetValues(apiNode as { inputs: Record<string, unknown> }, classType, node.widgets_values, { widgetNames });
    }

    apiWorkflow[String(nodeId)] = apiNode;
  });

  if (uiWorkflow._meta) {
    (apiWorkflow as Record<string, WorkflowNode & { _meta?: unknown }>)._meta = uiWorkflow._meta;
  }

  return apiWorkflow;
}

export function convertWorkflowToApi(
  workflow: Record<string, unknown>,
  format?: "ui" | "api",
  options?: { objectInfo?: ObjectInfoMap }
): Record<string, WorkflowNode> {
  const resolvedFormat = format || detectWorkflowFormat(workflow);
  if (resolvedFormat === "ui") {
    return uiToApiWorkflow(workflow, options);
  }
  return workflow as Record<string, WorkflowNode>;
}
