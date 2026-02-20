#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");

class PatchError extends Error {}

function fail(message) {
  throw new PatchError(message);
}

function readPatchFromStdin() {
  const input = fs.readFileSync(0, "utf8");
  if (!input.trim()) {
    fail("No patch content was provided on stdin.");
  }
  return input.replace(/\r\n/g, "\n");
}

function splitLines(text) {
  return text.split("\n");
}

function parsePatch(text) {
  const lines = splitLines(text);
  const beginIndex = lines.indexOf("*** Begin Patch");
  const endIndex = lines.lastIndexOf("*** End Patch");

  if (beginIndex === -1) {
    fail("Missing '*** Begin Patch' marker.");
  }
  if (endIndex === -1 || endIndex <= beginIndex) {
    fail("Missing '*** End Patch' marker.");
  }

  const body = lines.slice(beginIndex + 1, endIndex);
  const actions = [];
  let i = 0;

  while (i < body.length) {
    const line = body[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (line.startsWith("*** Update File: ")) {
      const filePath = line.slice("*** Update File: ".length).trim();
      i += 1;

      let moveTo = null;
      if (i < body.length && body[i].startsWith("*** Move to: ")) {
        moveTo = body[i].slice("*** Move to: ".length).trim();
        i += 1;
      }

      const section = [];
      while (i < body.length && !body[i].startsWith("*** ")) {
        section.push(body[i]);
        i += 1;
      }

      actions.push({
        type: "update",
        filePath,
        moveTo,
        hunks: parseHunks(section, filePath),
      });
      continue;
    }

    if (line.startsWith("*** Add File: ")) {
      const filePath = line.slice("*** Add File: ".length).trim();
      i += 1;
      const contentLines = [];

      while (i < body.length && !body[i].startsWith("*** ")) {
        const contentLine = body[i];
        if (contentLine.startsWith("+")) {
          contentLines.push(contentLine.slice(1));
        } else if (contentLine === "") {
          contentLines.push("");
        } else {
          fail(
            `Invalid line in Add File '${filePath}'. Expected '+' prefix, got: ${JSON.stringify(contentLine)}`,
          );
        }
        i += 1;
      }

      actions.push({ type: "add", filePath, contentLines });
      continue;
    }

    if (line.startsWith("*** Delete File: ")) {
      const filePath = line.slice("*** Delete File: ".length).trim();
      actions.push({ type: "delete", filePath });
      i += 1;
      continue;
    }

    fail(`Unknown patch header: ${line}`);
  }

  return actions;
}

function parseHunks(sectionLines, filePath) {
  const hunks = [];
  let i = 0;

  while (i < sectionLines.length) {
    const header = sectionLines[i];

    if (!header.startsWith("@@")) {
      if (!header.trim()) {
        i += 1;
        continue;
      }
      fail(`Expected hunk header (@@) in '${filePath}', got: ${header}`);
    }

    i += 1;
    const lines = [];

    while (i < sectionLines.length && !sectionLines[i].startsWith("@@")) {
      const line = sectionLines[i];

      if (line === "\\ No newline at end of file") {
        i += 1;
        continue;
      }

      if (line === "") {
        lines.push({ prefix: " ", text: "" });
        i += 1;
        continue;
      }

      const prefix = line[0];
      if (prefix !== " " && prefix !== "+" && prefix !== "-") {
        fail(`Invalid hunk line in '${filePath}': ${line}`);
      }

      lines.push({ prefix, text: line.slice(1) });
      i += 1;
    }

    hunks.push({ header, lines });
  }

  return hunks;
}

function resolveWorkspacePath(relativePath, rootDir) {
  if (!relativePath || relativePath.trim() === "") {
    fail("Encountered an empty file path in patch.");
  }

  if (path.isAbsolute(relativePath)) {
    fail(`Absolute paths are not allowed: ${relativePath}`);
  }

  const normalized = relativePath.replace(/\\/g, "/");
  const resolved = path.resolve(rootDir, normalized);
  if (resolved !== rootDir && !resolved.startsWith(rootDir + path.sep)) {
    fail(`Refusing to write outside current workspace: ${relativePath}`);
  }

  return resolved;
}

function readTextFile(filePath) {
  return fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
}

function toLineArray(text) {
  const hasFinalNewline = text.endsWith("\n");
  const body = hasFinalNewline ? text.slice(0, -1) : text;
  const lines = body.length === 0 ? [] : body.split("\n");
  return { lines, hasFinalNewline };
}

function fromLineArray(lines, hasFinalNewline) {
  if (lines.length === 0) {
    return hasFinalNewline ? "\n" : "";
  }
  return lines.join("\n") + (hasFinalNewline ? "\n" : "");
}

function findSequence(lines, pattern, startIndex) {
  if (pattern.length === 0) {
    return startIndex;
  }

  for (let i = startIndex; i <= lines.length - pattern.length; i += 1) {
    let match = true;
    for (let j = 0; j < pattern.length; j += 1) {
      if (lines[i + j] !== pattern[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      return i;
    }
  }

  return -1;
}

function applyHunksToLines(lines, hunks, filePath) {
  let cursor = 0;

  for (const hunk of hunks) {
    const search = [];
    const replacement = [];

    for (const line of hunk.lines) {
      if (line.prefix !== "+") {
        search.push(line.text);
      }
      if (line.prefix !== "-") {
        replacement.push(line.text);
      }
    }

    let index = findSequence(lines, search, cursor);
    if (index === -1) {
      index = findSequence(lines, search, 0);
    }

    if (index === -1) {
      fail(`Failed to apply hunk (${hunk.header}) for '${filePath}'.`);
    }

    lines.splice(index, search.length, ...replacement);
    cursor = index + replacement.length;
  }
}

function writeFileEnsuringDir(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function applyAction(action, rootDir) {
  if (action.type === "update") {
    const targetPath = resolveWorkspacePath(action.filePath, rootDir);
    if (!fs.existsSync(targetPath)) {
      fail(`Cannot update missing file: ${action.filePath}`);
    }

    const original = readTextFile(targetPath);
    const parsed = toLineArray(original);
    applyHunksToLines(parsed.lines, action.hunks, action.filePath);

    const updated = fromLineArray(parsed.lines, parsed.hasFinalNewline);
    fs.writeFileSync(targetPath, updated, "utf8");

    if (action.moveTo) {
      const movedPath = resolveWorkspacePath(action.moveTo, rootDir);
      fs.mkdirSync(path.dirname(movedPath), { recursive: true });
      fs.renameSync(targetPath, movedPath);
    }
    return;
  }

  if (action.type === "add") {
    const targetPath = resolveWorkspacePath(action.filePath, rootDir);
    if (fs.existsSync(targetPath)) {
      fail(`Cannot add file that already exists: ${action.filePath}`);
    }

    const body = action.contentLines.join("\n");
    const content = body.length > 0 ? `${body}\n` : "";
    writeFileEnsuringDir(targetPath, content);
    return;
  }

  if (action.type === "delete") {
    const targetPath = resolveWorkspacePath(action.filePath, rootDir);
    if (!fs.existsSync(targetPath)) {
      fail(`Cannot delete missing file: ${action.filePath}`);
    }
    fs.unlinkSync(targetPath);
    return;
  }

  fail(`Unknown action type: ${action.type}`);
}

function main() {
  const patchText = readPatchFromStdin();
  const actions = parsePatch(patchText);
  const rootDir = process.cwd();

  for (const action of actions) {
    applyAction(action, rootDir);
  }

  process.stdout.write("Done!\n");
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`apply_patch failed: ${message}\n`);
  process.exitCode = 1;
}
