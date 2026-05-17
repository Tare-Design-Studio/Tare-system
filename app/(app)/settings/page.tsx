import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SettingsClient from "./SettingsClient";

export const metadata = { title: "Settings — ArchitectOS" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("full_name, phone, role, mfa_enrolled_at, password_last_changed_at, tenant_id")
    .eq("id", user.id)
    .single();

  let tenant = null;
  if (profile?.role === "owner" && profile.tenant_id) {
    const { data } = await supabase
      .from("tenants")
      .select("name, office_lat, office_lng, office_geofence_radius_m, gps_retention_days, soft_delete_retention_days, variance_threshold_pct, material_excess_threshold_pct")
      .eq("id", profile.tenant_id)
      .single();
    tenant = data;
  }

  return (
    <SettingsClient
      profile={{
        full_name: profile?.full_name ?? "",
        phone: profile?.phone ?? null,
        role: profile?.role ?? "team_member",
        mfa_enrolled_at: profile?.mfa_enrolled_at ?? null,
        password_last_changed_at: profile?.password_last_changed_at ?? null,
      }}
      tenant={tenant}
    />
  );
}
