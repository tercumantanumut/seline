import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execSync, execFileSync } from "child_process";
import { StdioClientTransport } from "@/lib/mcp/stdio-transport";

type ChildPayload = {
  pid: number;
  execPath: string;
  argv: string[];
  env: {
    ELECTRON_RUN_AS_NODE: string | null;
    npm_config_script_shell: string | null;
  };
};

type CmdProcessInfo = {
  ProcessId: number;
  ParentProcessId: number;
  CommandLine?: string | null;
};

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    return err.code === "EPERM";
  }
}

async function waitForFile(filePath: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(filePath)) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for file: ${filePath}`);
}

function getCmdProcessInfos(): CmdProcessInfo[] {
  if (process.platform !== "win32") {
    return [];
  }
  const output = execFileSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      "Get-CimInstance Win32_Process -Filter \"Name='cmd.exe'\" | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress",
    ],
    { encoding: "utf8", timeout: 5000, windowsHide: true },
  ).trim();
  if (!output) {
    return [];
  }
  const parsed = JSON.parse(output) as CmdProcessInfo | CmdProcessInfo[] | null;
  if (!parsed) {
    return [];
  }
  return Array.isArray(parsed) ? parsed : [parsed];
}

describe("StdioClientTransport (integration)", () => {
  it("spawns a long-running MCP child without immediate exit", async () => {
    const scriptPath = path.join(process.cwd(), "tests", "fixtures", "mcp-idle-server.js");
    const outputPath = path.join(os.tmpdir(), `mcp-stdio-${process.pid}-${Date.now()}.json`);

    const transport = new StdioClientTransport({
      command: "node",
      args: [scriptPath, outputPath],
      stderr: "pipe",
    });

    const cmdBefore = process.platform === "win32" ? getCmdProcessInfos() : [];

    try {
      await transport.start();
      const pid = transport.pid;
      expect(pid).not.toBeNull();
      if (!pid) {
        return;
      }

      if (process.platform === "win32") {
        await new Promise(resolve => setTimeout(resolve, 150));
        const after = getCmdProcessInfos();
        const beforeIds = new Set(cmdBefore.map(entry => entry.ProcessId));
        const offenders = after.filter(entry => {
          if (beforeIds.has(entry.ProcessId)) {
            return false;
          }
          return entry.ParentProcessId === process.pid || entry.ParentProcessId === pid;
        });
        expect(offenders).toEqual([]);
      }

      await waitForFile(outputPath, 2000);
      const payload = JSON.parse(fs.readFileSync(outputPath, "utf8")) as ChildPayload;

      let expectedExecPath = process.execPath;
      let expectRunAsNode = true;
      if (process.platform !== "win32") {
        try {
          const resolved = execSync("command -v node", {
            encoding: "utf8",
            timeout: 2000,
          }).trim();
          if (resolved && path.isAbsolute(resolved)) {
            expectedExecPath = resolved;
            expectRunAsNode = false;
          }
        } catch {
          // Ignore command lookup failures.
        }
      }

      const resolvedPayloadExecPath = fs.existsSync(payload.execPath)
        ? fs.realpathSync(payload.execPath)
        : payload.execPath;
      const resolvedExpectedExecPath = fs.existsSync(expectedExecPath)
        ? fs.realpathSync(expectedExecPath)
        : expectedExecPath;
      expect(resolvedPayloadExecPath).toBe(resolvedExpectedExecPath);
      if (expectRunAsNode) {
        expect(payload.env.ELECTRON_RUN_AS_NODE).toBe("1");
      } else {
        expect(payload.env.ELECTRON_RUN_AS_NODE).toBeNull();
      }
      // if (process.platform === "win32") {
      //   expect(payload.env.npm_config_script_shell).toBe(process.execPath);
      // }

      await new Promise(resolve => setTimeout(resolve, 200));
      expect(isProcessAlive(pid)).toBe(true);
    } finally {
      await transport.close();
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
    }
  });

  it("uses bundled npm CLI scripts when packaged resources are present", async () => {
    const fixturePath = path.join(process.cwd(), "tests", "fixtures", "mcp-idle-server.js");
    const resourcesRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-resources-"));
    const npmBinDir = path.join(resourcesRoot, "standalone", "node_modules", "npm", "bin");
    fs.mkdirSync(npmBinDir, { recursive: true });

    const originalResourcesPath = process.env.ELECTRON_RESOURCES_PATH;
    process.env.ELECTRON_RESOURCES_PATH = resourcesRoot;

    try {
      const cliCommands = [
        { command: "npx", cliName: "npx-cli.js" },
        { command: "npm", cliName: "npm-cli.js" },
      ];

      for (const { command, cliName } of cliCommands) {
        const cliPath = path.join(npmBinDir, cliName);
        fs.copyFileSync(fixturePath, cliPath);
        const outputPath = path.join(os.tmpdir(), `mcp-stdio-${command}-${Date.now()}.json`);

        const transport = new StdioClientTransport({
          command,
          args: [outputPath],
          stderr: "pipe",
        });

        try {
          await transport.start();
          await waitForFile(outputPath, 2000);
          const payload = JSON.parse(fs.readFileSync(outputPath, "utf8")) as ChildPayload;

          expect(payload.execPath).toBe(process.execPath);
          expect(payload.env.ELECTRON_RUN_AS_NODE).toBe("1");
          // if (process.platform === "win32") {
          //   expect(payload.env.npm_config_script_shell).toBe(process.execPath);
          // }
        } finally {
          await transport.close();
          if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
          }
        }
      }
    } finally {
      if (originalResourcesPath === undefined) {
        delete process.env.ELECTRON_RESOURCES_PATH;
      } else {
        process.env.ELECTRON_RESOURCES_PATH = originalResourcesPath;
      }
      fs.rmSync(resourcesRoot, { recursive: true, force: true });
    }
  });
});
