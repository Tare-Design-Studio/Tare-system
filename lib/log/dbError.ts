import { NextResponse, type NextRequest } from "next/server";
import { logError } from "@/lib/log/logError";

// DB-error responder. Routes overwhelmingly surface Supabase/PostgREST failures
// as a *returned* error object turned into a manual 500 —
// `if (error) return NextResponse.json(..., { status: 500 })`. Those never
// throw, so they are the app's invisible 500s.
//
// This logs such an error to app_errors (route-scoped) and returns the SAME 500
// shape those sites already returned, so behaviour is unchanged for the client.
// Drop-in replacement for the bare `return NextResponse.json({ error:
// error.message }, { status: 500 })` line.
//
// Request context is best-effort from what the request actually carries:
// x-request-id (lib/auth/middleware.ts forwards it on the request) and the
// pathname. userId is intentionally omitted — we won't pay a DB read on the
// error path. (x-user-id is now forwarded on the request too, so it could be
// read here if per-user attribution is ever wanted on DB errors.)
//
// Awaits the log (logError never throws) so the insert flushes before the
// serverless function returns — a fire-and-forget insert can be dropped when the
// function freezes on response. Every call site is `return dbError(...)`, so the
// await adds no latency the client wasn't already paying for the 500.
//
// Accepts the PostgREST error shape (message + optional code/details/hint) so
// those diagnostic fields land in the stored `detail`, not just the message.
type DbErrorLike = {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
};

export async function dbError(
  error: DbErrorLike,
  source: string,
  req: NextRequest,
): Promise<NextResponse> {
  await logError({
    source: `api/${source}`,
    error,
    level: "error",
    requestId: req.headers.get("x-request-id"),
    path: req.nextUrl?.pathname ?? null,
    context: { method: req.method, code: error.code, details: error.details, hint: error.hint },
  });
  return NextResponse.json({ error: error.message }, { status: 500 });
}
