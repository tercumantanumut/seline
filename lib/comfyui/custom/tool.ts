import { jsonSchema, tool } from "ai";
import type { Tool } from "ai";
import type { JSONSchema7Definition } from "json-schema";
import { executeCustomComfyUIWorkflow } from "./executor";
import type {
  CustomComfyUIInput,
  CustomComfyUIWorkflow,
} from "./types";

function mapInputToSchema(input: CustomComfyUIInput): JSONSchema7Definition {
  const base: Record<string, unknown> = {
    description: input.description || `Workflow input for ${input.name}`,
  };

  switch (input.type) {
    case "number":
      base.type = "number";
      if (input.minimum !== undefined) base.minimum = input.minimum;
      if (input.maximum !== undefined) base.maximum = input.maximum;
      break;
    case "boolean":
      base.type = "boolean";
      break;
    case "json":
      base.type = "object";
      break;
    case "image":
    case "mask":
    case "video":
    case "file":
      base.type = input.multiple ? "array" : "string";
      if (input.multiple) {
        base.items = { type: "string" };
      }
      base.description = input.description
        || `Provide ${input.type} URL(s) or data URL(s) for ${input.name}`;
      break;
    default:
      base.type = "string";
  }

  if (input.enum && input.enum.length > 0) {
    base.enum = input.enum;
  }

  if (input.default !== undefined) {
    base.default = input.default;
  }

  return base as JSONSchema7Definition;
}

function buildInputSchema(inputs: CustomComfyUIInput[]) {
  const properties: Record<string, JSONSchema7Definition> = {};
  const required: string[] = [];

  for (const input of inputs) {
    if (input.enabled === false) continue;
    properties[input.name] = mapInputToSchema(input);
    if (input.required) {
      required.push(input.name);
    }
  }

  return jsonSchema<Record<string, unknown>>({
    type: "object",
    title: "CustomComfyUIWorkflowInput",
    description: "Inputs for a custom ComfyUI workflow",
    properties,
    required,
    additionalProperties: false,
  });
}

export function buildCustomComfyUITool(
  workflow: CustomComfyUIWorkflow,
  sessionId?: string
): Tool {
  const inputSchema = buildInputSchema(workflow.inputs);

  return tool({
    description: workflow.description
      || `Execute the ComfyUI workflow "${workflow.name}".`,
    inputSchema,
    execute: async (input: Record<string, unknown>) => {
      try {
        return await executeCustomComfyUIWorkflow({
          workflow,
          input,
          sessionId,
        });
      } catch (error) {
        return {
          status: "error" as const,
          error: error instanceof Error ? error.message : "Custom ComfyUI workflow failed",
        };
      }
    },
  });
}
