import { describe, it, expect } from "vitest";
import { validateCommand } from "@/lib/command-execution/validator";

describe("Command Validator Tests", () => {
    it("Should reject commands with single quotes", () => {
        expect(validateCommand("echo 'hacked'", []).valid).toBe(false);
    });

    it("Should reject commands with double quotes", () => {
        expect(validateCommand('echo "hacked"', []).valid).toBe(false);
    });

    it("Should reject ;", () => {
        expect(validateCommand("echo; rm -rf", []).valid).toBe(false);
    });

    it("Should reject &&", () => {
        expect(validateCommand("echo && rm -rf", []).valid).toBe(false);
    });

    it("Should reject |", () => {
        expect(validateCommand("echo | bash", []).valid).toBe(false);
    });

    it("Should allow safe echo", () => {
        expect(validateCommand("echo", ["hello"]).valid).toBe(true);
    });

    it("Should allow safe ls", () => {
        expect(validateCommand("ls", ["-la"]).valid).toBe(true);
    });

    it("Should block rm", () => {
        expect(validateCommand("rm", []).valid).toBe(false);
    });

    it("Should block format", () => {
        expect(validateCommand("format", []).valid).toBe(false);
    });

    it("Should allow format-json", () => {
        expect(validateCommand("format-json", []).valid).toBe(true);
    });

    it("Should allow my-rm-tool", () => {
        expect(validateCommand("my-rm-tool", []).valid).toBe(true);
    });

    it("Should allow performance", () => {
        expect(validateCommand("performance", []).valid).toBe(true);
    });

    it("Should block .. arg", () => {
        expect(validateCommand("ls", [".."]).valid).toBe(false);
    });

    it("Should block ../secret arg", () => {
        expect(validateCommand("ls", ["../secret"]).valid).toBe(false);
    });

    it("Should block .. in flag", () => {
        expect(validateCommand("ls", ["-p=../secret"]).valid).toBe(false);
    });

    it("Should block .. in long flag", () => {
        expect(validateCommand("ls", ["--path=../secret"]).valid).toBe(false);
    });
});
