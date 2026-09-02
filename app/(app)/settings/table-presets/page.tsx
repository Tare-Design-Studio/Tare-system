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
      .select("id, name, is_system, scope, created_at, payment_milestone_preset_items(id, milestone_name, percentage, sequence_order, notes, wing, part)")
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
      initialPaymentPresets={(paymentRes.data ?? []).map((p) => ({
        ...p,
        is_system: p.is_system ?? false,
        scope: p.scope === "design_only" ? "design_only" as const : "design_and_execution" as const,
        payment_milestone_preset_items: p.payment_milestone_preset_items.map((it) => ({
          ...it,
          wing: it.wing === "execution" ? "execution" as const : "design" as const,
          part: it.part === "b" ? "b" as const : "a" as const,
        })),
      }))}
      initialMaterialPresets={(materialRes.data ?? []).map((p) => ({ ...p, is_system: p.is_system ?? false }))}
    />
  );
}
