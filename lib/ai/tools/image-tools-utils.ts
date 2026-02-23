import { tool, jsonSchema, generateText } from "ai";
import { readLocalFile, fileExists } from "@/lib/storage/local-storage";
import { getVisionModel } from "@/lib/ai/providers";
import { withToolLogging } from "@/lib/ai/tool-registry/logging";

// ==========================================================================
// Shared schema definitions
// ==========================================================================

export const describeImageSchema = jsonSchema<{
  imageUrl: string;
  focusAreas?: string[];
  analysisType?: string;
}>({
  type: "object",
  title: "DescribeImageInput",
  description: "Input schema for image analysis using vision AI",
  properties: {
    imageUrl: {
      type: "string",
      format: "uri",
      description: "URL of the image to analyze (can be a user photo, room image, product image, etc.)",
    },
    focusAreas: {
      type: "array",
      items: { type: "string" },
      description:
        "Specific areas to focus on (e.g., 'person appearance', 'clothing style', 'room layout', 'materials', 'lighting')",
    },
    analysisType: {
      type: "string",
      description:
        "Type of analysis to perform: 'person' for analyzing people/portraits, 'room' for interior spaces, 'product' for items/clothing, 'general' for any image. Default is 'general'.",
    },
  },
  required: ["imageUrl"],
  additionalProperties: false,
});

// ==========================================================================
// imageToDataUrl helper
// ==========================================================================

/**
 * Convert an image URL/path to a data URL for vision model input.
 * Handles local paths, remote URLs, and already-encoded data URLs.
 */
export async function imageToDataUrl(imageSource: string): Promise<string> {
  // Already a data URL
  if (imageSource.startsWith("data:image/")) {
    return imageSource;
  }

  // Local media path - read from local storage
  if (imageSource.startsWith("/api/media/") || imageSource.startsWith("local-media://")) {
    let relativePath = imageSource;
    if (imageSource.startsWith("/api/media/")) {
      relativePath = imageSource.replace("/api/media/", "");
    } else if (imageSource.startsWith("local-media://")) {
      relativePath = imageSource.replace("local-media://", "").replace(/^\/+/, "");
    }

    if (!fileExists(relativePath)) {
      throw new Error(`Local image file not found: ${relativePath}`);
    }

    const buffer = readLocalFile(relativePath);
    const base64 = buffer.toString("base64");
    const ext = relativePath.split(".").pop()?.toLowerCase() || "png";
    const mimeTypes: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
    };
    const mimeType = mimeTypes[ext] || "image/png";
    return `data:${mimeType};base64,${base64}`;
  }

  // Remote URL - fetch and convert
  if (imageSource.startsWith("http://") || imageSource.startsWith("https://")) {
    const response = await fetch(imageSource);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString("base64");
    const contentType = response.headers.get("content-type") || "image/png";
    return `data:${contentType};base64,${base64}`;
  }

  throw new Error(`Unsupported image format: ${imageSource.substring(0, 50)}...`);
}

// ==========================================================================
// Describe Image Tool
// ==========================================================================

// Args interface for describeImage
interface DescribeImageArgs {
  imageUrl: string;
  focusAreas?: string[];
  analysisType?: string;
}

// Result type for describeImage
interface DescribeImageResult {
  success: boolean;
  imageUrl: string;
  analysisType?: string;
  focusAreas?: string[];
  description?: string;
  error?: string;
  suggestion?: string;
}

/**
 * Core describeImage execution logic (extracted for logging wrapper)
 */
async function executeDescribeImage(args: DescribeImageArgs): Promise<DescribeImageResult> {
  const { imageUrl, focusAreas, analysisType } = args;

  console.log(`[describeImage] Analyzing image: ${imageUrl}`);
  console.log(`[describeImage] Focus areas: ${focusAreas?.join(", ") || "general"}`);
  console.log(`[describeImage] Analysis type: ${analysisType || "general"}`);

  try {
    const imageDataUrl = await imageToDataUrl(imageUrl);
    console.log(`[describeImage] Image converted to data URL (${imageDataUrl.length} chars)`);

    const type = analysisType || "general";
    const areas = focusAreas || [];

    let systemPrompt = "You are an expert image analyst. Provide detailed, accurate descriptions of images.";
    let userPrompt = "";

    switch (type) {
      case "person":
        systemPrompt = "You are an expert at analyzing photos of people. Provide detailed, respectful descriptions focusing on visible characteristics that would be relevant for fashion, styling, or personalization purposes.";
        userPrompt = `Analyze this photo of a person. Describe:
1. Apparent gender presentation
2. Approximate age range
3. Body type and build
4. Skin tone
5. Hair color and style
6. Current clothing/outfit if visible
7. Overall style aesthetic
${areas.length > 0 ? `\nPay special attention to: ${areas.join(", ")}` : ""}

Be factual and objective. This information will be used for personalized fashion recommendations.`;
        break;

      case "room":
        systemPrompt = "You are an expert interior designer and space analyst. Provide detailed descriptions of rooms and spaces.";
        userPrompt = `Analyze this room/space image. Describe:
1. Room type and purpose
2. Overall style and aesthetic
3. Color palette
4. Flooring type and condition
5. Wall treatments
6. Lighting (natural and artificial)
7. Key furniture pieces
8. Decorative elements
${areas.length > 0 ? `\nPay special attention to: ${areas.join(", ")}` : ""}

Provide insights useful for interior design recommendations.`;
        break;

      case "product":
        systemPrompt = "You are an expert product analyst specializing in fashion, furniture, and consumer goods.";
        userPrompt = `Analyze this product image. Describe:
1. Product type/category
2. Color(s) and pattern
3. Material/fabric (if discernible)
4. Style characteristics
5. Brand indicators (if visible)
6. Quality indicators
7. Suitable use cases
${areas.length > 0 ? `\nPay special attention to: ${areas.join(", ")}` : ""}

Provide details useful for matching this product with user preferences.`;
        break;

      default:
        userPrompt = `Analyze this image in detail. Describe:
1. Main subject(s)
2. Setting/environment
3. Colors and lighting
4. Notable details
5. Overall mood/aesthetic
${areas.length > 0 ? `\nPay special attention to: ${areas.join(", ")}` : ""}`;
    }

    const visionModel = getVisionModel();
    console.log(`[describeImage] Calling vision model...`);

    const result = await generateText({
      model: visionModel,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", image: imageDataUrl },
            { type: "text", text: userPrompt },
          ],
        },
      ],
      temperature: 0.3,
    });

    console.log(`[describeImage] Vision analysis complete (${result.text.length} chars)`);

    return {
      success: true,
      imageUrl,
      analysisType: type,
      focusAreas: areas,
      description: result.text,
    };
  } catch (error) {
    console.error(`[describeImage] Error analyzing image:`, error);
    return {
      success: false,
      imageUrl,
      error: error instanceof Error ? error.message : "Unknown error analyzing image",
      suggestion: "Please ensure the image URL is accessible and try again.",
    };
  }
}

export function createDescribeImageTool(sessionId?: string) {
  const executeWithLogging = withToolLogging(
    "describeImage",
    sessionId,
    (args: DescribeImageArgs) => executeDescribeImage(args)
  );

  return tool({
    description: `Analyze and describe an image using vision AI. Use this tool to understand image content before making assumptions about people, rooms, products, or any visual content. ALWAYS use this tool to analyze user-uploaded photos before virtual try-on or personalized recommendations.`,
    inputSchema: describeImageSchema,
    execute: executeWithLogging,
  });
}
