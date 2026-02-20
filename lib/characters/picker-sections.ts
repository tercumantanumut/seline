export type WorkflowSectionState = "list" | "empty" | "emptySearch";

export function shouldRenderWorkflowSection(
  characterCount: number,
  workflowCount: number
): boolean {
  return characterCount > 0 || workflowCount > 0;
}

export function getWorkflowSectionState(params: {
  workflowCount: number;
  filteredWorkflowCount: number;
  searchQuery: string;
}): WorkflowSectionState {
  const { workflowCount, filteredWorkflowCount, searchQuery } = params;

  if (filteredWorkflowCount > 0) {
    return "list";
  }

  if (workflowCount === 0) {
    return "empty";
  }

  return searchQuery.trim().length > 0 ? "emptySearch" : "empty";
}

export function shouldDisableWorkflowCreate(standaloneCharacterCount: number): boolean {
  return standaloneCharacterCount === 0;
}

export function hasMissingInitiator(initiatorId: string, agentIds: string[]): boolean {
  return !agentIds.includes(initiatorId);
}

export function shouldRenderAgentsHeader(showWorkflowSection: boolean): boolean {
  return showWorkflowSection;
}

export function shouldDisableInitiatorActions(missingInitiator: boolean): boolean {
  return missingInitiator;
}
