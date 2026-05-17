import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EnquiriesClient, { type Enquiry } from "./EnquiriesClient";

export default async function EnquiriesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Verify owner capability — enquiry:view
  const { data: cap } = await supabase
    .from("user_capabilities")
    .select("capability")
    .eq("user_id", user.id)
    .eq("capability", "enquiry:view")
    .eq("granted", true)
    .maybeSingle();

  if (!cap) {
    redirect("/");
  }

  const { data: enquiries } = await supabase
    .from("enquiries")
    .select(`
      id, name, phone, email, source, status, message, created_at,
      converted_to_customer_id,
      enquiry_reminders(id, remind_at, message, category, priority, is_done)
    `)
    .order("created_at", { ascending: false });

  return <EnquiriesClient initial={(enquiries ?? []) as unknown as Enquiry[]} />;
}
