"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChatBadge } from "@/components/chat/ChatBadgeProvider";
import { Chip, Avatar } from "@/components/atoms";
import { signOut } from "@/app/(auth)/actions";

export type ChromeProject = {
  id: string;
  name: string;
  current_stage: string | null;
  status?: string | null;
};

// Tab ids that live as state inside /site. Everything else routes.
const PANEL_TABS = ["today", "updates", "materials", "progress", "expenses"] as const;

type IconName = "dashboard" | "info" | "feed" | "list" | "trending" | "credit" | "bridge" | "team";

const ICON_PATHS: Record<IconName, string> = {
  dashboard: "M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z",
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 16v-4 M12 8h.01",
  feed: "M4 4h16v16H4z M8 9h8 M8 13h8 M8 17h5",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  trending: "M23 6l-9.5 9.5-5-5L1 18 M23 6v6 M23 6h-6",
  credit: "M21 4H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM3 8h18v2H3V8zm0 8v-4h18v4H3z",
  bridge: "M2 12h20 M4 12V9a8 8 0 0 1 16 0v3 M7 12v6 M12 12v6 M17 12v6 M2 18h20",
  team: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
};

function Icon({ name, size = 24, stroke = 1.5, color = "currentColor" }: {
  name: IconName; size?: number; stroke?: number; color?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

const TABS: { id: string; label: string; icon: IconName }[] = [
  { id: "today",     label: "Today",     icon: "dashboard" },
  { id: "details",   label: "Details",   icon: "info" },
  { id: "updates",   label: "Updates",   icon: "feed" },
  { id: "materials", label: "Materials", icon: "list" },
  { id: "progress",  label: "Progress",  icon: "trending" },
  { id: "expenses",  label: "Expenses",  icon: "credit" },
  { id: "bridge",    label: "Bridge",    icon: "bridge" },
];

// Shown only to a site engineer who also supervises — i.e. holds
// member_tasks:view_all (the project_manager tag confers it). Appended rather
// than inserted so the field tabs keep their learned positions.
const TEAM_TAB: { id: string; label: string; icon: IconName } = {
  id: "team", label: "Team", icon: "team",
};

interface SiteEngineerChromeProps {
  fullName: string;
  projects: ChromeProject[];
  /** Site engineer who also manages other engineers — adds the Team tab. */
  canSuperviseTeam?: boolean;
}

export function SiteEngineerChrome({ fullName, projects, canSuperviseTeam = false }: SiteEngineerChromeProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initials = fullName.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  // Which project the chrome selector shows. On a project page the route wins
  // (option A); elsewhere it is whichever project /site has selected.
  const routeProjectId = pathname.startsWith("/projects/") ? pathname.split("/")[2] : null;
  const activeProjectId = routeProjectId ?? searchParams.get("project") ?? projects[0]?.id ?? "";
  const activeProject = projects.find(p => p.id === activeProjectId);

  const onSite = pathname === "/site";
  const activeTab = pathname.startsWith("/projects/") ? "details"
    : pathname.startsWith("/bridge") ? "bridge"
    : pathname === "/site/team" ? "team"
    : onSite ? (searchParams.get("tab") ?? "today")
    : "";

  const tabs = canSuperviseTeam ? [...TABS, TEAM_TAB] : TABS;

  function go(tabId: string) {
    if (tabId === "details") {
      if (activeProjectId) router.push(`/projects/${activeProjectId}`);
      return;
    }
    if (tabId === "bridge") {
      router.push("/bridge");
      return;
    }
    if (tabId === "team") {
      router.push("/site/team");
      return;
    }
    // Panel tab — always lands on /site with the tab (and project) in the URL.
    const params = new URLSearchParams();
    params.set("tab", tabId);
    if (activeProjectId) params.set("project", activeProjectId);
    router.push(`/site?${params.toString()}`);
  }

  function switchProject(pid: string) {
    if (routeProjectId) {
      router.push(`/projects/${pid}`);
      return;
    }
    const params = new URLSearchParams();
    const tab = searchParams.get("tab");
    if (tab && (PANEL_TABS as readonly string[]).includes(tab)) params.set("tab", tab);
    params.set("project", pid);
    router.push(`/site?${params.toString()}`);
  }

  const stageLabel = activeProject?.current_stage
    ? activeProject.current_stage.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())
    : "Active";

  const signOutButton = (padding: number, size: number, background: string) => (
    <form action={signOut}>
      <button
        type="submit"
        title="Sign out"
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", background,
          border: "1px solid var(--color-line)", borderRadius: 10, padding, cursor: "pointer",
          color: "var(--color-tan)",
        }}
      >
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      </button>
    </form>
  );

  return (
    <>
      {/* Desktop — sticky header with identity, project selector, and tab row */}
      <div className="desktop-only" style={{
        position: "sticky", top: 0, zIndex: 50, background: "rgba(243,239,231,.92)",
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        borderBottom: "1px solid var(--color-line)",
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 28px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <Avatar initials={initials || "?"} tone="teal" size={32} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{fullName}</div>
                <div style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 1 }}>
                  Site Engineer
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {projects.length > 0 && (
                <>
                  <div style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 1 }}>
                    Project
                  </div>
                  <select value={activeProjectId} onChange={e => switchProject(e.target.value)}
                    style={{
                      padding: "8px 14px", borderRadius: 10, border: "1px solid var(--color-line)",
                      background: "var(--color-paper-light)", fontSize: 13, fontWeight: 500,
                      outline: "none", fontFamily: "inherit", color: "var(--color-ink)",
                    }}>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <Chip label={stageLabel} tone="teal" dot />
                </>
              )}
              {signOutButton(8, 15, "none")}
            </div>
          </div>

          <div style={{ display: "flex", gap: 4, paddingBottom: 1 }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => go(t.id)} style={{
                padding: "10px 18px", borderRadius: "10px 10px 0 0", fontSize: 13, fontWeight: 500,
                border: "none", cursor: "pointer",
                background: activeTab === t.id ? "var(--color-paper-light)" : "transparent",
                color: activeTab === t.id ? "var(--color-ink)" : "var(--color-tan)",
                borderBottom: activeTab === t.id ? "2px solid var(--color-forest)" : "2px solid transparent",
                transition: "all .15s",
              }}>
                <span style={{ position: "relative", display: "inline-block" }}>
                  {t.label}
                  {t.id === "bridge" && <ChatBadge size={15} />}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile — sticky project selector on top.
          The inner div carries display:flex; the .mobile-only wrapper keeps
          its own display so the class can hide it on desktop. */}
      <div className="mobile-only" style={{
        position: "sticky", top: 0, zIndex: 30, background: "rgba(243,239,231,.92)",
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        borderBottom: "1px solid var(--color-line)", padding: "12px 20px",
      }}>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10 }}>
        {projects.length > 0 && (
          <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
            <select value={activeProjectId} onChange={e => switchProject(e.target.value)}
              style={{
                padding: "8px 12px", borderRadius: 10, border: "1px solid var(--color-line)",
                background: "var(--color-paper-light)", fontSize: 14, fontWeight: 600,
                outline: "none", fontFamily: "inherit", color: "var(--color-ink)",
                width: "100%", textAlign: "center", appearance: "none",
              }}>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
              <Icon name="list" size={16} color="var(--color-tan)" />
            </div>
          </div>
        )}
        {signOutButton(9, 16, "var(--color-paper-light)")}
        </div>
      </div>

      {/* Mobile — fixed bottom tab bar */}
      <div className="mobile-only" style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 40,
        minHeight: 96,
        paddingBottom: "max(env(safe-area-inset-bottom, 0px), 28px)",
        background: "rgba(251,248,242,.85)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        borderTop: "1px solid rgba(30,28,24,.06)",
        overflowX: "auto", scrollbarWidth: "none",
      }}>
        <div style={{ display: "flex", alignItems: "center", minHeight: 68 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => go(t.id)} style={{
            flex: "1 0 auto", minWidth: 60, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 4,
            color: activeTab === t.id ? "var(--color-forest)" : "var(--color-tan)",
            border: "none", background: "none", padding: "0 6px", cursor: "pointer",
          }}>
            <span style={{ position: "relative", display: "inline-flex" }}>
              <Icon name={t.icon} size={22} stroke={activeTab === t.id ? 2 : 1.7} />
              {t.id === "bridge" && <ChatBadge />}
            </span>
            <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: .1, whiteSpace: "nowrap" }}>{t.label}</span>
          </button>
        ))}
        </div>
      </div>
    </>
  );
}
