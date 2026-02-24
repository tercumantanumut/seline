export type OpenJsonUIVersion = "open-json-ui/v1";

export type UIScalar = string | number | boolean | null;

export type GenerativeUIChartType = "bar" | "line" | "pie";
export type GenerativeUITone = "default" | "success" | "warning" | "danger" | "info";
export type GenerativeUITextVariant = "title" | "body" | "muted" | "caption" | "code";

export interface GenerativeUIStackNode {
  type: "stack";
  direction?: "vertical" | "horizontal";
  gap?: "xs" | "sm" | "md" | "lg";
  children: GenerativeUINode[];
}

export interface GenerativeUICardNode {
  type: "card";
  title?: string;
  subtitle?: string;
  tone?: GenerativeUITone;
  children?: GenerativeUINode[];
}

export interface GenerativeUITextNode {
  type: "text";
  text: string;
  variant?: GenerativeUITextVariant;
}

export interface GenerativeUIBadgeNode {
  type: "badge";
  label: string;
  tone?: GenerativeUITone;
}

export interface GenerativeUIKVItem {
  label: string;
  value: UIScalar;
}

export interface GenerativeUIKVNode {
  type: "kv";
  items: GenerativeUIKVItem[];
}

export interface GenerativeUIListNode {
  type: "list";
  ordered?: boolean;
  items: Array<string | GenerativeUINode>;
}

export interface GenerativeUITableNode {
  type: "table";
  columns: string[];
  rows: UIScalar[][];
}

export interface GenerativeUIChartSeriesItem {
  label: string;
  value: number;
  color?: string;
}

export interface GenerativeUIChartNode {
  type: "chart";
  chartType: GenerativeUIChartType;
  title?: string;
  unit?: string;
  series: GenerativeUIChartSeriesItem[];
}

export interface GenerativeUIDividerNode {
  type: "divider";
}

export type GenerativeUINode =
  | GenerativeUIStackNode
  | GenerativeUICardNode
  | GenerativeUITextNode
  | GenerativeUIBadgeNode
  | GenerativeUIKVNode
  | GenerativeUIListNode
  | GenerativeUITableNode
  | GenerativeUIChartNode
  | GenerativeUIDividerNode;

export interface GenerativeUISpec {
  version: OpenJsonUIVersion;
  title?: string;
  description?: string;
  root: GenerativeUINode;
}

export interface GenerativeUISpecValidationResult {
  valid: boolean;
  spec?: GenerativeUISpec;
  errors: string[];
}

export interface GenerativeUISpecExtractionResult extends GenerativeUISpecValidationResult {
  hasCandidate: boolean;
  sourcePath?: string;
}

interface ValidationState {
  depth: number;
  nodeCount: number;
  errors: string[];
}

const MAX_DEPTH = 14;
const MAX_NODE_COUNT = 250;
const SUPPORTED_VERSION: OpenJsonUIVersion = "open-json-ui/v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toStringOrUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toTone(value: unknown): GenerativeUITone | undefined {
  if (value === "default" || value === "success" || value === "warning" || value === "danger" || value === "info") {
    return value;
  }
  return undefined;
}

function toTextVariant(value: unknown): GenerativeUITextVariant | undefined {
  if (value === "title" || value === "body" || value === "muted" || value === "caption" || value === "code") {
    return value;
  }
  return undefined;
}

function toScalar(value: unknown): UIScalar | undefined {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return undefined;
}

