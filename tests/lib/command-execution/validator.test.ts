
import { validateCommand } from "@/lib/command-execution/validator";
import assert from "assert";

console.log("Running Command Validator Tests...");

try {
    // Dangerous Characters
    assert.strictEqual(validateCommand("echo 'hacked'", []).valid, false, "Should reject commands with single quotes");
    assert.strictEqual(validateCommand('echo "hacked"', []).valid, false, "Should reject commands with double quotes");
    assert.strictEqual(validateCommand("echo; rm -rf", []).valid, false, "Should reject ;");
    assert.strictEqual(validateCommand("echo && rm -rf", []).valid, false, "Should reject &&");
    assert.strictEqual(validateCommand("echo | bash", []).valid, false, "Should reject |");

    // Safe commands
    assert.strictEqual(validateCommand("echo", ["hello"]).valid, true, "Should allow safe echo");
    assert.strictEqual(validateCommand("ls", ["-la"]).valid, true, "Should allow safe ls");

    // Dangerous Commands Blocklist
    assert.strictEqual(validateCommand("rm", []).valid, false, "Should block rm");
    assert.strictEqual(validateCommand("format", []).valid, false, "Should block format");

    // Safe commands with dangerous substrings
    assert.strictEqual(validateCommand("format-json", []).valid, true, "Should allow format-json");
    assert.strictEqual(validateCommand("my-rm-tool", []).valid, true, "Should allow my-rm-tool");
    assert.strictEqual(validateCommand("performance", []).valid, true, "Should allow performance");

    // Path Traversal
    assert.strictEqual(validateCommand("ls", [".."]).valid, false, "Should block .. arg");
    assert.strictEqual(validateCommand("ls", ["../secret"]).valid, false, "Should block ../secret arg");
    assert.strictEqual(validateCommand("ls", ["-p=../secret"]).valid, false, "Should block .. in flag");
    assert.strictEqual(validateCommand("ls", ["--path=../secret"]).valid, false, "Should block .. in long flag");

    console.log("✅ All Validator Tests Passed!");
} catch (e: any) {
    console.error("❌ Test Failed:", e.message);
    process.exit(1);
}
