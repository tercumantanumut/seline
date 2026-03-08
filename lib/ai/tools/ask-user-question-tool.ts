import { tool, jsonSchema, type ToolExecutionOptions } from "ai";
import { withToolLogging } from "@/lib/ai/tool-registry/logging";
import { registerInteractiveWait } from "@/lib/interactive-tool-bridge";

export interface AskUserQuestionToolOptions {
  sessionId: string;
}

export interface AskUserQuestionOption {
  label: string;
  description: string;
}

export interface AskUserQuestionItem {
  question: string;
  header: string;
  options: AskUserQuestionOption[];
  multiSelect: boolean;
}

export interface AskUserQuestionArgs {
  questions: AskUserQuestionItem[];
}

const WAIT_TIMEOUT_MS = 300_000;
const TIMEOUT_RESULT = { answers: {}, timedOut: true } as const;

const askUserQuestionSchema = jsonSchema<AskUserQuestionArgs>({
  type: "object",
  title: "AskUserQuestionInput",
  description:
    "Input schema for interactive user questions with selectable options",
  properties: {
    questions: {
      type: "array",
      description: "One or more interactive questions for the user",
      items: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "The question text shown to the user",
          },
          header: {
            type: "string",
            description: "Optional short header shown above the question",
          },
          options: {
            type: "array",
            description: "Selectable options the user can choose from",
            items: {
              type: "object",
              properties: {
                label: {
                  type: "string",
                  description: "Option label shown to the user",
                },
                description: {
                  type: "string",
                  description: "Optional short description for the option",
                },
              },
              required: ["label", "description"],
              additionalProperties: false,
            },
          },
          multiSelect: {
            type: "boolean",
            description:
              "Whether the user may select multiple options for this question",
          },
        },
        required: ["question", "header", "options", "multiSelect"],
        additionalProperties: false,
      },
      minItems: 1,
    },
  },
  required: ["questions"],
  additionalProperties: false,
});

function extractToolCallId(options?: ToolExecutionOptions): string {
  if (!options || typeof options !== "object") return "";
  if (typeof options.toolCallId === "string" && options.toolCallId.length > 0) {
    return options.toolCallId;
  }
  return "";
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(undefined);
    }, timeoutMs);

    promise
      .then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(undefined);
      });
  });
}

async function executeAskUserQuestion(
  options: AskUserQuestionToolOptions,
  args: AskUserQuestionArgs,
  toolCallOptions?: ToolExecutionOptions,
): Promise<{ answers: Record<string, string>; timedOut?: boolean }> {
  if (options.sessionId === "UNSCOPED") {
    return TIMEOUT_RESULT;
  }

  const toolCallId = extractToolCallId(toolCallOptions);
  if (!toolCallId) {
    // Without a tool call id, the UI cannot resolve this invocation back to the waiter.
    return TIMEOUT_RESULT;
  }

  const waitPromise = registerInteractiveWait(
    options.sessionId,
    toolCallId,
    args.questions,
  );

  const waitResult = await withTimeout(waitPromise, WAIT_TIMEOUT_MS);
  if (!waitResult || waitResult.kind !== "submitted") {
    return TIMEOUT_RESULT;
  }

  return { answers: waitResult.answers };
}

export function createAskUserQuestionTool(options: AskUserQuestionToolOptions) {
  const executeWithLogging = withToolLogging(
    "askUserQuestion",
    options.sessionId,
    (args: AskUserQuestionArgs, toolCallOptions?: ToolExecutionOptions) =>
      executeAskUserQuestion(options, args, toolCallOptions),
  );

  return tool({
    description: `Ask interactive multiple-choice questions to the user and wait for their response.

This tool blocks until the user submits an answer through the UI (or until timeout).`,
    inputSchema: askUserQuestionSchema,
    execute: executeWithLogging,
  });
}
