import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, clientIp } from "@/lib/auth/rateLimit";
import { logError } from "@/lib/log/logError";

// Client-side error sink. The app/global error boundaries POST here so a client
// crash lands in app_errors, the same tenant-visible log as server errors.
// Rate-limited per user so a crash-looping client can't flood the table.
const bodySchema = z.object({
  message: z.string().max(2000),
  stack: z.string().max(8000).optional(),
  digest: z.string().max(200).optional(),
  path: z.string().max(500).optional(),
  scope: z.enum(["app", "global"]).optional(),
});

export async function POST(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = await createClient() as any;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Anonymous client errors (e.g. global-error before auth) are still worth
  // capturing, but rate-limit by IP then; authed errors rate-limit by user.
  const ip = await clientIp();
  const identifier = user?.id ?? ip ?? "";
  const ok = await checkRateLimit({
    kind: "client_error",
    identifier,
    limit: 20,
    windowSeconds: 300,
    ip,
  });
  if (!ok) return NextResponse.json({ ok: false }, { status: 429 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }
  const { message, stack, digest, path, scope } = parsed.data;

  let tenantId: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("users")
      .select("tenant_id")
      .eq("id", user.id)
      .single();
    tenantId = profile?.tenant_id ?? null;
  }

  // Reconstruct a real Error so logError stores the clean message (not a
  // stringified object) and keeps the client stack in detail.
  const clientError = new Error(message);
  clientError.name = "ClientError";
  if (stack) clientError.stack = stack;

  await logError({
    source: `client/${scope ?? "app"}`,
    error: clientError,
    level: "error",
    tenantId,
    userId: user?.id ?? null,
    requestId: req.headers.get("x-request-id"),
    path: path ?? null,
    context: { digest },
  });

  return NextResponse.json({ ok: true });
}
