import { NextResponse } from "next/server";
import {
    isAntigravityAuthenticated,
    needsTokenRefresh,
    refreshAntigravityToken,
    getAntigravityToken,
    invalidateAntigravityAuthCache,
} from "@/lib/auth/antigravity-auth";
import { invalidateSettingsCache } from "@/lib/settings/settings-manager";

export async function POST() {
    try {
        // CRITICAL: Invalidate all caches before reading token state
        // This prevents race conditions where stale cached data causes
        // incorrect auth state display on the Settings page
        invalidateSettingsCache();
        invalidateAntigravityAuthCache();

        const token = getAntigravityToken();

        if (!token) {
            return NextResponse.json({ refreshed: false, reason: "no_token" });
        }

        // Check if token is expired or needs refresh
        const now = Date.now();
        const isExpired = token.expires_at <= now;
        const needsRefresh = needsTokenRefresh() || isExpired;

        if (needsRefresh && token.refresh_token) {
            console.log("[AntigravityRefresh] Refreshing token...");
            const success = await refreshAntigravityToken();
            return NextResponse.json({
                refreshed: success,
                reason: success ? "refreshed" : "refresh_failed"
            });
        }

        return NextResponse.json({ refreshed: false, reason: "not_needed" });
    } catch (error) {
        console.error("[AntigravityRefresh] Error:", error);
        return NextResponse.json(
            { refreshed: false, reason: "error" },
            { status: 500 }
        );
    }
}
