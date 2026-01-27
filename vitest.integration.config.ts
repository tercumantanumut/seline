import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.integration.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/tmp-clawdbot/**"],
    testTimeout: 120000, // 2 minutes for API calls
    hookTimeout: 60000,
    setupFiles: ["./tests/setup-integration.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
