import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PaymentPresetsClient } from "./PaymentPresetsClient";
import { PageHeader } from "../../PageHeader";

export const metadata = { title: "Payment Presets — ArchitectOS" };

export default async function PaymentPresetsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: canManage } = await supabase.rpc("has_capability", { p_capability: "customer_payments:create_schedule" });
  if (!canManage) redirect("/");

  const { data: presets } = await supabase
    .from("payment_milestone_presets")
    .select("id, name, is_system, created_at, payment_milestone_preset_items(id, milestone_name, percentage, sequence_order, notes)")
    .is("deleted_at", null)
    .order("name");

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 32px 80px" }}>
      <PageHeader
        title="Payment Milestone Presets"
        subtitle="Reusable payment milestone templates · applied to projects on creation"
      />
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <PaymentPresetsClient initial={(presets ?? []) as any} />
    </div>
  );
}
