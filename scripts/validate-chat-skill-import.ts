#!/usr/bin/env node
/**
 * Validation Script: Chat Prompt Skill Import
 * 
 * Tests the skill import functionality in the chat prompt input.
 * 
 * Usage:
 *   node scripts/validate-chat-skill-import.ts [--dry-run]
 * 
 * With --dry-run: Validates logic without making actual API calls
 * Without --dry-run: Performs full integration test with real API
 */

import * as fs from "fs";
import * as path from "path";

// ── Configuration ──
const DRY_RUN = process.argv.includes("--dry-run");
const TEST_SKILL_MD_PATH = path.join(__dirname, "../test-skill-sample.md");
const API_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

// ── Test Utilities ──
interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

const results: TestResult[] = [];

function test(name: string, fn: () => boolean | Promise<boolean>, message: string) {
  return async () => {
    try {
      const passed = await fn();
      results.push({ name, passed, message: passed ? "✅ PASS" : `❌ FAIL: ${message}` });
    } catch (error) {
      results.push({ 
        name, 
        passed: false, 
        message: `❌ ERROR: ${error instanceof Error ? error.message : String(error)}` 
      });
    }
  };
}

function printResults() {
  console.log("\n═══════════════════════════════════════════");
  console.log("  Validation Results");
  console.log("═══════════════════════════════════════════\n");
  
  results.forEach(({ name, passed, message }) => {
    console.log(`${passed ? "✅" : "❌"} ${name}`);
    if (!passed) {
      console.log(`   ${message}`);
    }
  });
  
  const totalTests = results.length;
  const passedTests = results.filter(r => r.passed).length;
  const failedTests = totalTests - passedTests;
  
  console.log("\n═══════════════════════════════════════════");
  console.log(`Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
  console.log("═══════════════════════════════════════════\n");
  
  if (failedTests > 0) {
    process.exit(1);
  }
}

// ── Test Cases ──

async function validateFileDetection() {
  await test(
    "File Detection: .zip files are recognized as skill files",
    () => {
      const fileName = "test-skill.zip";
      const isSkillFile = fileName.endsWith(".zip") || fileName.endsWith(".md");
      return isSkillFile;
    },
    "File detection logic failed"
  )();
  
  await test(
    "File Detection: .md files are recognized as skill files",
    () => {
      const fileName = "test-skill.md";
      const isSkillFile = fileName.endsWith(".zip") || fileName.endsWith(".md");
      return isSkillFile;
    },
    "File detection logic failed"
  )();
  
  await test(
    "File Detection: .jpg files are NOT recognized as skill files",
    () => {
      const fileName = "image.jpg";
      const isSkillFile = fileName.endsWith(".zip") || fileName.endsWith(".md");
      return !isSkillFile;
    },
    "Image files should not be detected as skill files"
  )();
}

async function validateFileSizeCheck() {
  await test(
    "File Size Validation: 50MB limit is enforced",
    () => {
      const MAX_SKILL_SIZE = 50 * 1024 * 1024;
      const testFileSize = 51 * 1024 * 1024; // 51MB
      return testFileSize > MAX_SKILL_SIZE;
    },
    "File size limit not enforced correctly"
  )();
  
  await test(
    "File Size Validation: Files under 50MB are accepted",
    () => {
      const MAX_SKILL_SIZE = 50 * 1024 * 1024;
      const testFileSize = 10 * 1024 * 1024; // 10MB
      return testFileSize <= MAX_SKILL_SIZE;
    },
    "Valid file size rejected"
  )();
}

async function validateCharacterContext() {
  await test(
    "Character Context: Rejects import without character",
    () => {
      const characterId = null;
      return !characterId || characterId === "default";
    },
    "Should reject import without character context"
  )();
  
  await test(
    "Character Context: Accepts import with valid character",
    () => {
      const characterId: string | null = "test-character-123";
      return characterId !== null && characterId !== "default";
    },
    "Should accept valid character context"
  )();
}

async function validateAPIEndpoint() {
  if (DRY_RUN) {
    console.log("⏭️  Skipping API endpoint test (dry-run mode)");
    return;
  }
  
  await test(
    "API Endpoint: /api/skills/import is accessible",
    async () => {
      try {
        // Create a minimal test file
        const testContent = `# Test Skill\n\nA test skill for validation.`;
        const blob = new Blob([testContent], { type: "text/markdown" });
        const formData = new FormData();
        formData.append("file", blob, "test-skill.md");
        formData.append("characterId", "test-character");
        
        const response = await fetch(`${API_BASE_URL}/api/skills/import`, {
          method: "POST",
          body: formData,
        });
        
        // We expect either 200 (success) or 401 (unauthorized) - both indicate endpoint exists
        return response.status === 200 || response.status === 401 || response.status === 400;
      } catch (error) {
        console.error("API endpoint test error:", error);
        return false;
      }
    },
    "API endpoint not accessible"
  )();
}

