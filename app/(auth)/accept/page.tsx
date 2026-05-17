import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AcceptForm } from "./AcceptForm";

export const metadata = { title: "Accept Invitation — ArchitectOS" };

export default async function AcceptPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Fetch the user's name from our users table
  const { data: profile } = await supabase
    .from("users")
    .select("full_name, is_active")
    .eq("id", user.id)
    .single();

  // If already active (not an invited user), go to dashboard
  if (profile?.is_active) redirect("/");

  const name = profile?.full_name ?? user.email ?? "there";

  return <AcceptForm name={name} />;
}