function parseCandidateString(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return value;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function fail(state: ValidationState, message: string): undefined {
  state.errors.push(message);
  return undefined;
}

function validateNode(input: unknown, path: string, state: ValidationState): GenerativeUINode | undefined {
  if (!isRecord(input)) {
    return fail(state, `${path} must be an object node.`);
  }

  if (state.depth > MAX_DEPTH) {
    return fail(state, `${path} exceeds max depth (${MAX_DEPTH}).`);
  }

  state.nodeCount += 1;
  if (state.nodeCount > MAX_NODE_COUNT) {
    return fail(state, `UI spec exceeds max node count (${MAX_NODE_COUNT}).`);
  }

  const nodeType = toStringOrUndefined(input.type);
  if (!nodeType) {
    return fail(state, `${path}.type is required.`);
  }

  const recurse = (value: unknown, childPath: string): GenerativeUINode | undefined => {
    state.depth += 1;
    const parsed = validateNode(value, childPath, state);
    state.depth -= 1;
    return parsed;
  };

  switch (nodeType) {
    case "stack": {
      const childrenRaw = input.children;
      if (!Array.isArray(childrenRaw) || childrenRaw.length === 0) {
        return fail(state, `${path}.children must be a non-empty array.`);
      }

      const children: GenerativeUINode[] = [];
      for (let i = 0; i < childrenRaw.length; i += 1) {
        const parsedChild = recurse(childrenRaw[i], `${path}.children[${i}]`);
        if (parsedChild) children.push(parsedChild);
      }

      if (children.length === 0) {
        return fail(state, `${path}.children has no valid nodes.`);
      }

      const direction = input.direction === "horizontal" ? "horizontal" : "vertical";
      const gap =
        input.gap === "xs" ||
        input.gap === "sm" ||
        input.gap === "md" ||
        input.gap === "lg"
          ? input.gap
          : undefined;

      return {
        type: "stack",
        direction,
        ...(gap ? { gap } : {}),
        children,
      };
    }

    case "card": {
      const title = toStringOrUndefined(input.title);
      const subtitle = toStringOrUndefined(input.subtitle);
      const tone = toTone(input.tone);

      let children: GenerativeUINode[] | undefined;
      if (Array.isArray(input.children)) {
        const parsedChildren: GenerativeUINode[] = [];
        for (let i = 0; i < input.children.length; i += 1) {
          const parsedChild = recurse(input.children[i], `${path}.children[${i}]`);
          if (parsedChild) parsedChildren.push(parsedChild);
        }
        if (parsedChildren.length > 0) {
          children = parsedChildren;
        }
      }

      return {
        type: "card",
        ...(title ? { title } : {}),
        ...(subtitle ? { subtitle } : {}),
        ...(tone ? { tone } : {}),
        ...(children ? { children } : {}),
      };
    }

    case "text": {
      const text = toStringOrUndefined(input.text);
      if (!text) {
        return fail(state, `${path}.text is required for text nodes.`);
      }

      const variant = toTextVariant(input.variant);
      return {
        type: "text",
        text,
        ...(variant ? { variant } : {}),
      };
    }

    case "badge": {
      const label = toStringOrUndefined(input.label);
      if (!label) {
        return fail(state, `${path}.label is required for badge nodes.`);
      }

      const tone = toTone(input.tone);
      return {
        type: "badge",
        label,
        ...(tone ? { tone } : {}),
      };
    }

    case "kv": {
      const itemsRaw = input.items;
      if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) {
        return fail(state, `${path}.items must be a non-empty array.`);
      }

      const items: GenerativeUIKVItem[] = [];
      for (let i = 0; i < itemsRaw.length; i += 1) {
        const item = itemsRaw[i];
        if (!isRecord(item)) {
          state.errors.push(`${path}.items[${i}] must be an object.`);
          continue;
        }
        const label = toStringOrUndefined(item.label);
        const value = toScalar(item.value);
        if (!label) {
          state.errors.push(`${path}.items[${i}].label is required.`);
          continue;
        }
        if (value === undefined) {
          state.errors.push(`${path}.items[${i}].value must be a scalar.`);
          continue;
        }
        items.push({ label, value });
      }

      if (items.length === 0) {
        return fail(state, `${path}.items has no valid entries.`);
      }

      return { type: "kv", items };
    }

    case "list": {
      const itemsRaw = input.items;
      if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) {
        return fail(state, `${path}.items must be a non-empty array.`);
      }

      const items: Array<string | GenerativeUINode> = [];
      for (let i = 0; i < itemsRaw.length; i += 1) {
        const rawItem = itemsRaw[i];
        if (typeof rawItem === "string" && rawItem.trim().length > 0) {
          items.push(rawItem.trim());
          continue;
        }
        const parsedNode = recurse(rawItem, `${path}.items[${i}]`);
        if (parsedNode) items.push(parsedNode);
      }

      if (items.length === 0) {
        return fail(state, `${path}.items has no valid entries.`);
      }

      return {
        type: "list",
        ordered: input.ordered === true,
        items,
      };
    }

    case "table": {
      if (!Array.isArray(input.columns) || input.columns.length === 0) {
        return fail(state, `${path}.columns must be a non-empty array.`);
      }
      const columns = input.columns
        .map((col) => toStringOrUndefined(col))
        .filter((col): col is string => Boolean(col));
      if (columns.length === 0) {
        return fail(state, `${path}.columns has no valid labels.`);
      }

      if (!Array.isArray(input.rows)) {
        return fail(state, `${path}.rows must be an array.`);
      }

      const rows: UIScalar[][] = [];
      for (let rowIdx = 0; rowIdx < input.rows.length; rowIdx += 1) {
        const rawRow = input.rows[rowIdx];
        if (!Array.isArray(rawRow)) {
          state.errors.push(`${path}.rows[${rowIdx}] must be an array.`);
          continue;
        }
        const normalizedRow: UIScalar[] = rawRow.map((cell) => toScalar(cell) ?? null);
        rows.push(normalizedRow);
      }

      return {
        type: "table",
        columns,
        rows,
      };
    }

    case "chart": {
      if (!Array.isArray(input.series) || input.series.length === 0) {
        return fail(state, `${path}.series must be a non-empty array.`);
      }

      const chartType: GenerativeUIChartType =
        input.chartType === "line" || input.chartType === "pie" ? input.chartType : "bar";

      const series: GenerativeUIChartSeriesItem[] = [];
      for (let i = 0; i < input.series.length; i += 1) {
        const item = input.series[i];
        if (!isRecord(item)) {
          state.errors.push(`${path}.series[${i}] must be an object.`);
          continue;
        }
        const label = toStringOrUndefined(item.label);
        const value = typeof item.value === "number" && Number.isFinite(item.value) ? item.value : undefined;
        const color = toStringOrUndefined(item.color);
        if (!label || value === undefined) {
          state.errors.push(`${path}.series[${i}] requires label and numeric value.`);
          continue;
        }
        series.push({ label, value, ...(color ? { color } : {}) });
      }

      if (series.length === 0) {
        return fail(state, `${path}.series has no valid entries.`);
      }

      const title = toStringOrUndefined(input.title);
      const unit = toStringOrUndefined(input.unit);
      return {
        type: "chart",
        chartType,
        ...(title ? { title } : {}),
        ...(unit ? { unit } : {}),
        series,
      };
    }

    case "divider":
      return { type: "divider" };

    default:
      return fail(state, `${path}.type "${nodeType}" is not supported.`);
  }
}

