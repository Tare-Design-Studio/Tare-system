import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CustomerDetail from "./CustomerDetail";

type Params = { params: Promise<{ id: string }> };

export default async function CustomerDetailPage({ params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("customers")
    .select(`
      id, name, phone, email, address, created_at, created_from_enquiry_id,
      customer_portal_hash, customer_portal_enabled,
      enquiry_reminders(id, remind_at, message, category, priority, is_done, done_at)
    `)
    .eq("id", id)
    .single();

  if (!data) notFound();

  // Fetch ALL linked projects (not just one)
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, status, current_stage")
    .eq("customer_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  // Only capability holders get the portal-content surface; the routes re-check.
  const { data: canManagePortal } = await supabase.rpc("has_capability", {
    p_capability: "images:select_for_customer",
  });

  // Staff list for attributing a manually logged visit.
  const { data: members } = canManagePortal
    ? await supabase
        .from("users")
        .select("id, full_name")
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("full_name")
    : { data: [] };

  const primaryProject = projects?.[0] ?? null;
  const projectId = primaryProject?.id ?? null;

  // Show payments for primary project only (keeps existing PaymentsCard contract)
  const [scheduleRes, recordsRes] = projectId
    ? await Promise.all([
        supabase
          .from("v_payment_status")
          .select("*")
          .eq("project_id", projectId)
          .order("sequence_order", { ascending: true }),
        supabase
          .from("payment_records")
          .select("id, payment_schedule_id, amount_paid, paid_on, method, reference, notes")
          .eq("project_id", projectId)
          .order("paid_on", { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }];

  return (
    /* eslint-disable @typescript-eslint/no-explicit-any */
    <CustomerDetail
      customer={data as any}
      project={primaryProject}
      projects={(projects ?? []) as any}
      paymentSchedule={(scheduleRes.data ?? []) as any[]}
      paymentRecords={(recordsRes.data ?? []) as any[]}
      canManagePortal={canManagePortal === true}
      members={(members ?? []) as { id: string; full_name: string }[]}
    />
  );
}
