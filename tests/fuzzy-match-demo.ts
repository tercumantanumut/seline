
import { applyFileEdits } from "@/lib/ai/filesystem/edit-logic";

function runTest(name: string, fileContent: string, oldString: string, newString: string) {
  console.log(`\n--- Test: ${name} ---`);
  const result = applyFileEdits(fileContent, [{ oldString, newString }]);
  
  if (result.success) {
    console.log("✅ Success");
    console.log("Diff:\n" + result.diff);
    console.log("New Content:\n" + result.newContent);
  } else {
    console.log("❌ Failed:", result.error);
  }
}

// Test 1: Exact Match
runTest(
  "Exact Match",
  `function hello() {
  console.log("world");
}`,
  `console.log("world");`,
  `console.log("universe");`
);

// Test 2: Indentation Mismatch (File uses 2 spaces, search uses 4)
runTest(
  "Indentation Mismatch",
  `function hello() {
  console.log("world");
}`,
  `    console.log("world");`, // 4 spaces
  `    console.log("universe");`
);

// Test 3: Multi-line Indentation Mismatch
runTest(
  "Multi-line Indentation Mismatch",
  `if (true) {
    doSomething();
    doSomethingElse();
}`,
  `doSomething();
doSomethingElse();`, // No indentation in search string
  `doNewThing();
doNewThingElse();`
);

// Test 4: Creation (oldString empty) - Should fail in applyFileEdits as it expects edit logic
// But we can test if it returns error as expected
runTest(
  "Creation Mode Check",
  "",
  "",
  "New Content"
);
