"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { BrowserSessionViewer } from "@/components/browser-session/browser-session-viewer";

function BrowserSessionContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return (
      <div className="flex h-full items-center justify-center text-white/50 font-mono text-sm">
        No session ID provided
      </div>
    );
  }

  return <BrowserSessionViewer sessionId={sessionId} />;
}

export default function BrowserSessionPage() {
  return (
    <Suspense fallback={
      <div className="flex h-full items-center justify-center text-white/50 font-mono text-sm">
        Loading session...
      </div>
    }>
      <BrowserSessionContent />
    </Suspense>
  );
}
