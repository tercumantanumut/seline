import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import { getSkillTelemetryCounters } from "@/lib/skills/telemetry";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);

    const hoursRaw = req.nextUrl.searchParams.get("hours");
    const hours = hoursRaw ? Number.parseInt(hoursRaw, 10) : 24;
    const counters = await getSkillTelemetryCounters(dbUser.id, Number.isFinite(hours) ? hours : 24);

    const copySuccess = counters.events.skill_copy_succeeded || 0;
    const copyFailed = counters.events.skill_copy_failed || 0;
    const copyFailureRate = copySuccess + copyFailed > 0 ? copyFailed / (copySuccess + copyFailed) : 0;

    const alerts = [
      {
        key: "copy_failure_rate",
        threshold: 0.25,
        observed: Number(copyFailureRate.toFixed(4)),
        status: copyFailureRate > 0.25 ? "critical" : copyFailureRate > 0.1 ? "warning" : "ok",
      },
      {
        key: "library_zero_result_rate",
        threshold: 0.4,
        observed:
          (counters.events.skill_library_zero_results || 0) /
          Math.max((counters.events.skill_library_opened || 0), 1),
        status:
          (counters.events.skill_library_zero_results || 0) /
            Math.max((counters.events.skill_library_opened || 0), 1) >
          0.4
            ? "warning"
            : "ok",
      },
    ];

    return NextResponse.json({
      windowHours: counters.windowHours,
      counters: counters.events,
      alerts,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to compute alerts" },
      { status: 500 }
    );
  }
}