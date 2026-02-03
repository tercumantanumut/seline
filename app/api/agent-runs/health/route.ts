import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import { findZombieRuns } from "@/lib/observability/queries";

/**
 * GET - List zombie agent runs (running with no recent updates)
 */
export async function GET(req: Request) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);

    const zombies = await findZombieRuns(5);
    const userZombies = zombies.filter((run) => run.userId === dbUser.id);

    return NextResponse.json({
      count: userZombies.length,
      runIds: userZombies.map((run) => run.id),
    });
  } catch (error) {
    console.error("Agent run health error:", error);
    return NextResponse.json({ error: "Failed to check agent run health" }, { status: 500 });
  }
}
