"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Loader2Icon } from "lucide-react";

interface OnboardingGuardProps {
    children: React.ReactNode;
}

/**
 * OnboardingGuard checks if onboarding is complete and redirects to /onboarding if not.
 * This component should wrap pages that require onboarding to be complete.
 */
export function OnboardingGuard({ children }: OnboardingGuardProps) {
    const [checking, setChecking] = useState(true);
    const [shouldRedirect, setShouldRedirect] = useState(false);
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        // Skip check for onboarding, API routes, settings, and auth pages
        const skipPaths = ["/onboarding", "/api", "/settings", "/login", "/signup"];
        if (skipPaths.some(path => pathname.startsWith(path))) {
            setChecking(false);
            return;
        }

        async function checkOnboarding() {
            try {
                const res = await fetch("/api/onboarding");
                const state = await res.json();

                if (!state.isComplete) {
                    setShouldRedirect(true);
                    router.push("/onboarding");
                }
            } catch (error) {
                console.error("Failed to check onboarding state:", error);
                // Don't block the app if check fails
            } finally {
                setChecking(false);
            }
        }

        checkOnboarding();
    }, [pathname, router]);

    if (checking) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-terminal-cream">
                <div className="flex flex-col items-center gap-4">
                    <Loader2Icon className="size-8 animate-spin text-terminal-green" />
                    <p className="animate-pulse font-mono text-terminal-muted">
                        Loading...
                    </p>
                </div>
            </div>
        );
    }

    if (shouldRedirect) {
        return null; // Router will handle redirect
    }

    return <>{children}</>;
}
