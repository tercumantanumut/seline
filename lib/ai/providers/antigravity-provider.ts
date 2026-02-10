/**
 * Antigravity AI Provider
 *
 * Custom provider that uses Google's Generative AI SDK with a custom fetch
 * wrapper to transform requests for the Antigravity API gateway.
 *
 * Antigravity provides free access to models like Claude Sonnet 4.5, Gemini 3, etc.
 * through Google OAuth authentication.
 */

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import {
  getAntigravityToken,
  ANTIGRAVITY_CONFIG,
  fetchAntigravityProjectId,
  ANTIGRAVITY_SYSTEM_INSTRUCTION,
} from "@/lib/auth/antigravity-auth";

// Model aliases - map display names to Antigravity API model IDs
// Verified working 2026-01-05: All models work directly without prefix
const MODEL_ALIASES: Record<string, string> = {
  // Direct model names (already in correct format for API)
  "gemini-3-pro-high": "gemini-3-pro-high",
  "gemini-3-pro-low": "gemini-3-pro-low",
  "gemini-3-flash": "gemini-3-flash",
  "claude-sonnet-4-5": "claude-sonnet-4-5",
  "claude-sonnet-4-5-thinking": "claude-sonnet-4-5-thinking",
  "claude-opus-4-5-thinking": "claude-opus-4-5-thinking",
  "gpt-oss-120b-medium": "gpt-oss-120b-medium",
};

const ANTIGRAVITY_REQUEST_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_ANTIGRAVITY_INPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {},
  additionalProperties: true,
};

const ANTIGRAVITY_ALLOWED_SCHEMA_KEYS = new Set([
  "$id",
  "$ref",
  "$defs",
  "$comment",
  "title",
  "description",
  "type",
  "enum",
  "const",
  "default",
  "examples",
  "format",
  "properties",
  "patternProperties",
  "additionalProperties",
  "required",
  "items",
  "prefixItems",
  "minItems",
  "maxItems",
  "uniqueItems",
  "contains",
  "minContains",
  "maxContains",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "pattern",
  "dependentRequired",
  "dependentSchemas",
  "if",
  "then",
  "else",
  "allOf",
  "anyOf",
  "oneOf",
  "not",
  "unevaluatedProperties",
  "unevaluatedItems",
  "propertyNames",
  "contentMediaType",
  "contentEncoding",
  "contentSchema",
  "readOnly",
  "writeOnly",
  "deprecated",
  "minProperties",
  "maxProperties",
]);

const ANTIGRAVITY_STRING_KEYS = new Set([
  "$id",
  "$ref",
  "$comment",
  "title",
  "description",
  "format",
  "pattern",
  "contentMediaType",
  "contentEncoding",
]);

const ANTIGRAVITY_NUMBER_KEYS = new Set([
  "minItems",
  "maxItems",
  "minContains",
  "maxContains",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "minProperties",
  "maxProperties",
]);

const ANTIGRAVITY_BOOLEAN_KEYS = new Set([
  "uniqueItems",
  "readOnly",
  "writeOnly",
  "deprecated",
]);

// Retry configuration for Antigravity quota/resource exhaustion errors
const ANTIGRAVITY_RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffFactor: 2,
};

/**
 * Check if an error message indicates a retryable quota/resource exhaustion error
 */
function isRetryableAntigravityError(errorText: string): boolean {
  const lowerError = errorText.toLowerCase();
  return (
    lowerError.includes("resource exhausted") ||
    lowerError.includes("quota") ||
    lowerError.includes("rate limit") ||
    lowerError.includes("429") ||
    lowerError.includes("503") ||
    lowerError.includes("temporarily unavailable")
  );
}

/**
 * Calculate delay for exponential backoff
 */
function calculateRetryDelay(attempt: number): number {
  const delay = ANTIGRAVITY_RETRY_CONFIG.initialDelayMs *
    Math.pow(ANTIGRAVITY_RETRY_CONFIG.backoffFactor, attempt);
  // Add jitter (±20%) to prevent thundering herd
  const jitter = delay * 0.2 * (Math.random() * 2 - 1);
  return Math.min(delay + jitter, ANTIGRAVITY_RETRY_CONFIG.maxDelayMs);
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Generate a unique request ID
function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `req-${timestamp}-${random}`;
}

