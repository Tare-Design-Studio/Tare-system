import { createServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/lib/supabase/types";

export interface LogErrorInput {
  /** Where the error came from, e.g. "api/expenses", "proxy", "drive-sync". */
  source: string;
  /** The error itself (Error, string, or anything thrown). */
  error: unknown;
  level?: "error" | "warn" | "fatal";
  tenantId?: string | null;
  userId?: string | null;
  requestId?: string | null;
  path?: string | null;
  /** Extra structured context merged into the stored `detail` jsonb. */
  context?: Record<string, unknown>;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try { return JSON.stringify(error); } catch { return "Unknown error"; }
}

function detailOf(error: unknown, context?: Record<string, unknown>): Record<string, unknown> {
  const base: Record<string, unknown> =
    error instanceof Error ? { name: error.name, stack: error.stack } : { value: error };
  return context ? { ...base, ...context } : base;
}

/**
 * Records an application error to `app_errors` (migration 085) via the
 * service-role client. Layer-6 monitoring — lets us operate without a
 * third-party service.
 *
 * NEVER throws: a logging failure must not break the request path. Best-effort
 * insert; on any failure it swallows and returns. Safe to `await` or fire-and-
 * forget in a catch block.
 */
export async function logError(input: LogErrorInput): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = createServiceClient() as any;
    await svc.from("app_errors").insert({
      source: input.source,
      level: input.level ?? "error",
      message: messageOf(input.error),
      // detail is JSON-serializable by construction; cast through unknown to Json.
      detail: detailOf(input.error, input.context) as unknown as Json,
      tenant_id: input.tenantId ?? null,
      user_id: input.userId ?? null,
      request_id: input.requestId ?? null,
      path: input.path ?? null,
    });
  } catch {
    // Intentionally swallow — logging must never surface its own failure.
  }
}
