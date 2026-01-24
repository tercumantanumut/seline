
import { db } from "@/lib/db/sqlite-client";
import { agentSyncFolders } from "@/lib/db/sqlite-character-schema";
import { eq } from "drizzle-orm";
import { writeFile } from "fs/promises";
import { join } from "path";
import { resolveMCPConfig } from "@/lib/mcp/client-manager";

async function diagnose() {
    console.log("🔍 Diagnosing Filesystem Permissions and MCP Config...");

    // 1. Check Synced Folders
    const folders = await db.select().from(agentSyncFolders);
    console.log(`\n📂 Found ${folders.length} synced folders in DB:`);
    folders.forEach(f => {
        console.log(` - [${f.id}] ${f.folderPath} (Primary: ${f.isPrimary})`);
    });

    if (folders.length === 0) {
        console.error("❌ No synced folders found. This is why writes might fail.");
        return;
    }

    const targetFolder = folders[0].folderPath;
    const testFile = join(targetFolder, "seline-diagnostic-test.txt");

    // 2. Test Node.js Write Permissions (Bypassing MCP)
    console.log(`\n✍️ Testing direct Node.js write to: ${testFile}`);
    try {
        await writeFile(testFile, "Direct write from Seline backend success!");
        console.log("✅ Direct write successful! (OS permissions are OK)");
    } catch (error) {
        console.error("❌ Direct write FAILED:", error);
        console.error("   This suggests an OS-level permission issue for the terminal/process.");
    }

    // 3. Test Variable Resolution
    console.log("\n🔧 Testing MCP Config Resolution:");
    const mockConfig = {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "${SYNCED_FOLDERS_ARRAY}"]
    };

    // Mock character ID from the folder found
    const characterId = folders[0].characterId;

    try {
        // We need to mock env for this test
        const resolved = await resolveMCPConfig(
            "filesystem-test",
            mockConfig,
            {}, // env
            characterId
        );

        console.log("   Input Args:", mockConfig.args);
        console.log("   Resolved Args:", resolved.args);

        const hasCorrectPath = resolved.args?.some(a => a === targetFolder);
        if (hasCorrectPath) {
            console.log("✅ Resolution logic is working correctly!");
        } else {
            console.error("❌ Resolution failed to inject the correct folder path.");
        }

    } catch (error) {
        console.error("❌ Error during resolution:", error);
    }

    console.log("\n🏁 Diagnosis complete.");
    process.exit(0);
}

diagnose().catch(console.error);
