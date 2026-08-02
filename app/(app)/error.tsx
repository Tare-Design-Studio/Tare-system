"use client";

import { useEffect } from "react";
import { reportClientError } from "@/components/errors/reportClientError";

// Route-segment error boundary for the authed app. Catches render/effect throws
// below (app)/layout.tsx, reports them to app_errors, and offers a retry that
// re-renders the segment without a full page load.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError(error, "app");
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="w-full max-w-md rounded-lg border border-line bg-paper-light p-8 text-center">
        <h1 className="font-serif text-2xl text-ink">Something went wrong</h1>
        <p className="mt-3 text-sm text-tan">
          This page failed to load. The error has been logged — try again, and if it
          keeps happening, let us know.
        </p>
        {error.digest && (
          <p className="mt-4 font-mono text-xs text-tan">Reference: {error.digest}</p>
        )}
        <button
          type="button"
          onClick={reset}
          className="mt-6 rounded-md bg-forest px-5 py-2 text-sm text-white transition-colors hover:bg-forest-light"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
