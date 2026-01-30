import { NextRequest, NextResponse } from "next/server";
import { detectComfyUIBaseUrl, resolveCustomComfyUIBaseUrl } from "@/lib/comfyui/custom/client";

export async function GET() {
  try {
    const resolved = await resolveCustomComfyUIBaseUrl();
    return NextResponse.json({ baseUrl: resolved.baseUrl, source: resolved.source });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "ComfyUI connection failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { host?: string; ports?: number[]; useHttps?: boolean };
    const result = await detectComfyUIBaseUrl({
      host: body.host,
      ports: body.ports,
      useHttps: body.useHttps,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "ComfyUI detection failed" },
      { status: 500 }
    );
  }
}
