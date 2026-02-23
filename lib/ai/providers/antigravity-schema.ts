/**
 * Antigravity Schema Sanitization
 *
 * Normalizes and coerces JSON Schema objects to be compatible with the
 * Antigravity / Gemini API gateway. Handles legacy JSON Schema 4 keywords,
 * nullable fields, integer->number coercion, and Gemini-specific constraints
 * (e.g. enum only allowed on STRING type fields).
 */

// ---- Constants ---------------------------------------------------------------

export const DEFAULT_ANTIGRAVITY_INPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {},
  additionalProperties: true,
};

export const ANTIGRAVITY_ALLOWED_SCHEMA_KEYS = new Set([
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

// ---- Helpers -----------------------------------------------------------------

export function isPlainObject(value: unknown): value is Record<string, unknown> {
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

  for (const key of [
    "items",
    "additionalProperties",
    "contains",
    "not",
    "if",
    "then",
    "else",
    "contentSchema",
    "propertyNames",
    "unevaluatedProperties",
    "unevaluatedItems",
  ]) {
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

export function sanitizeSchema(schema: Record<string, unknown>): Record<string, unknown> {
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
    if (
      input.items === undefined &&
      (isPlainObject(input.additionalItems) || typeof input.additionalItems === "boolean")
    ) {
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
            if (
              Array.isArray(depValue) &&
              depValue.every((entry) => typeof entry === "string")
            ) {
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
        if (
          typeof value === "string" ||
          (Array.isArray(value) && value.every((entry) => typeof entry === "string"))
        ) {
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

// ---- Public normalization API ------------------------------------------------

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
      result.enum = schema.enum.map((value) =>
        typeof value === "string" ? value : String(value)
      );
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
      const required = schema.required.filter(
        (entry): entry is string => typeof entry === "string"
      );
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

/**
 * Normalize tool schemas in a request body to be compatible with the Antigravity
 * (Gemini) API. Ensures all function declarations have a parameters schema and
 * that enum values are strings on STRING-typed properties.
 */
export function normalizeAntigravityToolSchemas(tools: unknown): void {
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
      const schemaType = typeof schema.type === "string" ? schema.type : undefined;
      if (schemaType && schemaType !== "string" && schemaType !== "STRING") {
        delete schema.enum;
      } else {
        schema.enum = enumValues.map((value) =>
          typeof value === "string" ? value : String(value)
        );
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