function generateSessionId(): string {
  return `session-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 10)}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeSchemaValue(value: unknown): Record<string, unknown> | boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (!isPlainObject(value)) {
    return undefined;
  }
  return sanitizeSchema(value);
}

function sanitizeSchemaArray(value: unknown): Array<Record<string, unknown> | boolean> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const sanitized = value
    .map((entry) => sanitizeSchemaValue(entry))
    .filter((entry): entry is Record<string, unknown> | boolean => entry !== undefined);
  return sanitized.length > 0 ? sanitized : undefined;
}

function sanitizeSchemaRecord(value: unknown): Record<string, unknown> | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }
  const sanitized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    const normalized = sanitizeSchemaValue(entry);
    if (normalized !== undefined) {
      sanitized[key] = normalized;
    }
  }
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function ensureSchemaCompleteness(schema: Record<string, unknown>): Record<string, unknown> {
  const type = schema.type;

  if (type === "array" || (Array.isArray(type) && type.includes("array"))) {
    if (!("items" in schema) && !("prefixItems" in schema)) {
      schema.items = { type: "string" };
    }
  }

  if (type === "object" || (Array.isArray(type) && type.includes("object"))) {
    if (!("properties" in schema)) {
      schema.properties = {};
    }
  }

  for (const key of ["properties", "patternProperties", "$defs", "dependentSchemas"]) {
    const val = schema[key];
    if (isPlainObject(val)) {
      for (const [k, v] of Object.entries(val)) {
        if (isPlainObject(v)) {
          (val as Record<string, unknown>)[k] = ensureSchemaCompleteness(v as Record<string, unknown>);
        }
      }
    }
  }

  for (const key of ["items", "additionalProperties", "contains", "not", "if", "then", "else", "contentSchema", "propertyNames", "unevaluatedProperties", "unevaluatedItems"]) {
    const val = schema[key];
    if (isPlainObject(val)) {
      schema[key] = ensureSchemaCompleteness(val as Record<string, unknown>);
    }
  }

  for (const key of ["allOf", "anyOf", "oneOf", "prefixItems"]) {
    const val = schema[key];
    if (Array.isArray(val)) {
      schema[key] = val.map((entry: unknown) =>
        isPlainObject(entry) ? ensureSchemaCompleteness(entry as Record<string, unknown>) : entry
      );
    }
  }

  return schema;
}

function sanitizeSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const input = { ...schema };

  if (isPlainObject(input.definitions)) {
    const existing = isPlainObject(input.$defs) ? input.$defs : {};
    input.$defs = { ...input.definitions, ...existing };
  }
  delete input.definitions;

  if (typeof input.id === "string" && typeof input.$id !== "string") {
    input.$id = input.id;
  }
  delete input.id;

  if (typeof input.nullable === "boolean") {
    if (input.nullable) {
      const currentType = input.type;
      if (typeof currentType === "string") {
        input.type = currentType === "null" ? currentType : [currentType, "null"];
      } else if (Array.isArray(currentType)) {
        if (!currentType.includes("null")) {
          input.type = [...currentType, "null"];
        }
      }
    }
    delete input.nullable;
  }

  if (typeof input.exclusiveMinimum === "boolean") {
    if (input.exclusiveMinimum) {
      if (typeof input.minimum === "number") {
        input.exclusiveMinimum = input.minimum;
        delete input.minimum;
      } else {
        delete input.exclusiveMinimum;
      }
    } else {
      delete input.exclusiveMinimum;
    }
  }

  if (typeof input.exclusiveMaximum === "boolean") {
    if (input.exclusiveMaximum) {
      if (typeof input.maximum === "number") {
        input.exclusiveMaximum = input.maximum;
        delete input.maximum;
      } else {
        delete input.exclusiveMaximum;
      }
    } else {
      delete input.exclusiveMaximum;
    }
  }

  if (Array.isArray(input.items)) {
    if (!input.prefixItems) {
      input.prefixItems = input.items;
    }
    delete input.items;
  }

  if ("additionalItems" in input) {
    if (input.items === undefined && (isPlainObject(input.additionalItems) || typeof input.additionalItems === "boolean")) {
      input.items = input.additionalItems;
    }
    delete input.additionalItems;
  }

  if (isPlainObject(input.dependencies)) {
    const dependentRequired: Record<string, string[]> = {};
    const dependentSchemas: Record<string, Record<string, unknown>> = {};

    for (const [key, value] of Object.entries(input.dependencies)) {
      if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
        dependentRequired[key] = value as string[];
      } else if (isPlainObject(value)) {
        dependentSchemas[key] = value as Record<string, unknown>;
      }
    }

    if (Object.keys(dependentRequired).length > 0) {
      const existing = isPlainObject(input.dependentRequired) ? input.dependentRequired : {};
      input.dependentRequired = { ...existing, ...dependentRequired };
    }

    if (Object.keys(dependentSchemas).length > 0) {
      const existing = isPlainObject(input.dependentSchemas) ? input.dependentSchemas : {};
      input.dependentSchemas = { ...existing, ...dependentSchemas };
    }
  }
  delete input.dependencies;

  const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (!ANTIGRAVITY_ALLOWED_SCHEMA_KEYS.has(key)) {
        continue;
      }

      switch (key) {
      case "$ref":
        if (typeof value === "string") {
          sanitized[key] = value
            .replace(/#\/definitions\//g, "#/$defs/")
            .replace(/#\/definitions$/g, "#/$defs");
        }
        break;
        case "properties":
        case "patternProperties":
        case "$defs":
        case "dependentSchemas": {
          const record = sanitizeSchemaRecord(value);
          if (record) {
            sanitized[key] = record;
          }
          break;
        }
        case "dependentRequired": {
          if (isPlainObject(value)) {
            const record: Record<string, string[]> = {};
            for (const [depKey, depValue] of Object.entries(value)) {
              if (Array.isArray(depValue) && depValue.every((entry) => typeof entry === "string")) {
                record[depKey] = depValue as string[];
              }
            }
            if (Object.keys(record).length > 0) {
              sanitized[key] = record;
            }
          }
          break;
        }
      case "items":
      case "additionalProperties":
      case "unevaluatedProperties":
      case "unevaluatedItems":
      case "contains":
      case "propertyNames":
      case "not":
      case "if":
      case "then":
      case "else":
      case "contentSchema": {
        const normalized = sanitizeSchemaValue(value);
        if (normalized !== undefined) {
          sanitized[key] = normalized;
        }
        break;
      }
      case "allOf":
      case "anyOf":
      case "oneOf":
      case "prefixItems": {
        const array = sanitizeSchemaArray(value);
        if (array) {
          sanitized[key] = array;
        }
        break;
      }
      case "required":
        if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
          sanitized[key] = value;
        }
        break;
      case "enum":
        if (Array.isArray(value)) {
          sanitized[key] = value;
        }
        break;
      case "examples":
        if (Array.isArray(value)) {
          sanitized[key] = value;
        }
        break;
      case "type":
        if (typeof value === "string" || (Array.isArray(value) && value.every((entry) => typeof entry === "string"))) {
          sanitized[key] = value;
        }
        break;
      default:
        if (ANTIGRAVITY_STRING_KEYS.has(key)) {
          if (typeof value === "string") {
            sanitized[key] = value;
          }
          break;
        }
        if (ANTIGRAVITY_NUMBER_KEYS.has(key)) {
          if (typeof value === "number") {
            sanitized[key] = value;
          }
          break;
        }
        if (ANTIGRAVITY_BOOLEAN_KEYS.has(key)) {
          if (typeof value === "boolean") {
            sanitized[key] = value;
          }
          break;
        }
        if (key === "const" || key === "default") {
          sanitized[key] = value;
        }
        break;
    }
  }

  return sanitized;
}

function normalizeAntigravityInputSchema(inputSchema: unknown): Record<string, unknown> {
  if (!isPlainObject(inputSchema)) {
    return { ...DEFAULT_ANTIGRAVITY_INPUT_SCHEMA };
  }

  const sanitized = sanitizeSchema(inputSchema);
  if (!Object.keys(sanitized).length) {
    return { ...DEFAULT_ANTIGRAVITY_INPUT_SCHEMA };
  }

  const normalizedType = sanitized.type;
  if (!normalizedType) {
    sanitized.type = "object";
  } else if (Array.isArray(normalizedType)) {
    if (!normalizedType.includes("object")) {
      sanitized.type = "object";
    }
  } else if (typeof normalizedType === "string" && normalizedType !== "object") {
    sanitized.type = "object";
  }

  if (!("properties" in sanitized)) {
    sanitized.properties = {};
  }

  if (!("additionalProperties" in sanitized)) {
    sanitized.additionalProperties = true;
  }

  return ensureSchemaCompleteness(sanitized);
}

function normalizeAnthropicType(value: unknown): string | undefined {
  const mapType = (type: string): string => (type === "integer" ? "number" : type);

  if (typeof value === "string") {
    return mapType(value);
  }

  if (Array.isArray(value)) {
    const normalized = value
      .filter((entry): entry is string => typeof entry === "string")
      .map(mapType)
      .filter((entry) => entry !== "null");
    const unique = Array.from(new Set(normalized));
    for (const preferred of ["object", "array", "string", "number", "boolean"]) {
      if (unique.includes(preferred)) {
        return preferred;
      }
    }
    return unique[0];
  }

  return undefined;
}

function coerceAnthropicSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const type = normalizeAnthropicType(schema.type);

  if (typeof schema.description === "string") {
    result.description = schema.description;
  }

  if (schema.default !== undefined) {
    result.default = schema.default;
  }

  if (Array.isArray(schema.enum)) {
    // Gemini only supports enum on STRING type — strip for non-string types
    if (type && type !== "string") {
      // Don't include enum for number/boolean/etc types
    } else {
      result.enum = schema.enum.map((value) => (typeof value === "string" ? value : String(value)));
    }
  }

  if (typeof schema.minimum === "number") result.minimum = schema.minimum;
  if (typeof schema.maximum === "number") result.maximum = schema.maximum;
  if (typeof schema.minLength === "number") result.minLength = schema.minLength;
  if (typeof schema.maxLength === "number") result.maxLength = schema.maxLength;
  if (typeof schema.minItems === "number") result.minItems = schema.minItems;
  if (typeof schema.maxItems === "number") result.maxItems = schema.maxItems;

  if (type === "object") {
    const props: Record<string, unknown> = {};

    if (isPlainObject(schema.properties)) {
      for (const [key, value] of Object.entries(schema.properties)) {
        if (isPlainObject(value)) {
          props[key] = coerceAnthropicSchema(value);
        }
      }
    }

    result.type = "object";
    result.properties = props;

    if (Array.isArray(schema.required)) {
      const required = schema.required.filter((entry): entry is string => typeof entry === "string");
      if (required.length) {
        result.required = required;
      }
    }

    if ("additionalProperties" in schema) {
      if (typeof schema.additionalProperties === "boolean") {
        result.additionalProperties = schema.additionalProperties;
      } else if (isPlainObject(schema.additionalProperties)) {
        result.additionalProperties = coerceAnthropicSchema(schema.additionalProperties);
      }
    } else {
      result.additionalProperties = true;
    }
  } else if (type === "array") {
    result.type = "array";

    let itemsSchema: Record<string, unknown> | undefined;
    if (Array.isArray(schema.items) && schema.items.length > 0) {
      const first = schema.items[0];
      if (isPlainObject(first)) {
        itemsSchema = coerceAnthropicSchema(first);
      }
    } else if (isPlainObject(schema.items)) {
      itemsSchema = coerceAnthropicSchema(schema.items);
    }

    result.items = itemsSchema ?? { type: "string" };
  } else if (type) {
    result.type = type;
  }

  if (!result.type) {
    if (isPlainObject(result.properties)) {
      result.type = "object";
    } else if (result.items) {
      result.type = "array";
    } else {
      result.type = "string";
    }
  }

  if (result.type === "object" && !("properties" in result)) {
    result.properties = {};
  }

  if (result.type === "array" && !("items" in result)) {
    result.items = { type: "string" };
  }

  return result;
}

function normalizeAntigravityCustomSchema(inputSchema: unknown): Record<string, unknown> {
  const normalized = normalizeAntigravityInputSchema(inputSchema);
  const coerced = coerceAnthropicSchema(normalized);
  return Object.keys(coerced).length > 0 ? coerced : { ...DEFAULT_ANTIGRAVITY_INPUT_SCHEMA };
}

function normalizeAntigravityToolSchemas(tools: unknown): void {
  if (!Array.isArray(tools)) {
    return;
  }

  const normalizeEnumValues = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach((item) => normalizeEnumValues(item));
      return;
    }

    if (!node || typeof node !== "object") {
      return;
    }

    const schema = node as Record<string, unknown>;
    const enumValues = Array.isArray(schema.enum) ? schema.enum : undefined;

    if (enumValues) {
      // Gemini API only supports enum on STRING type properties.
      // For non-string types (number, boolean, etc.), remove enum entirely
      // to avoid: "only allowed for STRING type fields" API errors.
      const schemaType = typeof schema.type === "string" ? schema.type : undefined;
      if (schemaType && schemaType !== "string" && schemaType !== "STRING") {
        delete schema.enum;
      } else {
        // For string types, ensure all enum values are strings.
        schema.enum = enumValues.map((value) => (typeof value === "string" ? value : String(value)));
      }
    }

    for (const value of Object.values(schema)) {
      normalizeEnumValues(value);
    }
  };

  for (const [index, toolEntry] of tools.entries()) {
    if (!toolEntry || typeof toolEntry !== "object") {
      continue;
    }

    const entry = toolEntry as Record<string, unknown>;

    if (entry.custom && typeof entry.custom === "object") {
      const custom = entry.custom as Record<string, unknown>;
      if (!("input_schema" in custom) || !custom.input_schema) {
        custom.input_schema = { type: "object", properties: {} };
        const name = typeof custom.name === "string" ? custom.name : `#${index}`;
        console.warn(`[Antigravity] Tool "${name}" missing input_schema; injecting empty schema`);
      }
      custom.input_schema = normalizeAntigravityCustomSchema(custom.input_schema);
      normalizeEnumValues(custom.input_schema);
    }

    if (Array.isArray(entry.functionDeclarations)) {
      for (const [fnIndex, fnEntry] of entry.functionDeclarations.entries()) {
        if (!fnEntry || typeof fnEntry !== "object") {
          continue;
        }

        const fn = fnEntry as Record<string, unknown>;
        if (!("parameters" in fn) || !fn.parameters) {
          fn.parameters = { type: "object", properties: {} };
          const name = typeof fn.name === "string" ? fn.name : `#${index}.${fnIndex}`;
          console.warn(`[Antigravity] Function "${name}" missing parameters; injecting empty schema`);
        }
        fn.parameters = normalizeAntigravityCustomSchema(fn.parameters);
        normalizeEnumValues(fn.parameters);
      }
    }

    if (Array.isArray(entry.function_declarations)) {
      for (const [fnIndex, fnEntry] of entry.function_declarations.entries()) {
        if (!fnEntry || typeof fnEntry !== "object") {
          continue;
        }

        const fn = fnEntry as Record<string, unknown>;
        if (!("parameters" in fn) || !fn.parameters) {
          fn.parameters = { type: "object", properties: {} };
          const name = typeof fn.name === "string" ? fn.name : `#${index}.${fnIndex}`;
          console.warn(`[Antigravity] Function "${name}" missing parameters; injecting empty schema`);
        }
        fn.parameters = normalizeAntigravityCustomSchema(fn.parameters);
        normalizeEnumValues(fn.parameters);
      }
    }
  }
}

