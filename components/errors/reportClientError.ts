// Ships a client-side crash to /api/log-client-error so it lands in app_errors
// alongside server errors. Deliberately fire-and-forget and fully swallowed: a
// failure to report must never surface a second error inside an error boundary.
//
// keepalive lets the POST survive a navigation away from the broken page.
export function reportClientError(
  error: Error & { digest?: string },
  scope: "app" | "global",
): void {
  try {
    const body = JSON.stringify({
      message: String(error?.message ?? "Unknown client error").slice(0, 2000),
      stack: error?.stack?.slice(0, 8000),
      digest: error?.digest?.slice(0, 200),
      path: typeof window === "undefined" ? undefined : window.location.pathname.slice(0, 500),
      scope,
    });

    void fetch("/api/log-client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Reporting is best-effort; never let it throw.
  }
}
