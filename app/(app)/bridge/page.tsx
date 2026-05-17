import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BridgeClient } from "./BridgeClient";
import { PageHeader } from "../PageHeader";

export default async function BridgePage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("role, tenant_id")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  // Owner sees all projects; others see assigned projects only
  type BridgeProject = { id: string; name: string; whatsapp_group_url: string | null };
  let projectsData: BridgeProject[] = [];

  if (profile.role === "owner") {
    const { data } = await supabase
      .from("projects")
      .select("id, name, whatsapp_group_url")
      .eq("tenant_id", profile.tenant_id)
      .not("status", "eq", "cancelled")
      .order("name");
    projectsData = data ?? [];
  } else {
    const { data } = await supabase
      .from("project_assignments")
      .select("projects:project_id (id, name, whatsapp_group_url)")
      .eq("user_id", user.id);
    projectsData = (data ?? [])
      .map(r => r.projects as BridgeProject | null)
      .filter((p): p is BridgeProject => p !== null);
  }

  return (
    <div style={{ padding: "0 0 40px" }}>
      <PageHeader title="Bridge" subtitle="Project coordination channel" />
      <BridgeClient projects={projectsData} currentUserId={user.id} />
    </div>
  );
}
