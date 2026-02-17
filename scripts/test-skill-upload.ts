/**
 * Test script to diagnose skill upload behavior
 * 
 * This script tests:
 * 1. Backend receives the file correctly
 * 2. Backend processes it within timeout
 * 3. Backend returns proper response
 * 
 * Run with: npx tsx scripts/test-skill-upload.ts
 */

import fs from "fs";
import path from "path";
import FormData from "form-data";

const API_URL = "http://localhost:3000/api/skills/import";

async function testUpload(filePath: string, characterId: string) {
  console.log(`\n🧪 Testing upload: ${path.basename(filePath)}`);
  console.log("─".repeat(60));

  const startTime = Date.now();
  
  try {
    // Read file
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    
    console.log(`📦 File size: ${(fileBuffer.length / 1024).toFixed(2)} KB`);
    
    // Create form data
    const formData = new FormData();
    formData.append("file", fileBuffer, {
      filename: fileName,
      contentType: fileName.endsWith(".zip") 
        ? "application/zip" 
        : "text/markdown",
    });
    formData.append("characterId", characterId);
    
    console.log(`⏱️  Upload started at ${new Date().toISOString()}`);
    
    // Make request
    const response = await fetch(API_URL, {
      method: "POST",
      body: formData as any,
      headers: {
        // Include auth cookie if needed
        // Cookie: "session=..."
      },
    });
    
    const elapsed = Date.now() - startTime;
    console.log(`⏱️  Response received after ${elapsed}ms`);
    
    const responseText = await response.text();
    
    console.log(`\n📊 Response Status: ${response.status} ${response.statusText}`);
    console.log(`📄 Response Body:`);
    
    try {
      const json = JSON.parse(responseText);
      console.log(JSON.stringify(json, null, 2));
      
      if (response.ok) {
        console.log(`\n✅ Upload successful!`);
        console.log(`   - Skill ID: ${json.skillId}`);
        console.log(`   - Skill Name: ${json.skillName}`);
        console.log(`   - Files: ${json.filesImported}`);
        console.log(`   - Scripts: ${json.scriptsFound}`);
      } else {
        console.log(`\n❌ Upload failed!`);
        console.log(`   - Error: ${json.error}`);
      }
    } catch (e) {
      console.log(responseText);
    }
    
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.log(`\n❌ Request failed after ${elapsed}ms`);
    console.error(error);
  }
  
  console.log("─".repeat(60));
}

// Usage
const testFile = process.argv[2];
const characterId = process.argv[3] || "test-character-id";

if (!testFile) {
  console.error(`
Usage: npx tsx scripts/test-skill-upload.ts <file-path> [character-id]

Examples:
  npx tsx scripts/test-skill-upload.ts ./test.md
  npx tsx scripts/test-skill-upload.ts ./skill-package.zip char-123
  `);
  process.exit(1);
}

if (!fs.existsSync(testFile)) {
  console.error(`❌ File not found: ${testFile}`);
  process.exit(1);
}

testUpload(testFile, characterId);
