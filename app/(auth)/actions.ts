"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, clientIp } from "@/lib/auth/rateLimit";

export type AuthState = { error: string } | null;

export async function signIn(prevState: AuthState, formData: FormData): Promise<AuthState> {
  const email = (formData.get("email") as string | null)?.trim() ?? "";
  const password = (formData.get("password") as string | null) ?? "";

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  // Throttle credential-stuffing: 10 attempts / 5 min per IP.
  const ip = await clientIp();
  if (ip) {
    const ok = await checkRateLimit({
      kind: "login",
      identifier: ip,
      limit: 10,
      windowSeconds: 300,
      ip,
    });
    if (!ok) {
      return { error: "Too many attempts. Please wait a few minutes and try again." };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.message.toLowerCase().includes("invalid")) {
      return { error: "Incorrect email or password. Please try again." };
    }
    return { error: error.message };
  }

  // Check MFA assurance level — redirect to TOTP challenge if needed
  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalData && aalData.currentLevel !== aalData.nextLevel) {
    redirect("/login/verify");
  }

  redirect("/");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function verifyMfa(prevState: AuthState, formData: FormData): Promise<AuthState> {
  const code = (formData.get("code") as string | null)?.trim() ?? "";

  if (!code || code.length !== 6) {
    return { error: "Enter the 6-digit code from your authenticator app." };
  }

  // Throttle TOTP brute-force: 10 attempts / 5 min per IP.
  const ip = await clientIp();
  if (ip) {
    const ok = await checkRateLimit({
      kind: "mfa_verify",
      identifier: ip,
      limit: 10,
      windowSeconds: 300,
      ip,
    });
    if (!ok) {
      return { error: "Too many attempts. Please wait a few minutes and try again." };
    }
  }

  const supabase = await createClient();

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totpFactor = factors?.totp?.[0];

  if (!totpFactor) {
    return { error: "No MFA factor found. Please sign in again." };
  }

  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: totpFactor.id,
    code,
  });

  if (error) {
    return { error: "Invalid code. Check your authenticator app and try again." };
  }

  redirect("/");
}

export async function setPassword(prevState: AuthState, formData: FormData): Promise<AuthState> {
  const password = (formData.get("password") as string | null) ?? "";
  const confirm = (formData.get("confirm") as string | null) ?? "";

  if (!password || password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (password !== confirm) {
    return { error: "Passwords do not match." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: error.message };
  }

  // Mark user as active
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await supabase
      .from("users")
      .update({ is_active: true, invitation_token_hash: null })
      .eq("id", user.id);
  }

  redirect("/");
}
