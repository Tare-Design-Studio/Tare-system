import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "./TopBar";
import { MobileNav, type MobileNavItem } from "./MobileNav";
import { SiteEngineerChrome, type ChromeProject } from "./SiteEngineerChrome";
import { RealtimeRefresher } from "@/components/realtime/RealtimeRefresher";

type NavItemDef = {
  href: string;
  label: string;
  roles?: string[];
  tags?: string[];
  /**
   * Shows the item to anyone holding this capability, whatever their role or
   * tags. Needed for grants the owner makes per user — team:coordinate (096) is
   * deliberately not conferred by any tag, so role/tag gating alone would leave
   * a coordinator with a page they can open but no link to reach it.
   */
  capability?: string;
};

const ALL_NAV_DEFS: NavItemDef[] = [
  { href: "/site",       label: "My Site",      roles: ["site_engineer"] },
  { href: "/",           label: "Overview",     roles: ["owner", "team_member"] },
  { href: "/calendar",   label: "Calendar" },
  { href: "/projects",   label: "Projects" },
  // tasks:assign is owner-granted per user (087), so role/tag gating alone left
  // an owner or PM with a page they could open but no link to reach it — the
  // same gap team:coordinate hit at /team. The page itself admits anyone with a
  // personal list OR assign rights; this mirrors that test.
  { href: "/tasks",      label: "My Tasks",     roles: ["team_member"], capability: "tasks:assign" },
  { href: "/me",         label: "My Profile",   roles: ["team_member", "site_engineer"] },
  { href: "/bridge",     label: "Bridge" },
  { href: "/customers",  label: "Customers",    roles: ["owner"], tags: ["accountant", "admin", "project_manager"] },
  { href: "/finance",    label: "Finance",      roles: ["owner"], tags: ["accountant"] },
  { href: "/enquiries",  label: "Enquiries",    roles: ["owner"], tags: ["accountant", "admin"] },
  { href: "/team",       label: "Team",         roles: ["owner"], tags: ["accountant", "admin"], capability: "team:coordinate" },
  { href: "/settings",   label: "Settings" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("full_name, role, is_active")
    .eq("id", user.id)
    .single();

  // Fetch team member tags for nav gating (table added in migration 037 — not yet in generated types)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tagRows } = await (supabase as any)
    .from("team_member_tags")
    .select("tag")
    .eq("user_id", user.id);
  const memberTags: string[] = (tagRows ?? []).map((r: { tag: string }) => r.tag);

  // Capabilities referenced by ALL_NAV_DEFS, resolved once. Only team:coordinate
  // uses this today; keeping it a set means adding another needs no new query.
  const navCapabilities = [...new Set(ALL_NAV_DEFS.map((i) => i.capability).filter(Boolean))] as string[];
  const capResults = await Promise.all(
    navCapabilities.map((c) => supabase.rpc("has_capability", { p_capability: c }))
  );
  const heldNavCapabilities = new Set(
    navCapabilities.filter((_, i) => capResults[i].data === true)
  );

  // Invited user who hasn't set a password yet — send to /accept
  if (profile && profile.is_active === false) {
    redirect("/accept");
  }

  const role = profile?.role ?? "team_member";
  const isSiteEngineer = role === "site_engineer";

  // Site engineers get their own chrome on every page they can reach — the
  // owner TopBar / MobileNav never render for them.
  let engineerProjects: ChromeProject[] = [];
  if (isSiteEngineer) {
    const { data: assignments } = await supabase
      .from("project_assignments")
      .select("projects!inner(id, name, current_stage)")
      .eq("user_id", user.id)
      .is("projects.deleted_at", null);
    engineerProjects = (assignments ?? [])
      .map(a => a.projects as unknown as ChromeProject)
      .filter(Boolean);
  }

  const mobileNavItems: MobileNavItem[] = ALL_NAV_DEFS
    .filter((item) => {
      // A held capability admits the item outright — it is an explicit
      // owner-granted permission, so it outranks the role/tag defaults.
      if (item.capability && heldNavCapabilities.has(item.capability)) return true;
      if (!item.roles) return true;
      if (item.roles.includes(role)) return true;
      if (role === "team_member" && item.tags) {
        return item.tags.some((t) => memberTags.includes(t));
      }
      return false;
    })
    .map(({ href, label }) => ({ href, label }));

  return (
    <div style={{ minHeight: "100vh" }}>
      <RealtimeRefresher />
      {isSiteEngineer ? (
        <>
          <Suspense fallback={null}>
            <SiteEngineerChrome fullName={profile?.full_name ?? ""} projects={engineerProjects} />
          </Suspense>
          <div className="desktop-only" style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 28px 64px" }}>
            <main>{children}</main>
          </div>
          <div className="mobile-only">
            <main className="mobile-main">{children}</main>
          </div>
        </>
      ) : (
        <>
          <div className="desktop-only" style={{ maxWidth: 1760, margin: "0 auto", padding: "22px 28px 40px" }}>
            <TopBar
              fullName={profile?.full_name ?? ""}
              role={role}
              memberTags={memberTags}
              capabilities={[...heldNavCapabilities]}
            />
            <main>{children}</main>
          </div>
          <div className="mobile-only">
            <main className="mobile-main">{children}</main>
          </div>
          <MobileNav navItems={mobileNavItems} />
        </>
      )}
    </div>
  );
}

