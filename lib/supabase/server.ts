import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import type { Database } from "@/lib/supabase/types";

export async function createClient() {
  const cookieStore = await cookies();
  // Forward the audit correlation id (set by middleware on the request headers)
  // to PostgREST so the audit_trigger() captures it via
  // current_setting('request.headers')->>'x-request-id'.
  const requestId = (await headers()).get("x-request-id");
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...(requestId ? { global: { headers: { "x-request-id": requestId } } } : {}),
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component; cookies cannot be set.
            // Middleware handles session refresh.
          }
        },
      },
    }
  );
}
