import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EnquiryDetail from "./EnquiryDetail";

type Params = { params: Promise<{ id: string }> };

export default async function EnquiryDetailPage({ params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("enquiries")
    .select(`
      id, name, phone, email, source, status, message, created_at,
      converted_to_customer_id,
      enquiry_remarks(id, remark, created_at, created_by),
      enquiry_reminders(id, remind_at, message, category, priority, is_done, done_at)
    `)
    .eq("id", id)
    .single();

  if (!data) notFound();

  return <EnquiryDetail enquiry={data as any} />;
}
