import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "./TopBar";
import { MobileNav, type MobileNavItem } from "./MobileNav";

type NavItemDef = {
  href: string;
  label: string;
  roles?: string[];
  tags?: string[];
};

const ALL_NAV_DEFS: NavItemDef[] = [
  { href: "/",           label: "Overview" },
  { href: "/calendar",   label: "Calendar" },
  { href: "/projects",   label: "Projects" },
  { href: "/tasks",      label: "My Tasks",     roles: ["team_member"] },
  { href: "/bridge",     label: "Bridge" },
  { href: "/customers",  label: "Customers",    roles: ["owner"], tags: ["accountant", "admin", "project_manager"] },
  { href: "/finance",    label: "Finance",      roles: ["owner"], tags: ["accountant"] },
  { href: "/enquiries",  label: "Enquiries",    roles: ["owner"], tags: ["accountant", "admin"] },
  { href: "/team",       label: "Team",         roles: ["owner"], tags: ["accountant", "admin"] },
  { href: "/audit",      label: "Audit",        roles: ["owner"], tags: ["accountant", "admin"] },
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

  // Invited user who hasn't set a password yet — send to /accept
  if (profile && profile.is_active === false) {
    redirect("/accept");
  }

  const role = profile?.role ?? "team_member";
  const mobileNavItems: MobileNavItem[] = ALL_NAV_DEFS
    .filter((item) => {
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
      {role === "site_engineer" ? (
        <main className="mobile-main">{children}</main>
      ) : (
        <>
          <div className="desktop-only" style={{ maxWidth: 1760, margin: "0 auto", padding: "22px 28px 40px" }}>
            <TopBar
              fullName={profile?.full_name ?? ""}
              role={role}
              memberTags={memberTags}
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