/**
 * Get the effective model name for Antigravity API
 */
function resolveModelName(modelId: string): string {
  // Strip antigravity- prefix if present
  const modelWithoutPrefix = modelId.replace(/^antigravity-/i, "");
  const model = MODEL_ALIASES[modelWithoutPrefix] || modelWithoutPrefix;

  // Antigravity API: gemini-3-pro requires tier suffix (gemini-3-pro-low/high)
  if (model.toLowerCase() === "gemini-3-pro") {
    return "gemini-3-pro-low";
  }
  return model;
}

async function readRequestBody(body: BodyInit): Promise<string> {
  if (typeof body === "string") {
    return body;
  }

  if (body instanceof ArrayBuffer) {
    return new TextDecoder().decode(body);
  }

  if (ArrayBuffer.isView(body)) {
    const view = body as ArrayBufferView;
    return new TextDecoder().decode(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
  }

  if (body instanceof URLSearchParams) {
    return body.toString();
  }

  if (typeof (body as Blob).text === "function") {
    return await (body as Blob).text();
  }

  throw new Error("Unsupported request body type for Antigravity request");
}

/**
 * Check if this is a Google Generative Language API request that should be intercepted
 */
function isGenerativeLanguageRequest(url: string): boolean {
  return url.includes("generativelanguage.googleapis.com") ||
    url.includes("/models/") && (url.includes(":generateContent") || url.includes(":streamGenerateContent"));
}

/**
 * Custom fetch wrapper that transforms requests for Antigravity API
 */
function createAntigravityFetch(accessToken: string, projectId: string): typeof fetch {
  const sessionId = generateSessionId();
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = input instanceof URL ? input.toString() :
      typeof input === "string" ? input : input.url;

    // Check if this is a generative language request we should intercept
    if (!isGenerativeLanguageRequest(url)) {
      // Not a generative language request, pass through
      return fetch(input, init);
    }

    // Extract model and action from URL
    // URL format: .../models/{model}:{action} or generativelanguage.googleapis.com/v1beta/models/{model}:{action}
    const match = url.match(/\/models\/([^:/?]+):(\w+)/);
    if (!match) {
      // Can't parse URL, pass through
      return fetch(input, init);
    }

    const [, rawModel, action] = match;
    const effectiveModel = resolveModelName(rawModel || "");
    const streaming = action === "streamGenerateContent";

    // Build Antigravity endpoint URL
    const baseUrl = ANTIGRAVITY_CONFIG.API_BASE_URL;
    const antigravityUrl = `${baseUrl}/${ANTIGRAVITY_CONFIG.API_VERSION}:${action}${streaming ? "?alt=sse" : ""}`;

    // Parse and transform the request body
    let transformedBody: string | undefined;
    if (init?.body) {
      try {
        const bodyText = await readRequestBody(init.body);
        const parsedBody = JSON.parse(bodyText);

        // Inject Antigravity system instruction with role "user"
        // This is critical for Antigravity API compatibility
        if (parsedBody.systemInstruction) {
          const sys = parsedBody.systemInstruction;
          if (typeof sys === "object") {
            sys.role = "user";
            if (Array.isArray(sys.parts) && sys.parts.length > 0) {
              const firstPart = sys.parts[0];
              if (firstPart && typeof firstPart.text === "string") {
                firstPart.text = ANTIGRAVITY_SYSTEM_INSTRUCTION + "\n\n" + firstPart.text;
              } else {
                sys.parts = [{ text: ANTIGRAVITY_SYSTEM_INSTRUCTION }, ...sys.parts];
              }
            } else {
              sys.parts = [{ text: ANTIGRAVITY_SYSTEM_INSTRUCTION }];
            }
          } else if (typeof sys === "string") {
            parsedBody.systemInstruction = {
              role: "user",
              parts: [{ text: ANTIGRAVITY_SYSTEM_INSTRUCTION + "\n\n" + sys }],
            };
          }
        } else {
          parsedBody.systemInstruction = {
            role: "user",
            parts: [{ text: ANTIGRAVITY_SYSTEM_INSTRUCTION }],
          };
        }

        // Normalize tool schemas for ALL models (Gemini requires string enums, etc.)
        if (parsedBody.tools) {
          normalizeAntigravityToolSchemas(parsedBody.tools);
        }

        // For Claude models via Antigravity, we need to inject unique IDs into functionCall/functionResponse parts.
        const isClaudeModel = effectiveModel.includes("claude");
        if (isClaudeModel && parsedBody.contents && Array.isArray(parsedBody.contents)) {
          // Track functionCall IDs by name+index for matching with functionResponse
          const functionCallIds = new Map<string, string[]>();
          const functionResponseIndex = new Map<string, number>();

          // First pass: inject IDs into all functionCall parts
          for (const content of parsedBody.contents) {
            if (content.parts && Array.isArray(content.parts)) {
              for (const part of content.parts) {
                if (part.functionCall && typeof part.functionCall === "object") {
                  const funcName = (part.functionCall as Record<string, unknown>).name as string;
                  const callId = `toolu_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 10)}`;

                  if (!functionCallIds.has(funcName)) {
                    functionCallIds.set(funcName, []);
                  }
                  functionCallIds.get(funcName)!.push(callId);
                  (part.functionCall as Record<string, unknown>).id = callId;
                }
              }
            }
          }

          // Second pass: inject matching IDs into functionResponse parts
          for (const content of parsedBody.contents) {
            if (content.parts && Array.isArray(content.parts)) {
              for (const part of content.parts) {
                if (part.functionResponse && typeof part.functionResponse === "object") {
                  const funcName = (part.functionResponse as Record<string, unknown>).name as string;
                  const ids = functionCallIds.get(funcName);

                  if (ids && ids.length > 0) {
                    const idx = functionResponseIndex.get(funcName) || 0;
                    if (idx < ids.length) {
                      (part.functionResponse as Record<string, unknown>).id = ids[idx];
                      functionResponseIndex.set(funcName, idx + 1);
                    }
                  }
                }
              }
            }
          }
        }

        // Wrap the request in Antigravity's expected format
        const wrappedBody = {
          project: projectId,
          model: effectiveModel,
          userAgent: "antigravity",
          requestId: generateRequestId(),
          requestType: "agent", // Required in v1.2.8
          request: {
            ...parsedBody,
            sessionId,
          },
        };

        transformedBody = JSON.stringify(wrappedBody);
      } catch (e) {
        console.error("[Antigravity] Failed to transform request body:", e);
        throw e;
      }
    }

    // Build headers
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${accessToken}`);
    headers.set("Content-Type", "application/json");
    headers.set("Accept", streaming ? "text/event-stream" : "application/json");
    headers.set("User-Agent", ANTIGRAVITY_CONFIG.HEADERS["User-Agent"]);
    headers.set("X-Goog-Api-Client", ANTIGRAVITY_CONFIG.HEADERS["X-Goog-Api-Client"]);
    headers.set("Client-Metadata", ANTIGRAVITY_CONFIG.HEADERS["Client-Metadata"]);

    // Remove any API key header (we use OAuth Bearer token)
    headers.delete("x-goog-api-key");

    console.log(`[Antigravity] Request: ${action} for model ${effectiveModel}`);
    console.log(`[Antigravity] URL: ${antigravityUrl}`);

    // Helper to make a single request attempt
    const makeRequest = async (attempt: number): Promise<Response> => {
      const controller = new AbortController();
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const clearTimeoutOnce = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      };
      timeoutId = setTimeout(() => {
        clearTimeoutOnce();
        controller.abort(new Error("Antigravity request timed out"));
      }, ANTIGRAVITY_REQUEST_TIMEOUT_MS);

      const upstreamSignal = init?.signal;
      if (upstreamSignal) {
        if (upstreamSignal.aborted) {
          controller.abort(upstreamSignal.reason);
        } else {
          upstreamSignal.addEventListener("abort", () => controller.abort(upstreamSignal.reason), { once: true });
        }
      }

      let response: Response;
      try {
        response = await fetch(antigravityUrl, {
          ...init,
          method: init?.method || "POST",
          headers,
          body: transformedBody,
          signal: controller.signal,
        });
      } catch (error) {
        clearTimeoutOnce();
        throw error;
      }

      if (!response.ok) {
        clearTimeoutOnce();
        const errorText = await response.clone().text();
        console.error(`[Antigravity] Error (attempt ${attempt + 1}): ${response.status} ${response.statusText}`);
        console.error(`[Antigravity] Response: ${errorText.substring(0, 500)}`);

        // Check if this is a retryable error and we have retries left
        if (attempt < ANTIGRAVITY_RETRY_CONFIG.maxRetries && isRetryableAntigravityError(errorText)) {
          const delay = calculateRetryDelay(attempt);
          console.log(`[Antigravity] Retryable error detected, waiting ${Math.round(delay)}ms before retry...`);
          await sleep(delay);
          return makeRequest(attempt + 1);
        }

        return response;
      }

      // For streaming responses, transform SSE data with retry support
      if (streaming && response.body) {
        const streamBody = response.body
          .pipeThrough(new TextDecoderStream())
          .pipeThrough(createResponseTransformStreamWithRetry(
            clearTimeoutOnce,
            // Retry callback for mid-stream errors
            async (errorText: string): Promise<ReadableStream<string> | null> => {
              if (attempt >= ANTIGRAVITY_RETRY_CONFIG.maxRetries || !isRetryableAntigravityError(errorText)) {
                console.error(`[Antigravity] Stream error not retryable or max retries exceeded`);
                return null;
              }
              const delay = calculateRetryDelay(attempt);
              console.log(`[Antigravity] Mid-stream quota error, retrying in ${Math.round(delay)}ms...`);
              await sleep(delay);

              // Make a new request and return its stream
              try {
                const retryResponse = await makeRequest(attempt + 1);
                if (retryResponse.ok && retryResponse.body) {
                  return retryResponse.body
                    .pipeThrough(new TextDecoderStream());
                }
              } catch (retryError) {
                console.error(`[Antigravity] Retry failed:`, retryError);
              }
              return null;
            }
          ))
          .pipeThrough(new TextEncoderStream());

        return new Response(streamBody, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      }

      // For non-streaming, unwrap the response
      const text = await response.text();
      clearTimeoutOnce();
      const unwrappedText = unwrapResponse(text);

      return new Response(unwrappedText, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    };

    // Start with attempt 0
    return makeRequest(0);
  };
}

/**
 * Transform SSE stream to unwrap response objects with retry support for quota errors.
 *
 * This stream transformer detects quota/resource exhaustion errors in the SSE stream
 * and can trigger a retry callback to get a new stream, transparently continuing
 * the response to the client.
 *
 * @param onComplete - Called when stream completes successfully
 * @param onRetryNeeded - Callback to get a new stream on retryable error, returns null if retry fails
 */
function createResponseTransformStreamWithRetry(
  onComplete?: () => void,
  onRetryNeeded?: (errorText: string) => Promise<ReadableStream<string> | null>
): TransformStream<string, string> {
  let buffer = "";
  let retryStream: ReadableStream<string> | null = null;
  let retryReader: ReadableStreamDefaultReader<string> | null = null;

  /**
   * Check if a parsed SSE data object contains a quota/resource error
   */
  const isQuotaError = (parsed: unknown): string | null => {
    if (typeof parsed !== "object" || parsed === null) return null;

    const obj = parsed as Record<string, unknown>;

    // Check for error field
    if (obj.error && typeof obj.error === "object") {
      const error = obj.error as Record<string, unknown>;
      const message = String(error.message || error.error || "");
      if (isRetryableAntigravityError(message)) {
        return message;
      }
    }

    // Check for top-level error message
    if (obj.message && typeof obj.message === "string") {
      if (isRetryableAntigravityError(obj.message)) {
        return obj.message;
      }
    }

    // Check candidates for finishReason: "OTHER" which can indicate quota issues
    if (obj.candidates && Array.isArray(obj.candidates)) {
      for (const candidate of obj.candidates) {
        if (candidate && typeof candidate === "object") {
          const c = candidate as Record<string, unknown>;
          if (c.finishReason === "OTHER" || c.finishReason === "RECITATION") {
            // Check if there's an error message in the content
            const content = c.content as Record<string, unknown> | undefined;
            if (content?.parts && Array.isArray(content.parts)) {
              for (const part of content.parts) {
                if (part && typeof part === "object" && "text" in part) {
                  const text = String((part as Record<string, unknown>).text || "");
                  if (isRetryableAntigravityError(text)) {
                    return text;
                  }
                }
              }
            }
          }
        }
      }
    }

    return null;
  };

  /**
   * Process accumulated retry stream data
   */
  const processRetryData = async (controller: TransformStreamDefaultController<string>) => {
    if (!retryReader) return;

    try {
      while (true) {
        const { done, value } = await retryReader.read();
        if (done) break;

        // Process the retry stream data through the same transform logic
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data:")) {
            controller.enqueue(line + "\n");
            continue;
          }

          const json = line.slice(5).trim();
          if (!json) {
            controller.enqueue(line + "\n");
            continue;
          }

          try {
            const parsed = JSON.parse(json);
            const unwrapped = parsed.response !== undefined ? parsed.response : parsed;

            // Fix for Claude via Antigravity: ensure functionCall parts have args field
            if (unwrapped?.candidates && Array.isArray(unwrapped.candidates)) {
              for (const candidate of unwrapped.candidates) {
                if (candidate?.content?.parts && Array.isArray(candidate.content.parts)) {
                  for (const part of candidate.content.parts) {
                    if (part?.functionCall && typeof part.functionCall === "object") {
                      if (!("args" in part.functionCall)) {
                        part.functionCall.args = {};
                      }
                    }
                  }
                }
              }
            }

            controller.enqueue(`data: ${JSON.stringify(unwrapped)}\n`);
          } catch {
            controller.enqueue(line + "\n");
          }
        }
      }
    } finally {
      retryReader.releaseLock();
      retryReader = null;
      retryStream = null;
    }
  };

  return new TransformStream<string, string>({
    async transform(chunk, controller) {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data:")) {
          controller.enqueue(line + "\n");
          continue;
        }

        const json = line.slice(5).trim();
        if (!json) {
          controller.enqueue(line + "\n");
          continue;
        }

        try {
          const parsed = JSON.parse(json);

          // Check if this is a quota error that we should retry
          const quotaErrorMsg = isQuotaError(parsed);
          if (quotaErrorMsg && onRetryNeeded) {
            console.log(`[Antigravity] Detected mid-stream quota error: ${quotaErrorMsg.substring(0, 100)}`);

            // Attempt to get a retry stream
            const newStream = await onRetryNeeded(quotaErrorMsg);
            if (newStream) {
              console.log(`[Antigravity] Got retry stream, continuing response...`);
              retryStream = newStream;
              retryReader = newStream.getReader();
              // Process the retry stream
              await processRetryData(controller);
              return; // Stop processing current stream
            } else {
              console.log(`[Antigravity] Retry failed, forwarding error to client`);
            }
          }

          // Unwrap the response field if present
          const unwrapped = parsed.response !== undefined ? parsed.response : parsed;

          // Fix for Claude via Antigravity: ensure functionCall parts have args field
          // The Google AI SDK expects args to be present (even if empty), but Claude
          // may omit it entirely when there are no arguments
          if (unwrapped?.candidates && Array.isArray(unwrapped.candidates)) {
            for (const candidate of unwrapped.candidates) {
              if (candidate?.content?.parts && Array.isArray(candidate.content.parts)) {
                for (const part of candidate.content.parts) {
                  if (part?.functionCall && typeof part.functionCall === "object") {
                    // Inject empty args if missing
                    if (!("args" in part.functionCall)) {
                      part.functionCall.args = {};
                    }
                  }
                }
              }
            }
          }

          controller.enqueue(`data: ${JSON.stringify(unwrapped)}\n`);
        } catch {
          controller.enqueue(line + "\n");
        }
      }
    },
    flush(controller) {
      if (buffer.length > 0) {
        controller.enqueue(buffer);
      }
      onComplete?.();
    },
  });
}

/**
 * Unwrap a non-streaming response
 */
function unwrapResponse(text: string): string {
  try {
    const parsed = JSON.parse(text);
    const unwrapped = parsed.response !== undefined ? parsed.response : parsed;

    // Fix for Claude via Antigravity: ensure functionCall parts have args field
    if (unwrapped?.candidates && Array.isArray(unwrapped.candidates)) {
      for (const candidate of unwrapped.candidates) {
        if (candidate?.content?.parts && Array.isArray(candidate.content.parts)) {
          for (const part of candidate.content.parts) {
            if (part?.functionCall && typeof part.functionCall === "object") {
              if (!("args" in part.functionCall)) {
                part.functionCall.args = {};
              }
            }
          }
        }
      }
    }

    return JSON.stringify(unwrapped);
  } catch {
    return text;
  }
}

/**
 * Create an Antigravity provider instance (async to fetch project ID if needed)
 */
export async function createAntigravityProviderAsync(): Promise<((modelId: string) => LanguageModel) | null> {
  const token = getAntigravityToken();
  if (!token) {
    console.warn("[Antigravity] No token available");
    return null;
  }

  const accessToken = token.access_token;
  let projectId = token.project_id || "";

  // Fetch project ID if missing
  if (!projectId) {
    console.log("[Antigravity] No project_id in token, fetching via loadCodeAssist...");
    const fetchedProjectId = await fetchAntigravityProjectId();
    if (fetchedProjectId) {
      projectId = fetchedProjectId;
    } else {
      console.warn("[Antigravity] Failed to fetch project ID. API calls may fail.");
      console.warn("[Antigravity] Try re-authenticating in Settings > Antigravity.");
    }
  }

  if (projectId) {
    console.log("[Antigravity] Using project:", projectId);
  }

  // Create Google AI provider with custom fetch
  const google = createGoogleGenerativeAI({
    baseURL: `${ANTIGRAVITY_CONFIG.API_BASE_URL}/v1beta`,
    apiKey: "", // Not used, we use OAuth
    fetch: createAntigravityFetch(accessToken, projectId),
  });

  return (modelId: string): LanguageModel => {
    const effectiveModel = resolveModelName(modelId);
    console.log(`[Antigravity] Creating model: ${modelId} -> ${effectiveModel}`);
    // Cast to LanguageModel - the SDK types are compatible at runtime
    return google(effectiveModel) as unknown as LanguageModel;
  };
}

/**
 * Create an Antigravity provider instance (sync version - uses cached project ID only)
 */
export function createAntigravityProvider(): ((modelId: string) => LanguageModel) | null {
  const token = getAntigravityToken();
  if (!token) {
    console.warn("[Antigravity] No token available");
    return null;
  }

  const accessToken = token.access_token;
  const projectId = token.project_id || "";

  if (!projectId) {
    console.warn("[Antigravity] No project_id in token. Use createAntigravityProviderAsync() to auto-fetch.");
    console.warn("[Antigravity] Or re-authenticate in Settings > Antigravity.");
  } else {
    console.log("[Antigravity] Using project:", projectId);
  }

  // Create Google AI provider with custom fetch
  const google = createGoogleGenerativeAI({
    baseURL: `${ANTIGRAVITY_CONFIG.API_BASE_URL}/v1beta`,
    apiKey: "", // Not used, we use OAuth
    fetch: createAntigravityFetch(accessToken, projectId),
  });

  return (modelId: string): LanguageModel => {
    const effectiveModel = resolveModelName(modelId);
    console.log(`[Antigravity] Creating model: ${modelId} -> ${effectiveModel}`);
    // Cast to LanguageModel - the SDK types are compatible at runtime
    return google(effectiveModel) as unknown as LanguageModel;
  };
}
