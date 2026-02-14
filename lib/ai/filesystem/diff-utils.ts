import { basename } from "path";

/**
 * Generates a unified diff-like string with line numbers for a string replacement.
 *
 * @param filePath The path of the file being edited
 * @param originalContent The full original content of the file
 * @param oldString The string being replaced
 * @param newString The replacement string
 */
export function generateLineNumberDiff(
  filePath: string,
  originalContent: string,
  oldString: string,
  newString: string
): string {
  const fileName = basename(filePath);
  const startIdx = originalContent.indexOf(oldString);
  
  if (startIdx === -1) return `Error: oldString not found in ${fileName}`;

  // Calculate start line number
  const preMatch = originalContent.substring(0, startIdx);
  const startLine = preMatch.split("\n").length;

  const oldLines = oldString.split("\n");
  const newLines = newString.split("\n");

  let output = [`--- ${fileName}`, `+++ ${fileName}`];
  
  output.push(`@@ -${startLine},${oldLines.length} +${startLine},${newLines.length} @@`);

  oldLines.forEach((line, i) => {
    output.push(`${startLine + i} | - ${line}`);
  });

  newLines.forEach((line, i) => {
    output.push(`${startLine + i} | + ${line}`);
  });

  return output.join("\n");
}

/**
 * Generates a preview of the new content with line numbers.
 * Useful for file creation or full overwrite.
 */
export function generateContentPreview(
  filePath: string,
  content: string,
  maxLines: number = 20
): string {
  const fileName = basename(filePath);
  const lines = content.split("\n");
  const totalLines = lines.length;
  
  let output = [`File: ${fileName} (${totalLines} lines)`];
  
  const previewLines = lines.slice(0, maxLines);
  previewLines.forEach((line, i) => {
    output.push(`${i + 1} | ${line}`);
  });
  
  if (totalLines > maxLines) {
    output.push(`... (${totalLines - maxLines} more lines)`);
  }
  
  return output.join("\n");
}
