import { describe, expect, it } from "vitest";
import {
  getWorkflowSectionState,
  hasMissingInitiator,
  shouldDisableInitiatorActions,
  shouldDisableWorkflowCreate,
  shouldRenderAgentsHeader,
  shouldRenderWorkflowSection,
} from "@/lib/characters/picker-sections";

describe("picker section helpers", () => {
  it("renders workflows section when there are characters but zero workflows", () => {
    expect(shouldRenderWorkflowSection(3, 0)).toBe(true);
  });

  it("returns emptySearch when workflows exist but are filtered by search", () => {
    expect(
      getWorkflowSectionState({
        workflowCount: 2,
        filteredWorkflowCount: 0,
        searchQuery: "planner",
      })
    ).toBe("emptySearch");
  });

  it("returns empty when there are no workflows and no search query", () => {
    expect(
      getWorkflowSectionState({
        workflowCount: 0,
        filteredWorkflowCount: 0,
        searchQuery: "",
      })
    ).toBe("empty");
  });

  it("enables list state when filtered workflows are present", () => {
    expect(
      getWorkflowSectionState({
        workflowCount: 3,
        filteredWorkflowCount: 1,
        searchQuery: "",
      })
    ).toBe("list");
  });

  it("disables new workflow action when standalone agent count is zero", () => {
    expect(shouldDisableWorkflowCreate(0)).toBe(true);
    expect(shouldDisableWorkflowCreate(2)).toBe(false);
  });

  it("flags missing initiator and disables initiator actions", () => {
    const missingInitiator = hasMissingInitiator("agent-1", ["agent-2", "agent-3"]);
    expect(missingInitiator).toBe(true);
    expect(shouldDisableInitiatorActions(missingInitiator)).toBe(true);
  });

  it("renders agents header when workflow section is shown", () => {
    expect(shouldRenderAgentsHeader(true)).toBe(true);
    expect(shouldRenderAgentsHeader(false)).toBe(false);
  });
});
