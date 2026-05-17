import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  // — Flow 1: PKCE code exchange (default for modern Supabase invites)
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // — Flow 2: Token hash verification (email OTP / magic-link / invite confirm)
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as "invite" | "signup" | "magiclink" | "recovery" | "email",
    });

    if (!error) {
      // Invite flow → always send to /accept so they can set a password
      if (type === "invite") {
        return NextResponse.redirect(`${origin}/accept`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // If there's no code and no token_hash, it might be an implicit grant or error in the hash fragment.
  // Redirect to the client-side confirm page which can read the hash.
  return NextResponse.redirect(`${origin}/auth/confirm`);
}
