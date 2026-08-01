import { NextResponse, type NextRequest } from "next/server";
import { logError } from "@/lib/log/logError";

// Route-handler error wrapper. Wrap a route handler; anything it throws is
// logged to app_errors with route context, then a generic 500 JSON is returned
// (never leaking internals to the client).
//
// Gives structured, route-scoped logging for handlers you wrap explicitly — and
// a consistent 500 shape. Handlers that catch-and-return their own responses are
// unaffected; only an actual throw reaches here.
//
// User is best-effort from the x-user-id header the middleware sets; we
// deliberately avoid an extra DB read on the error path.
//
// Generic over the route context so it wraps handlers with any `params` shape
// (e.g. { params: Promise<{ id: string }> }) without loosening their types.
type RouteHandler<Ctx> = (req: NextRequest, ctx: Ctx) => Promise<Response> | Response;

export function withRouteErrorLog<Ctx>(
  source: string,
  handler: RouteHandler<Ctx>,
): RouteHandler<Ctx> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (error) {
      await logError({
        source: `api/${source}`,
        error,
        level: "error",
        userId: req.headers.get("x-user-id"),
        requestId: req.headers.get("x-request-id"),
        path: req.nextUrl?.pathname ?? null,
        context: { method: req.method },
      });
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  };
}
