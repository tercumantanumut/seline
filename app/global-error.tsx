"use client";

/**
 * Last-resort error boundary for the entire Next.js app.
 * Catches any unhandled errors that escape page-level error boundaries.
 * Must render its own <html>/<body> because it replaces the root layout.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          fontFamily: "ui-monospace, monospace",
          backgroundColor: "#faf9f6",
          color: "#1a1a1a",
          margin: 0,
        }}
      >
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <h2 style={{ fontSize: "1.25rem", marginBottom: "1rem" }}>
            Something went wrong
          </h2>
          <p
            style={{
              fontSize: "0.875rem",
              color: "#666",
              marginBottom: "1.5rem",
              maxWidth: "400px",
            }}
          >
            An unexpected error occurred. Click below to try again.
          </p>
          <button
            onClick={reset}
            style={{
              padding: "0.5rem 1.5rem",
              backgroundColor: "#1a1a1a",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "0.875rem",
              fontFamily: "ui-monospace, monospace",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
