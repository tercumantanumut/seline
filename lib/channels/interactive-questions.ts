/**
 * Channel interactive question orchestrator.
 *
 * Tracks pending interactive prompts for channel conversations,
 * formats questions as numbered text (fallback) or native interactive
 * elements (Telegram/Slack/Discord), and parses user responses.
 */

import { parseNestedJsonString } from "@/lib/utils/parse-nested-json";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QuestionOption {
  label: string;
  description: string;
}

export interface ParsedQuestion {
  question: string;
  options: QuestionOption[];
  multiSelect: boolean;
}

export interface PlanApprovalPrompt {
  type: "plan_approval";
  toolName: "ExitPlanMode";
  plan: string;
  question?: string;
  options: QuestionOption[];
}

export type InteractivePromptPayload = ParsedQuestion[] | PlanApprovalPrompt;

export interface PendingChannelQuestion {
  sessionId: string;
  toolUseId: string;
  prompt: InteractivePromptPayload;
  conversationKey: string;
  connectionId: string;
  peerId: string;
  threadId?: string | null;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Pending question state - keyed by conversation key
// ---------------------------------------------------------------------------

const pendingChannelQuestions = new Map<string, PendingChannelQuestion>();

export function setPendingQuestion(key: string, data: PendingChannelQuestion): void {
  pendingChannelQuestions.set(key, data);
}

export function getPendingQuestion(key: string): PendingChannelQuestion | undefined {
  return pendingChannelQuestions.get(key);
}

export function clearPendingQuestion(key: string): void {
  pendingChannelQuestions.delete(key);
}

export function findPendingQuestionByToolUseId(
  toolUseId: string,
): { key: string; data: PendingChannelQuestion } | undefined {
  for (const [key, data] of pendingChannelQuestions) {
    if (data.toolUseId === toolUseId) {
      return { key, data };
    }
  }
  return undefined;
}

export function clearPendingQuestionBySession(sessionId: string, toolUseId: string): void {
  for (const [key, data] of pendingChannelQuestions) {
    if (data.sessionId === sessionId && data.toolUseId === toolUseId) {
      pendingChannelQuestions.delete(key);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Interactive prompt parsing
// ---------------------------------------------------------------------------

interface RawToolInput {
  questions?: Array<{
    question?: string;
    header?: string;
    options?: QuestionOption[];
    multiSelect?: boolean;
  }>;
  question?: string;
  options?: QuestionOption[];
}

function isQuestionOptionArray(value: unknown): value is QuestionOption[] {
  return Array.isArray(value) && value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const option = item as { label?: unknown; description?: unknown };
    return typeof option.label === "string" && typeof option.description === "string";
  });
}

function isPlanApprovalPrompt(value: unknown): value is PlanApprovalPrompt {
  if (!value || typeof value !== "object") return false;
  const prompt = value as {
    type?: unknown;
    toolName?: unknown;
    plan?: unknown;
    question?: unknown;
    options?: unknown;
  };

  return (
    prompt.type === "plan_approval" &&
    prompt.toolName === "ExitPlanMode" &&
    typeof prompt.plan === "string" &&
    (prompt.question === undefined || typeof prompt.question === "string") &&
    isQuestionOptionArray(prompt.options)
  );
}

function normalizePlanApprovalPrompt(toolInput: unknown): PlanApprovalPrompt | null {
  let input = toolInput;

  if (typeof input === "string") {
    const parsed = parseNestedJsonString(input);
    if (parsed && typeof parsed === "object") {
      input = parsed;
    } else {
      return null;
    }
  }

  return isPlanApprovalPrompt(input) ? input : null;
}

export function parseToolInputToQuestions(toolInput: unknown): ParsedQuestion[] {
  let input = toolInput;

  // Handle nested JSON strings (SDK sometimes double-encodes)
  if (typeof input === "string") {
    const parsed = parseNestedJsonString(input);
    if (parsed && typeof parsed === "object") {
      input = parsed;
    } else {
      return [];
    }
  }

  if (!input || typeof input !== "object") return [];
  const raw = input as RawToolInput;

  // Multi-question format: { questions: [...] }
  if (Array.isArray(raw.questions) && raw.questions.length > 0) {
    return raw.questions
      .filter((q) => q.question && Array.isArray(q.options) && q.options.length > 0)
      .map((q) => ({
        question: q.question!,
        options: q.options!,
        multiSelect: q.multiSelect ?? false,
      }));
  }

  // Single-question flat format: { question, options }
  if (raw.question && Array.isArray(raw.options) && raw.options.length > 0) {
    return [
      {
        question: raw.question,
        options: raw.options,
        multiSelect: false,
      },
    ];
  }

  return [];
}

export function parseInteractivePromptInput(toolInput: unknown): InteractivePromptPayload | null {
  const planPrompt = normalizePlanApprovalPrompt(toolInput);
  if (planPrompt) return planPrompt;

  const questions = parseToolInputToQuestions(toolInput);
  return questions.length > 0 ? questions : null;
}

// ---------------------------------------------------------------------------
// Text formatting - fallback for WhatsApp or when native elements unavailable
// ---------------------------------------------------------------------------

export function formatQuestionsForChannel(questions: ParsedQuestion[]): string {
  if (questions.length === 0) return "";

  const parts: string[] = [];

  for (let qi = 0; qi < questions.length; qi++) {
    const q = questions[qi];
    const prefix = questions.length > 1 ? `Q${qi + 1}: ` : "";
    parts.push(`${prefix}${q.question}`);

    for (let oi = 0; oi < q.options.length; oi++) {
      const opt = q.options[oi];
      const desc = opt.description ? ` - ${opt.description}` : "";
      parts.push(`  ${oi + 1}. ${opt.label}${desc}`);
    }

    parts.push("");
  }

  if (questions.length === 1) {
    const q = questions[0];
    if (q.multiSelect) {
      parts.push("Reply with numbers separated by commas (e.g. 1,3)");
    } else {
      parts.push(`Reply with a number (1-${q.options.length})`);
    }
  } else {
    parts.push("Reply like: Q1=2, Q2=1,3");
  }

  return parts.join("\n");
}

export function getInteractivePromptQuestionText(prompt: InteractivePromptPayload): string {
  if (Array.isArray(prompt)) {
    if (prompt.length === 0) return "";
    return prompt.length === 1 ? prompt[0].question : formatQuestionsForChannel(prompt).split("\n\nReply")[0];
  }

  return prompt.question ?? "Review the plan and choose how to continue.";
}

export function getInteractivePromptInstructionText(prompt: InteractivePromptPayload): string {
  if (Array.isArray(prompt)) {
    if (prompt.length === 0) return "";
    const firstQ = prompt[0];
    return firstQ.multiSelect
      ? "Select your answer (or reply with numbers separated by commas)"
      : `Select your answer (or reply with a number 1-${firstQ.options.length})`;
  }

  return `Choose an option (1-${prompt.options.length}) or reply with feedback.`;
}

export function formatInteractivePromptForChannel(prompt: InteractivePromptPayload): string {
  if (Array.isArray(prompt)) {
    return formatQuestionsForChannel(prompt);
  }

  const question = getInteractivePromptQuestionText(prompt);
  const lines = [question, "", prompt.plan.trim(), ""];
  prompt.options.forEach((opt, index) => {
    const desc = opt.description ? ` - ${opt.description}` : "";
    lines.push(`  ${index + 1}. ${opt.label}${desc}`);
  });
  lines.push("");
  lines.push(`Reply with a number (1-${prompt.options.length}) or send feedback.`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Response parsing - match user text to question options
// ---------------------------------------------------------------------------

export function parseUserResponseToAnswers(
  text: string,
  questions: ParsedQuestion[],
): Record<string, string> {
  const answers: Record<string, string> = {};
  const trimmed = text.trim();

  if (questions.length === 1) {
    const q = questions[0];
    answers[q.question] = parseSingleQuestionResponse(trimmed, q);
    return answers;
  }

  const multiPattern = /Q(\d+)\s*=\s*([^,Q]+(?:,\s*[^,Q]+)*)/gi;
  let match;
  while ((match = multiPattern.exec(trimmed)) !== null) {
    const qIndex = parseInt(match[1], 10) - 1;
    if (qIndex >= 0 && qIndex < questions.length) {
      const q = questions[qIndex];
      answers[q.question] = parseSingleQuestionResponse(match[2].trim(), q);
    }
  }

  if (Object.keys(answers).length === 0) {
    const numbers = trimmed.split(/[\s,]+/).map((n) => parseInt(n, 10)).filter((n) => !isNaN(n));
    for (let i = 0; i < Math.min(numbers.length, questions.length); i++) {
      const q = questions[i];
      const n = numbers[i];
      if (n >= 1 && n <= q.options.length) {
        answers[q.question] = q.options[n - 1].label;
      }
    }
  }

  for (const q of questions) {
    if (!answers[q.question] && q.options.length > 0) {
      answers[q.question] = q.options[0].label;
    }
  }

  return answers;
}

function parseSingleQuestionResponse(text: string, q: ParsedQuestion): string {
  const numbers = text.match(/\d+/g);
  if (numbers) {
    const labels = numbers
      .map((n) => parseInt(n, 10))
      .filter((n) => n >= 1 && n <= q.options.length)
      .map((n) => q.options[n - 1].label);
    if (labels.length > 0) {
      return q.multiSelect ? labels.join(", ") : labels[0];
    }
  }

  const matchedOption = q.options.find(
    (o) => o.label.toLowerCase() === text.toLowerCase(),
  );
  if (matchedOption) {
    return matchedOption.label;
  }

  return text;
}

export function parseInteractiveResponseToAnswers(
  text: string,
  prompt: InteractivePromptPayload,
): Record<string, string> {
  if (Array.isArray(prompt)) {
    return parseUserResponseToAnswers(text, prompt);
  }

  const trimmed = text.trim();
  const numbers = trimmed.match(/\d+/g);
  if (numbers && numbers.length > 0) {
    const first = parseInt(numbers[0], 10);
    if (first >= 1 && first <= prompt.options.length) {
      const selected = prompt.options[first - 1]?.label;
      if (selected) {
        return { action: selected };
      }
    }
  }

  return {
    action: "Reject / Edit",
    message: trimmed,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function mapIndicesToAnswers(
  selectedIndices: number[],
  questions: ParsedQuestion[],
): Record<string, string> {
  const answers: Record<string, string> = {};
  if (questions.length === 0) return answers;

  if (questions.length === 1) {
    const q = questions[0];
    const labels = selectedIndices
      .filter((i) => i >= 1 && i <= q.options.length)
      .map((i) => q.options[i - 1].label);
    answers[q.question] = q.multiSelect
      ? (labels.join(", ") || "")
      : (labels[0] || "");
    return answers;
  }

  for (let i = 0; i < Math.min(selectedIndices.length, questions.length); i++) {
    const q = questions[i];
    const idx = selectedIndices[i];
    if (idx >= 1 && idx <= q.options.length) {
      answers[q.question] = q.options[idx - 1].label;
    }
  }

  return answers;
}

export function mapIndicesToInteractiveAnswers(
  selectedIndices: number[],
  prompt: InteractivePromptPayload,
): Record<string, string> {
  if (Array.isArray(prompt)) {
    return mapIndicesToAnswers(selectedIndices, prompt);
  }

  const index = selectedIndices[0];
  if (index >= 1 && index <= prompt.options.length) {
    return { action: prompt.options[index - 1].label };
  }

  return {};
}

export function formatAnswerConfirmation(
  answers: Record<string, string>,
  questions: ParsedQuestion[],
): string {
  const values = Object.values(answers);
  if (values.length === 0) return "Got it. Continuing...";
  if (values.length === 1) return `Got it: ${values[0]}. Continuing...`;
  return `Got it: ${values.join("; ")}. Continuing...`;
}

export function formatInteractiveAnswerConfirmation(
  answers: Record<string, string>,
  prompt: InteractivePromptPayload,
): string {
  if (Array.isArray(prompt)) {
    return formatAnswerConfirmation(answers, prompt);
  }

  const action = answers.action;
  if (action === "Approve & Continue") {
    return "Plan approved. Continuing...";
  }
  if (action === "Reject / Edit") {
    const feedback = answers.message?.trim();
    return feedback ? `Plan feedback received: ${feedback}` : "Plan feedback received. Revising...";
  }
  if (action) {
    return `Got it: ${action}. Continuing...`;
  }
  return "Got it. Continuing...";
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

const CHANNEL_QUESTION_TIMEOUT_MS = 5 * 60 * 1000;

export function cleanupStaleChannelQuestions(): void {
  const now = Date.now();
  for (const [key, entry] of pendingChannelQuestions) {
    if (now - entry.createdAt > CHANNEL_QUESTION_TIMEOUT_MS) {
      pendingChannelQuestions.delete(key);
    }
  }
}
