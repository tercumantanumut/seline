import { describe, expect, it } from "vitest";
import { applyFileEdits } from "@/lib/ai/filesystem/edit-logic";

describe("applyFileEdits", () => {
  it("handles exact match", () => {
    const content = `function hello() {
  console.log("world");
}`;
    const oldString = `console.log("world");`;
    const newString = `console.log("universe");`;

    const result = applyFileEdits(content, [{ oldString, newString }]);
    expect(result.success).toBe(true);
    expect(result.newContent).toContain(`console.log("universe");`);
  });

  it("handles indentation mismatch (fuzzy match)", () => {
    const content = `function hello() {
  console.log("world");
}`;
    const oldString = `    console.log("world");`; // 4 spaces
    const newString = `    console.log("universe");`;

    const result = applyFileEdits(content, [{ oldString, newString }]);
    expect(result.success).toBe(true);
    // Should preserve original 2 space indentation
    expect(result.newContent).toContain(`  console.log("universe");`);
  });

  it("handles multi-line indentation mismatch", () => {
    const content = `if (true) {
    doSomething();
    doSomethingElse();
}`;
    const oldString = `doSomething();
doSomethingElse();`; // No indentation
    const newString = `doNewThing();
doNewThingElse();`;

    const result = applyFileEdits(content, [{ oldString, newString }]);
    expect(result.success).toBe(true);
    // Should have 4 spaces indentation
    expect(result.newContent).toContain(`    doNewThing();`);
    expect(result.newContent).toContain(`    doNewThingElse();`);
  });

  it("fails if oldString not found", () => {
    const content = `console.log("hello");`;
    const oldString = `console.log("world");`;
    const newString = `foo`;

    const result = applyFileEdits(content, [{ oldString, newString }]);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Could not find oldString");
  });

  it("fails if multiple matches found", () => {
    const content = `
console.log("hello");
console.log("hello");
`;
    const oldString = `console.log("hello");`;
    const newString = `foo`;

    const result = applyFileEdits(content, [{ oldString, newString }]);
    expect(result.success).toBe(false);
    expect(result.error).toContain("matches multiple locations");
  });
});