function validateSpecObject(candidate: unknown): GenerativeUISpecValidationResult {
  const state: ValidationState = {
    depth: 0,
    nodeCount: 0,
    errors: [],
  };

  if (!isRecord(candidate)) {
    return {
      valid: false,
      errors: ["Spec candidate must be an object."],
    };
  }

  const version = toStringOrUndefined(candidate.version) || SUPPORTED_VERSION;
  if (version !== SUPPORTED_VERSION) {
    state.errors.push(`Unsupported UI spec version "${version}".`);
  }

  const root = validateNode(candidate.root, "spec.root", state);

  const title = toStringOrUndefined(candidate.title);
  const description = toStringOrUndefined(candidate.description);

  if (!root) {
    state.errors.push("spec.root is required.");
  }

  if (state.errors.length > 0 || !root) {
    return {
      valid: false,
      errors: state.errors,
    };
  }

  return {
    valid: true,
    spec: {
      version: SUPPORTED_VERSION,
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      root,
    },
    errors: [],
  };
}

export function validateGenerativeUISpec(candidate: unknown): GenerativeUISpecValidationResult {
  return validateSpecObject(candidate);
}

function enumerateCandidates(value: unknown): Array<{ path: string; value: unknown }> {
  const candidates: Array<{ path: string; value: unknown }> = [];

  if (!isRecord(value)) {
    return candidates;
  }

  const root = value as Record<string, unknown>;

  if (isRecord(root.root)) {
    candidates.push({ path: "$", value: root });
  }

  const candidateKeys: Array<[string, string]> = [
    ["uiSpec", "$.uiSpec"],
    ["ui_spec", "$.ui_spec"],
    ["openJsonUi", "$.openJsonUi"],
    ["open_json_ui", "$.open_json_ui"],
  ];

  for (const [key, path] of candidateKeys) {
    const candidate = root[key];
    if (candidate !== undefined) {
      candidates.push({ path, value: candidate });
    }
  }

  if (isRecord(root.ui)) {
    candidates.push({ path: "$.ui", value: root.ui });
    const nestedSpec = (root.ui as Record<string, unknown>).spec;
    if (nestedSpec !== undefined) {
      candidates.push({ path: "$.ui.spec", value: nestedSpec });
    }
  }

  if (isRecord(root.metadata)) {
    const nestedSpec = (root.metadata as Record<string, unknown>).uiSpec;
    if (nestedSpec !== undefined) {
      candidates.push({ path: "$.metadata.uiSpec", value: nestedSpec });
    }
  }

  return candidates;
}

export function extractGenerativeUISpec(value: unknown): GenerativeUISpecExtractionResult {
  const candidates = enumerateCandidates(value);
  if (candidates.length === 0) {
    return {
      valid: false,
      hasCandidate: false,
      errors: [],
    };
  }

  const errors: string[] = [];

  for (const candidate of candidates) {
    const normalizedCandidate =
      typeof candidate.value === "string"
        ? parseCandidateString(candidate.value)
        : candidate.value;

    const validation = validateSpecObject(normalizedCandidate);
    if (validation.valid && validation.spec) {
      return {
        valid: true,
        hasCandidate: true,
        sourcePath: candidate.path,
        spec: validation.spec,
        errors: [],
      };
    }

    errors.push(
      `${candidate.path}: ${validation.errors.length > 0 ? validation.errors.join(" ") : "invalid UI spec"}`
    );
  }

  return {
    valid: false,
    hasCandidate: true,
    errors,
  };
}

export function countGenerativeUINodes(node: GenerativeUINode): number {
  switch (node.type) {
    case "stack":
      return 1 + node.children.reduce((sum, child) => sum + countGenerativeUINodes(child), 0);
    case "card":
      return 1 + (node.children ? node.children.reduce((sum, child) => sum + countGenerativeUINodes(child), 0) : 0);
    case "list":
      return (
        1 +
        node.items.reduce((sum, item) => {
          if (typeof item === "string") return sum;
          return sum + countGenerativeUINodes(item);
        }, 0)
      );
    default:
      return 1;
  }
}
