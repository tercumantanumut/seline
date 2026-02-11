import {
  generateLexicalVector,
  lexicalSimilarity,
  tokenizeForLex,
  LEX_DIM,
} from "@/lib/vectordb/v2/lexical-vectors";

describe("lexical vectors", () => {
  it("should tokenize camelCase and snake_case", () => {
    // Common stop words (e.g. "by") are removed.
    expect(tokenizeForLex("getUserById")).toEqual(["get", "user", "id"]);
    expect(tokenizeForLex("get_user_by_id")).toEqual(["get", "user", "id"]);
  });

  it("should generate normalized vector", () => {
    const vec = generateLexicalVector("test");
    expect(vec.length).toBe(LEX_DIM);
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it("should compute cosine similarity", () => {
    const vecA = generateLexicalVector("get user");
    const vecB = generateLexicalVector("get user");
    const vecC = generateLexicalVector("delete account");

    expect(lexicalSimilarity(vecA, vecB)).toBeCloseTo(1, 5);
    expect(lexicalSimilarity(vecA, vecC)).toBeLessThan(1);
  });
});
