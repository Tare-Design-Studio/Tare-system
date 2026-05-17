import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TablePresetsClient from "./TablePresetsClient";

export const metadata = { title: "Presets — ArchitectOS" };

export default async function TablePresetsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [presetsRes, pipelineRes, paymentRes, materialRes] = await Promise.all([
    supabase
      .from("table_presets")
      .select("*, table_preset_columns(*), table_preset_sections(*), table_preset_rows(*)")
      .order("created_at", { ascending: false }),
    supabase
      .from("checkpoint_templates")
      .select("*, checkpoint_template_items(*)")
      .order("created_at", { ascending: false }),
    supabase
      .from("payment_milestone_presets")
      .select("id, name, is_system, created_at, payment_milestone_preset_items(id, milestone_name, percentage, sequence_order, notes)")
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("material_plan_presets")
      .select("id, name, is_system, created_at, material_plan_preset_items(id, material_name, unit, planned_quantity, sequence_order)")
      .is("deleted_at", null)
      .order("name"),
  ]);

  return (
    <TablePresetsClient
      initialPresets={presetsRes.data ?? []}
      initialPipelineTemplates={pipelineRes.data ?? []}
      initialPaymentPresets={(paymentRes.data ?? []).map((p) => ({ ...p, is_system: p.is_system ?? false }))}
      initialMaterialPresets={(materialRes.data ?? []).map((p) => ({ ...p, is_system: p.is_system ?? false }))}
    />
  );
}
