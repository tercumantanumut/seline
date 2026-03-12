"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Shell } from "@/components/layout/shell";

/**
 * Route-level error boundary for the chat page.
 *
 * Catches React errors that escape ChatErrorBoundary (e.g. errors in
 * ChatProvider itself, ChatInterface hooks, or hydration failures).
 * Unlike global-error.tsx this preserves the root layout — providers,
 * toaster, sidebar state etc. all survive.
 *
 * The `reset` callback re-renders the route's server component tree,
 * which is a softer recovery than a full page reload and won't destroy
 * any layout-level state (theme, auth, task notifications).
 */
export default function ChatError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error("[ChatError] Route-level error caught:", error);
  }, [error]);

  return (
    <Shell>
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4 max-w-md text-center">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <h2 className="text-lg font-semibold">Something went wrong</h2>
          <p className="text-sm text-muted-foreground">
            The chat encountered an error. Your conversation and any background
            processes are safe.
          </p>
          <div className="flex gap-3">
            <Button variant="outline" size="sm" onClick={() => router.push("/")}>
              Go home
            </Button>
            <Button size="sm" onClick={reset}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Retry
            </Button>
          </div>
        </div>
      </div>
    </Shell>
  );
}
