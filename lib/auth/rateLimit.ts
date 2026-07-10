import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

/** Read the caller's client IP from the standard proxy headers. */
export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    null
  );
}

interface RateLimitOptions {
  kind: string;
  identifier: string;
  limit: number;
  windowSeconds: number;
  /** Client IP, recorded on the abuse log row when throttled. */
  ip?: string | null;
}

/**
 * Returns true when the caller is within the limit, false when throttled.
 * Backed by check_auth_rate_limit() (079). Fails OPEN on RPC error or a
 * missing identifier so a rate-limit outage never locks users out.
 */
export async function checkRateLimit({
  kind,
  identifier,
  limit,
  windowSeconds,
  ip = null,
}: RateLimitOptions): Promise<boolean> {
  if (!identifier) return true;
  const h = await headers();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("check_auth_rate_limit", {
    p_kind: kind,
    p_identifier: identifier,
    p_limit: limit,
    p_window_seconds: windowSeconds,
    p_ip: ip,
    p_user_agent: h.get("user-agent") ?? null,
    p_request_id: h.get("x-request-id") ?? null,
  });
  if (error) return true; // fail open
  return data !== false;
}
