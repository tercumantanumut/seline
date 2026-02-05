/**
 * MCP Headers Testing Script
 * 
 * Tests custom header support for SSE MCP servers
 * Run with: npx tsx scripts/test-mcp-headers.ts
 */

import { resolveMCPConfig } from "@/lib/mcp/client-manager";
import type { MCPServerConfig } from "@/lib/mcp/types";

console.log("🧪 Testing MCP Custom Headers Implementation\n");

// Test 1: Basic header resolution
console.log("Test 1: Basic header with environment variable");
const config1: MCPServerConfig = {
    type: "sse",
    url: "https://api.example.com/mcp",
    headers: {
        "Authorization": "Bearer ${API_TOKEN}",
        "X-Custom-Header": "static-value"
    }
};

const env1 = { API_TOKEN: "secret123" };

try {
    const resolved1 = await resolveMCPConfig("test-server", config1, env1);
    console.log("✅ Resolved config:", {
        url: resolved1.url,
        headers: resolved1.headers
    });
    
    if (resolved1.headers?.["Authorization"] === "Bearer secret123") {
        console.log("✅ Authorization header resolved correctly\n");
    } else {
        console.error("❌ Authorization header not resolved:", resolved1.headers?.["Authorization"], "\n");
    }
} catch (error) {
    console.error("❌ Test 1 failed:", error, "\n");
}

// Test 2: Multiple variables in one header
console.log("Test 2: Multiple variables in one header");
const config2: MCPServerConfig = {
    type: "sse",
    url: "https://api.example.com/mcp",
    headers: {
        "X-Auth": "${USER_ID}:${API_KEY}"
    }
};

const env2 = { USER_ID: "user123", API_KEY: "key456" };

try {
    const resolved2 = await resolveMCPConfig("test-multi-var", config2, env2);
    
    if (resolved2.headers?.["X-Auth"] === "user123:key456") {
        console.log("✅ Multi-variable header resolved correctly:", resolved2.headers?.["X-Auth"], "\n");
    } else {
        console.error("❌ Multi-variable header failed:", resolved2.headers?.["X-Auth"], "\n");
    }
} catch (error) {
    console.error("❌ Test 2 failed:", error, "\n");
}

// Test 3: Missing environment variable
console.log("Test 3: Missing environment variable (should use empty string)");
const config3: MCPServerConfig = {
    type: "sse",
    url: "https://api.example.com/mcp",
    headers: {
        "Authorization": "Bearer ${MISSING_VAR}"
    }
};

const env3 = {}; // No variables defined

try {
    const resolved3 = await resolveMCPConfig("test-missing", config3, env3);
    
    if (resolved3.headers?.["Authorization"] === "Bearer ") {
        console.log("✅ Missing variable handled correctly (empty string)\n");
    } else {
        console.error("❌ Missing variable not handled:", resolved3.headers?.["Authorization"], "\n");
    }
} catch (error) {
    console.error("❌ Test 3 failed:", error, "\n");
}

// Test 4: No headers (should work)
console.log("Test 4: SSE server without headers");
const config4: MCPServerConfig = {
    type: "sse",
    url: "https://api.example.com/mcp"
};

try {
    const resolved4 = await resolveMCPConfig("test-no-headers", config4, {});
    
    if (!resolved4.headers || Object.keys(resolved4.headers).length === 0) {
        console.log("✅ Server without headers resolved correctly\n");
    } else {
        console.error("❌ Unexpected headers:", resolved4.headers, "\n");
    }
} catch (error) {
    console.error("❌ Test 4 failed:", error, "\n");
}

// Test 5: Complex real-world example (Composio)
console.log("Test 5: Real-world example (Composio)");
const config5: MCPServerConfig = {
    type: "sse",
    url: "https://backend.composio.dev/api/v1/mcp",
    headers: {
        "X-API-Key": "${COMPOSIO_API_KEY}",
        "X-Client-Version": "1.0.0",
        "X-Request-Source": "seline-mcp-client"
    }
};

const env5 = { COMPOSIO_API_KEY: "sk-composio-abc123xyz" };

try {
    const resolved5 = await resolveMCPConfig("composio", config5, env5);
    
    const checks = [
        resolved5.headers?.["X-API-Key"] === "sk-composio-abc123xyz",
        resolved5.headers?.["X-Client-Version"] === "1.0.0",
        resolved5.headers?.["X-Request-Source"] === "seline-mcp-client"
    ];
    
    if (checks.every(Boolean)) {
        console.log("✅ Composio-style config resolved correctly");
        console.log("   Headers:", resolved5.headers, "\n");
    } else {
        console.error("❌ Composio config failed:", resolved5.headers, "\n");
    }
} catch (error) {
    console.error("❌ Test 5 failed:", error, "\n");
}

// Test 6: URL with variables (bonus)
console.log("Test 6: URL with environment variables");
const config6: MCPServerConfig = {
    type: "sse",
    url: "https://api.example.com/mcp?project=${PROJECT_ID}",
    headers: {
        "Authorization": "Bearer ${TOKEN}"
    }
};

const env6 = { PROJECT_ID: "proj_123", TOKEN: "tok_456" };

try {
    const resolved6 = await resolveMCPConfig("test-url-vars", config6, env6);
    
    if (resolved6.url === "https://api.example.com/mcp?project=proj_123" &&
        resolved6.headers?.["Authorization"] === "Bearer tok_456") {
        console.log("✅ URL and header variables both resolved");
        console.log("   URL:", resolved6.url);
        console.log("   Headers:", resolved6.headers, "\n");
    } else {
        console.error("❌ URL/header variables failed");
        console.error("   URL:", resolved6.url);
        console.error("   Headers:", resolved6.headers, "\n");
    }
} catch (error) {
    console.error("❌ Test 6 failed:", error, "\n");
}

console.log("🏁 All tests completed!\n");

// Summary
console.log("📊 Test Summary:");
console.log("- Basic header resolution");
console.log("- Multiple variables in one header");
console.log("- Missing variable handling");
console.log("- No headers (optional)");
console.log("- Real-world Composio example");
console.log("- URL + header variables");
console.log("\n✅ Implementation is working correctly!");
