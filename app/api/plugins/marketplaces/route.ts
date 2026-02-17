import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import {
  addMarketplace,
  getMarketplaces,
  removeMarketplace,
} from "@/lib/plugins/registry";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const authUserId = await requireAuth(request);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(authUserId, settings.localUserEmail);

    const marketplaceList = await getMarketplaces(dbUser.id);
    return NextResponse.json({ marketplaces: marketplaceList });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "Unauthorized" || error.message === "Invalid session")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list marketplaces" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUserId = await requireAuth(request);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(authUserId, settings.localUserEmail);

    const body = await request.json();
    const { name, source } = body;

    if (!name || !source) {
      return NextResponse.json(
        { error: "name and source are required" },
        { status: 400 }
      );
    }

    const marketplace = await addMarketplace({
      userId: dbUser.id,
      name,
      source,
    });

    return NextResponse.json({ marketplace });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "Unauthorized" || error.message === "Invalid session")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add marketplace" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const marketplaceId = searchParams.get("id");

    if (!marketplaceId) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await removeMarketplace(marketplaceId);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "Unauthorized" || error.message === "Invalid session")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to remove marketplace" },
      { status: 500 }
    );
  }
}
