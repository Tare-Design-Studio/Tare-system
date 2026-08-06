import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "My profile — ArchitectOS" };

/**
 * A member's own profile (096). The member detail page already renders exactly
 * these cards — attendance, tasks, leave, site hours — and since 096 it lets a
 * caller read their OWN row without office_attendance:view_all. So this is a
 * stable self-link rather than a second copy of that page.
 *
 * The owner is sent to the dashboard: that page has no owner metrics to show.
 */
export default async function MyProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role === "owner") redirect("/team");
  redirect(`/team/${user.id}`);
}
