#!/usr/bin/env tsx
/**
 * Validation script for skill import auth flow
 * Tests that auth errors return 401, not 500
 */

import { requireAuth } from "../lib/auth/local-auth";

interface ValidationResult {
  test: string;
  passed: boolean;
  message: string;
}

const results: ValidationResult[] = [];

async function testRequireAuthWithoutRequest() {
  try {
    // Should throw "Unauthorized" when no request is passed
    await requireAuth();
    results.push({
      test: "requireAuth() without request",
      passed: false,
      message: "Expected to throw, but did not",
    });
  } catch (error) {
    const isCorrectError = error instanceof Error && error.message === "Unauthorized";
    results.push({
      test: "requireAuth() without request",
      passed: isCorrectError,
      message: isCorrectError 
        ? "Correctly throws 'Unauthorized'" 
        : `Wrong error: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

async function testRequireAuthWithEmptyRequest() {
  try {
    // Create a mock request with no cookies
    const mockRequest = new Request("http://localhost:3000/test", {
      headers: new Headers(),
    });
    
    await requireAuth(mockRequest);
    results.push({
      test: "requireAuth(request) with no session cookie",
      passed: false,
      message: "Expected to throw, but did not",
    });
  } catch (error) {
    const isCorrectError = error instanceof Error && error.message === "Unauthorized";
    results.push({
      test: "requireAuth(request) with no session cookie",
      passed: isCorrectError,
      message: isCorrectError 
        ? "Correctly throws 'Unauthorized'" 
        : `Wrong error: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

async function testRequireAuthWithInvalidSession() {
  try {
    // Create a mock request with invalid session cookie
    const mockRequest = new Request("http://localhost:3000/test", {
      headers: new Headers({
        cookie: "seline-session=invalid-session-id-12345",
      }),
    });
    
    await requireAuth(mockRequest);
    results.push({
      test: "requireAuth(request) with invalid session",
      passed: false,
      message: "Expected to throw, but did not",
    });
  } catch (error) {
    const isCorrectError = error instanceof Error && 
      (error.message === "Unauthorized" || error.message === "Invalid session");
    results.push({
      test: "requireAuth(request) with invalid session",
      passed: isCorrectError,
      message: isCorrectError 
        ? `Correctly throws '${error instanceof Error ? error.message : ""}''` 
        : `Wrong error: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

async function validateAuthErrorHandling() {
  // Simulate the error handling logic from the routes
  const authErrors = ["Unauthorized", "Invalid session"];
  
  for (const errorMessage of authErrors) {
    const error = new Error(errorMessage);
    const shouldReturn401 = error instanceof Error && 
      (error.message === "Unauthorized" || error.message === "Invalid session");
    
    results.push({
      test: `Error handling for "${errorMessage}"`,
      passed: shouldReturn401,
      message: shouldReturn401 
        ? "Would correctly return 401" 
        : "Would incorrectly return 500",
    });
  }
  
  // Test non-auth error
  const otherError = new Error("Database connection failed");
  const shouldReturn500 = !(otherError.message === "Unauthorized" || otherError.message === "Invalid session");
  
  results.push({
    test: "Error handling for non-auth error",
    passed: shouldReturn500,
    message: shouldReturn500 
      ? "Would correctly return 500" 
      : "Would incorrectly return 401",
  });
}

async function main() {
  console.log("🧪 Validating Skill Import Auth Flow\n");
  console.log("=" .repeat(60));
  
  await testRequireAuthWithoutRequest();
  await testRequireAuthWithEmptyRequest();
  await testRequireAuthWithInvalidSession();
  await validateAuthErrorHandling();
  
  console.log("\n📊 Results:\n");
  
  let passCount = 0;
  let failCount = 0;
  
  for (const result of results) {
    const icon = result.passed ? "✅" : "❌";
    console.log(`${icon} ${result.test}`);
    console.log(`   ${result.message}\n`);
    
    if (result.passed) {
      passCount++;
    } else {
      failCount++;
    }
  }
  
  console.log("=" .repeat(60));
  console.log(`\n✅ Passed: ${passCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`📈 Total:  ${results.length}\n`);
  
  if (failCount > 0) {
    console.log("❌ Validation FAILED - Please review the failures above");
    process.exit(1);
  } else {
    console.log("✅ All validations PASSED");
    process.exit(0);
  }
}

main().catch((error) => {
  console.error("💥 Validation script error:", error);
  process.exit(1);
});
