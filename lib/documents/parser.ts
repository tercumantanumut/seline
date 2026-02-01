import { existsSync } from "fs";
import { extname, join } from "path";
import { pathToFileURL } from "url";

export type SupportedDocumentFormat = "pdf" | "markdown" | "html" | "text";

export interface ParsedDocument {
  format: SupportedDocumentFormat;
  text: string;
  pageCount?: number;
}

function detectFormat(contentType: string, filename: string): SupportedDocumentFormat {
  const lowerType = contentType.toLowerCase();
  const ext = extname(filename).toLowerCase();

  if (lowerType.includes("pdf") || ext === ".pdf") {
    return "pdf";
  }
  if (lowerType.includes("markdown") || ext === ".md" || ext === ".markdown") {
    return "markdown";
  }
  if (lowerType.includes("html") || ext === ".html" || ext === ".htm") {
    return "html";
  }
  return "text";
}

/**
 * Extract text from a document buffer, supporting PDF/text/Markdown/HTML.
 *
 * PDF extraction uses the `pdf-parse` library at runtime via dynamic import.
 * If the library is not installed, a descriptive error is thrown.
 */
export async function extractTextFromDocument(
  buffer: Buffer,
  contentType: string,
  filename: string
): Promise<ParsedDocument> {
  const format = detectFormat(contentType, filename);

  switch (format) {
    case "pdf": {
      const { text, pageCount } = await extractFromPdf(buffer);
      return { format, text, pageCount };
    }
    case "markdown": {
      const text = normalizeMarkdown(buffer.toString("utf8"));
      return { format, text };
    }
    case "html": {
      const text = extractTextFromHtml(buffer.toString("utf8"));
      return { format, text };
    }
    case "text":
    default: {
      const text = buffer.toString("utf8");
      return { format: "text", text };
    }
  }
}

async function extractFromPdf(buffer: Buffer): Promise<{ text: string; pageCount?: number }> {
  try {
    // Use dynamic import so the module is only loaded on demand
    const pdfModule = await import("pdf-parse");
    const PDFParse = (pdfModule as any).PDFParse;

    if (typeof PDFParse === "function") {
      if (typeof PDFParse.setWorker === "function") {
        const workerPath = join(
          process.cwd(),
          "node_modules",
          "pdfjs-dist",
          "legacy",
          "build",
          "pdf.worker.mjs"
        );
        if (existsSync(workerPath)) {
          PDFParse.setWorker(pathToFileURL(workerPath).href);
        }
      }

      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();
        const rawText: string = result.text ?? "";
        const normalized = rawText.replace(/\r\n/g, "\n").trim();
        const pageCount = typeof result.total === "number" ? result.total : undefined;

        return { text: normalized, pageCount };
      } finally {
        if (typeof parser.destroy === "function") {
          await parser.destroy();
        }
      }
    }

    const pdfParse = (pdfModule as any).default ?? (pdfModule as any);
    if (typeof pdfParse !== "function") {
      throw new Error("Unsupported pdf-parse export shape.");
    }

    const result = await pdfParse(buffer);
    const rawText: string = result.text ?? "";
    const normalized = rawText.replace(/\r\n/g, "\n").trim();

    const pageCount: number | undefined =
      typeof (result as any).numpages === "number"
        ? (result as any).numpages
        : typeof (result as any).numPages === "number"
        ? (result as any).numPages
        : undefined;

    return { text: normalized, pageCount };
  } catch (error) {
    console.error("PDF parsing error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new Error(
      `Failed to parse PDF document: ${errorMessage}. This may be due to a corrupted, encrypted, or incompatible PDF file.`
    );
  }
}

function normalizeMarkdown(markdown: string): string {
  // Remove YAML frontmatter if present
  let text = markdown.replace(/^---[\s\S]*?---\s*/u, "");

  // Convert links and images to their visible text
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");

  // Remove fenced code blocks
  text = text.replace(/```[\s\S]*?```/g, "");

  // Remove inline code markers
  text = text.replace(/`([^`]+)`/g, "$1");

  // Collapse multiple blank lines
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

function extractTextFromHtml(html: string): string {
  // Remove script and style blocks
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, " ");

  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, " ");

  // Decode a few common HTML entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

  // Collapse whitespace
  text = text.replace(/\s+/g, " ");

  return text.trim();
}