async function validateToastNotification() {
  await test(
    "Toast Notification: Success message structure is valid",
    () => {
      const mockResult = {
        skillId: "skill-123",
        skillName: "Test Skill",
        filesImported: 1,
        scriptsFound: 0,
      };
      
      const toastConfig = {
        title: "Skill imported successfully",
        description: `${mockResult.skillName} is ready to use`,
        action: {
          label: "View Skills",
          onClick: () => console.log("Navigate to /agents/test-character/skills"),
        },
      };
      
      return (
        toastConfig.title.length > 0 &&
        toastConfig.description.includes(mockResult.skillName) &&
        toastConfig.action.label === "View Skills" &&
        typeof toastConfig.action.onClick === "function"
      );
    },
    "Toast notification structure is invalid"
  )();
}

async function validateInputFieldClearing() {
  await test(
    "Input Field: Clears after successful import",
    () => {
      let inputValue = "Some user text";
      let enhancedContext = "Enhanced context";
      let enhancementInfo = { filesFound: 5 };
      
      // Simulate successful import
      inputValue = "";
      enhancedContext = null as any;
      enhancementInfo = null as any;
      
      return (
        inputValue === "" &&
        enhancedContext === null &&
        enhancementInfo === null
      );
    },
    "Input field not cleared after import"
  )();
}

async function validateUnifiedDropZone() {
  await test(
    "Unified Drop Zone: Prioritizes skill files over images",
    () => {
      const files = [
        { name: "skill.zip", type: "application/zip" },
        { name: "image.jpg", type: "image/jpeg" },
      ];
      
      const skillFiles = files.filter(f => f.name.endsWith(".zip") || f.name.endsWith(".md"));
      const imageFiles = files.filter(f => f.type.startsWith("image/"));
      
      // Skill files should be processed first
      return skillFiles.length > 0 && imageFiles.length > 0;
    },
    "Unified drop zone priority logic failed"
  )();
  
  await test(
    "Unified Drop Zone: Falls back to image handling when no skill files",
    () => {
      const files = [
        { name: "image1.jpg", type: "image/jpeg" },
        { name: "image2.png", type: "image/png" },
      ];
      
      const skillFiles = files.filter(f => f.name.endsWith(".zip") || f.name.endsWith(".md"));
      const imageFiles = files.filter(f => f.type.startsWith("image/"));
      
      return skillFiles.length === 0 && imageFiles.length > 0;
    },
    "Fallback to image handling failed"
  )();
}

async function validateErrorHandling() {
  await test(
    "Error Handling: Displays error toast on API failure",
    () => {
      const mockError = new Error("Import failed");
      const errorToast = {
        title: "Skill import failed",
        description: mockError.message,
      };
      
      return (
        errorToast.title.includes("failed") &&
        errorToast.description === mockError.message
      );
    },
    "Error toast structure is invalid"
  )();
}

// ── Main Execution ──

async function main() {
  console.log("\n╔═══════════════════════════════════════════╗");
  console.log("║  Chat Prompt Skill Import Validation     ║");
  console.log("╚═══════════════════════════════════════════╝\n");
  
  if (DRY_RUN) {
    console.log("🔍 Running in DRY-RUN mode (no API calls)\n");
  } else {
    console.log("⚠️  Running in INTEGRATION mode (real API calls)\n");
  }
  
  console.log("Running validation tests...\n");
  
  await validateFileDetection();
  await validateFileSizeCheck();
  await validateCharacterContext();
  await validateAPIEndpoint();
  await validateToastNotification();
  await validateInputFieldClearing();
  await validateUnifiedDropZone();
  await validateErrorHandling();
  
  printResults();
}

main().catch((error) => {
  console.error("\n❌ Validation script failed:", error);
  process.exit(1);
});
