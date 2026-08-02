"use client";

import { useEffect } from "react";
import { reportClientError } from "@/components/errors/reportClientError";

// Last-resort boundary: catches throws in the root layout itself. When this
// renders it REPLACES the root layout, so it must supply its own <html>/<body>
// and cannot depend on globals.css or the font variables defined there —
// hence the inline styles with literal brand values.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError(error, "global");
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#F3EFE7",
          color: "#1B1A17",
          fontFamily: "system-ui, sans-serif",
          padding: "1.5rem",
        }}
      >
        <div
          style={{
            maxWidth: "28rem",
            width: "100%",
            textAlign: "center",
            backgroundColor: "#FBF8F2",
            border: "1px solid #E2DBCC",
            borderRadius: "0.5rem",
            padding: "2rem",
          }}
        >
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: "1.5rem", margin: 0 }}>
            Something went wrong
          </h1>
          <p style={{ marginTop: "0.75rem", fontSize: "0.875rem", color: "#8A857B" }}>
            The app failed to start. The error has been logged — reloading usually
            clears it.
          </p>
          {error.digest && (
            <p
              style={{
                marginTop: "1rem",
                fontFamily: "monospace",
                fontSize: "0.75rem",
                color: "#8A857B",
              }}
            >
              Reference: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              backgroundColor: "#2D6A4F",
              color: "#fff",
              border: "none",
              borderRadius: "0.375rem",
              padding: "0.5rem 1.25rem",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
