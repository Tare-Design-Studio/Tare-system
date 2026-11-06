import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Site engineers never see customer data (migration 128 blocks it in the DB);
// this keeps them off the pages entirely.
export default async function CustomersLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (me?.role === "site_engineer") redirect("/site");
  return <>{children}</>;
}
