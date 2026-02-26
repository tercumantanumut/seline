import type { AgentTemplate } from "./types";

export const CUSTOMER_SUPPORT_AGENT_TEMPLATE: AgentTemplate = {
  id: "customer-support-agent",
  name: "Customer Support Agent",
  tagline: "Resolve issues with clear steps",
  purpose: "Handles customer issues quickly with structured triage and response templates.",
  category: "operations",
  version: "1.0.0",
  enabledTools: ["docsSearch", "readFile", "sendMessageToChannel", "getSkill", "updateSkill", "updatePlan"],
  memories: [
    { category: "communication_style", content: "Use empathetic language and keep responses under 7 lines unless asked for details.", reasoning: "Improves customer response quality and clarity." },
  ],
  exampleSkills: [
    {
      name: "Ticket triage response",
      description: "Classify urgency and draft a customer-facing response.",
      promptTemplate: "Classify issue severity, likely cause, immediate workaround, and final response draft.",
      toolHints: ["docsSearch"],
      triggerExamples: ["Draft a response for this support ticket", "Triage this customer issue"],
      category: "operations",
    },
  ],
};
