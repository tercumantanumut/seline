"use client";

export function CharacterPickerLoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-2 py-6 sm:px-4 lg:px-6 xl:px-8 max-w-[1600px] mx-auto bg-terminal-cream min-h-full w-full">
      <div className="text-center space-y-2">
        <div className="h-7 w-48 bg-muted rounded mx-auto animate-pulse" />
        <div className="h-4 w-72 bg-muted/60 rounded mx-auto animate-pulse" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-terminal-border/40 bg-terminal-cream/60 p-4 space-y-3 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-muted/60 shrink-0" />
              <div className="space-y-1.5 flex-1">
                <div className="h-4 bg-muted/60 rounded w-3/4" />
                <div className="h-3 bg-muted/40 rounded w-1/2" />
              </div>
            </div>
            <div className="h-3 bg-muted/40 rounded w-full" />
            <div className="h-3 bg-muted/40 rounded w-4/5" />
            <div className="flex gap-1.5 mt-2">
              <div className="h-5 w-14 bg-muted/40 rounded-full" />
              <div className="h-5 w-10 bg-muted/40 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
