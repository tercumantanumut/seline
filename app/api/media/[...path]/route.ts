import { NextRequest, NextResponse } from "next/server";
import { readLocalFile, fileExists, getFullPath } from "@/lib/storage/local-storage";
import { readFileSync, statSync } from "fs";
import { join } from "path";

// Content type mapping
const contentTypes: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  glb: "model/gltf-binary",
};

// Video extensions that need Range request support
const videoExtensions = new Set(["mp4", "webm", "mov"]);

// Common CORS headers for cross-origin access (needed by Remotion's bundler server)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
};

/**
 * OPTIONS /api/media/[...path]
 * Handle CORS preflight requests
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

/**
 * GET /api/media/[...path]
 * Serves local media files with support for:
 * - HTTP Range requests (required for video streaming/seeking)
 * - CORS headers (required for Remotion's headless browser)
 * - Proper content type detection
 *
 * Path format: /api/media/sessionId/role/filename.ext
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathParts } = await params;

    if (!pathParts || pathParts.length === 0) {
      return NextResponse.json({ error: "No path provided" }, { status: 400, headers: corsHeaders });
    }

    // Join path parts to get relative path
    const relativePath = pathParts.join("/");

    // Security: validate path doesn't try to escape
    if (relativePath.includes("..") || relativePath.startsWith("/")) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400, headers: corsHeaders });
    }

    // Check if file exists
    if (!fileExists(relativePath)) {
      console.error("[Media API] File not found:", relativePath);
      return NextResponse.json({ error: "File not found" }, { status: 404, headers: corsHeaders });
    }

    // Get full path and file stats
    const fullPath = getFullPath(relativePath);
    const stats = statSync(fullPath);
    const fileSize = stats.size;

    // Determine content type from extension
    const ext = relativePath.split(".").pop()?.toLowerCase() || "";
    const contentType = contentTypes[ext] || "application/octet-stream";
    const isVideo = videoExtensions.has(ext);

    // Check for Range header (required for video streaming)
    const rangeHeader = request.headers.get("range");

    if (rangeHeader && isVideo) {
      // Parse Range header: "bytes=start-end"
      const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
      if (match) {
        const start = match[1] ? parseInt(match[1], 10) : 0;
        const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;

        // Validate range
        if (start >= fileSize || end >= fileSize || start > end) {
          return new NextResponse(null, {
            status: 416, // Range Not Satisfiable
            headers: {
              ...corsHeaders,
              "Content-Range": `bytes */${fileSize}`,
            },
          });
        }

        const chunkSize = end - start + 1;

        // Read the requested chunk
        const fileBuffer = readFileSync(fullPath);
        const chunk = fileBuffer.subarray(start, end + 1);

        // Convert to ArrayBuffer for Web Response
        const arrayBuffer = chunk.buffer.slice(
          chunk.byteOffset,
          chunk.byteOffset + chunk.byteLength
        ) as ArrayBuffer;

        return new NextResponse(arrayBuffer, {
          status: 206, // Partial Content
          headers: {
            ...corsHeaders,
            "Content-Type": contentType,
            "Content-Length": chunkSize.toString(),
            "Content-Range": `bytes ${start}-${end}/${fileSize}`,
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      }
    }

    // Full file response (for images or when no Range header)
    const fileBuffer = readLocalFile(relativePath);

    // Convert Node.js Buffer to ArrayBuffer for Web Response compatibility
    const arrayBuffer = fileBuffer.buffer.slice(
      fileBuffer.byteOffset,
      fileBuffer.byteOffset + fileBuffer.byteLength
    ) as ArrayBuffer;

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Content-Length": fileBuffer.length.toString(),
        "Accept-Ranges": isVideo ? "bytes" : "none",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("[Media API] Error serving file:", error);
    return NextResponse.json(
      { error: "Failed to serve file" },
      { status: 500, headers: corsHeaders }
    );
  }
}

