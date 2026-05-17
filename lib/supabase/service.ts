import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

// Service role client — bypasses RLS.
// NEVER import this from client components or public routes.
// Only used in: migration scripts, scheduled workers, admin-only server actions.
export function createServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
