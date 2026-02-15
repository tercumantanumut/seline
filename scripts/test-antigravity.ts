/**
 * Debug script to test Antigravity API directly
 * Run with: npx tsx scripts/test-antigravity.ts
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Manually load settings from file
function loadSettings() {
  // Try .local-data in project first
  const localPath = path.join(process.cwd(), ".local-data", "settings.json");
  if (fs.existsSync(localPath)) {
    console.log("Found settings at:", localPath);
    return JSON.parse(fs.readFileSync(localPath, "utf-8"));
  }

  // Try Electron user data path
  const electronPath = path.join(os.homedir(), "AppData", "Roaming", "seline", "data", "settings.json");
  if (fs.existsSync(electronPath)) {
    console.log("Found settings at:", electronPath);
    return JSON.parse(fs.readFileSync(electronPath, "utf-8"));
  }

  console.log("Checked paths:", localPath, electronPath);
  return {};
}

const ANTIGRAVITY_CONFIG = {
  // Use daily sandbox as primary (same as opencode-antigravity-auth plugin)
  API_BASE_URL: "https://daily-cloudcode-pa.sandbox.googleapis.com",
  API_VERSION: "v1internal",
  // Antigravity headers (not Gemini CLI headers)
  HEADERS: {
    "User-Agent": "antigravity/1.11.5 windows/amd64",
    "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
    "Client-Metadata": '{"ideType":"IDE_UNSPECIFIED","platform":"PLATFORM_UNSPECIFIED","pluginType":"GEMINI"}',
  },
};

async function testAntigravity() {
  console.log("=== Antigravity API Debug Test ===\n");

  // Load settings and get token
  const settings = loadSettings();
  const token = settings.antigravityToken;

  if (!token) {
    console.error("No Antigravity token found in settings!");
    return;
  }

  console.log("Token info:");
  console.log("  - Access token (first 20 chars):", token.access_token?.substring(0, 20) + "...");
  console.log("  - Project ID:", token.project_id || "(NOT SET)");
  console.log("  - Expires at:", new Date(token.expires_at).toISOString());
  console.log("  - Has refresh token:", !!token.refresh_token);
  console.log("");

  let projectId = token.project_id;

  if (!projectId) {
    console.log("⚠️  Project ID is missing! Fetching it from loadCodeAssist API.\n");

    const loadCodeAssistUrl = `${ANTIGRAVITY_CONFIG.API_BASE_URL}/${ANTIGRAVITY_CONFIG.API_VERSION}:loadCodeAssist`;

    try {
      const response = await fetch(loadCodeAssistUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token.access_token}`,
          "Content-Type": "application/json",
          ...ANTIGRAVITY_CONFIG.HEADERS,
        },
        body: JSON.stringify({
          metadata: {
            ideType: "IDE_UNSPECIFIED",
            platform: "PLATFORM_UNSPECIFIED",
            pluginType: "GEMINI",
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        projectId = data.cloudaicompanionProject || data.id;
        console.log("✓ Fetched project ID:", projectId, "\n");
      } else {
        console.log("loadCodeAssist response status:", response.status);
        const text = await response.text();
        console.log("loadCodeAssist response:", text);
        return;
      }
    } catch (e) {
      console.error("loadCodeAssist error:", e);
      return;
    }
  }

  // Test a simple request
  console.log("Testing Antigravity API request...\n");

  const testUrl = `${ANTIGRAVITY_CONFIG.API_BASE_URL}/${ANTIGRAVITY_CONFIG.API_VERSION}:generateContent`;
  
  // All models from Antigravity UI to verify
  const modelsToTest = [
    "gemini-3-pro-high",      // Gemini 3 Pro (High)
    "gemini-3-pro-low",       // Gemini 3 Pro (Low)
    "gemini-3-flash",         // Gemini 3 Flash
    "claude-sonnet-4-5",      // Claude Sonnet 4.5
    "claude-sonnet-4-5-thinking", // Claude Sonnet 4.5 (Thinking)
    "claude-opus-4-6-thinking",   // Claude Opus 4.6 (Thinking)
    "gpt-oss-120b-medium",    // GPT-OSS 120B (Medium)
  ];

  for (const model of modelsToTest) {
    console.log(`\n--- Testing model: ${model} ---`);
    const testBody = {
      project: projectId,
      model: model,
      request: {
        contents: [
          {
            role: "user",
            parts: [{ text: "Say hello in one word." }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 50,
        },
      },
    };

    try {
      const response = await fetch(testUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token.access_token}`,
          "Content-Type": "application/json",
          ...ANTIGRAVITY_CONFIG.HEADERS,
        },
        body: JSON.stringify(testBody),
      });

      console.log("Response status:", response.status, response.statusText);
      if (response.ok) {
        const json = await response.json();
        console.log("✓ Model works! Response:", JSON.stringify(json).substring(0, 150) + "...");
      } else {
        const text = await response.text();
        console.log("✗ Error:", text.substring(0, 150));
      }
    } catch (e) {
      console.error("Request error:", e);
    }
  }
}

testAntigravity().catch(console.error);

