import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { listFiles, downloadFile } from "@huggingface/hub";

describe("@huggingface/hub download (integration)", () => {
  // Use a small model for faster tests
  const testModelId = "sentence-transformers/all-MiniLM-L6-v2";
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hf-download-test-"));
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("can list files from a model repository", async () => {
    const files: { path: string; size?: number }[] = [];

    for await (const file of listFiles({ repo: testModelId, recursive: true })) {
      if (file.type === "file" && !file.path.startsWith(".git/")) {
        files.push({ path: file.path, size: file.size });
      }
    }

    expect(files.length).toBeGreaterThan(0);
    // Should include config.json
    expect(files.some((f) => f.path === "config.json")).toBe(true);
  }, 30000);

  it("can download a single file from a model repository", async () => {
    const blob = await downloadFile({
      repo: testModelId,
      path: "config.json",
    });

    expect(blob).not.toBeNull();
    if (blob) {
      const buffer = await blob.arrayBuffer();
      expect(buffer.byteLength).toBeGreaterThan(0);

      // Verify it's valid JSON
      const text = new TextDecoder().decode(buffer);
      const config = JSON.parse(text);
      expect(config).toHaveProperty("model_type");
    }
  }, 30000);

  it("can write downloaded file to disk", async () => {
    const blob = await downloadFile({
      repo: testModelId,
      path: "config.json",
    });

    expect(blob).not.toBeNull();
    if (blob) {
      const buffer = await blob.arrayBuffer();
      const filePath = path.join(tempDir, "config.json");
      fs.writeFileSync(filePath, Buffer.from(buffer));

      expect(fs.existsSync(filePath)).toBe(true);
      const content = JSON.parse(fs.readFileSync(filePath, "utf8"));
      expect(content).toHaveProperty("model_type");
    }
  }, 30000);
});
