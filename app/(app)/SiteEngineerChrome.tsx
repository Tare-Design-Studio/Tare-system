"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChatBadge } from "@/components/chat/ChatBadgeProvider";
import { Avatar } from "@/components/atoms";
import { signOut } from "@/app/(auth)/actions";

export type ChromeProject = {
  id: string;
  name: string;
  current_stage: string | null;
  status?: string | null;
};

// Tab ids that live as state inside /site. Everything else routes.
const PANEL_TABS = ["today", "updates", "expenses"] as const;

type IconName = "dashboard" | "info" | "feed" | "list" | "credit" | "bridge" | "team" | "rupee" | "user";

const ICON_PATHS: Record<IconName, string> = {
  dashboard: "M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z",
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 16v-4 M12 8h.01",
  feed: "M4 4h16v16H4z M8 9h8 M8 13h8 M8 17h5",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  credit: "M21 4H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM3 8h18v2H3V8zm0 8v-4h18v4H3z",
  bridge: "M2 12h20 M4 12V9a8 8 0 0 1 16 0v3 M7 12v6 M12 12v6 M17 12v6 M2 18h20",
  team: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  rupee: "M6 3h12 M6 8h12 M6 13l8.5 8 M6 13h3 M9 13c6.667 0 6.667-10 0-10",
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
  { id: "today",     label: "Home",      icon: "dashboard" },
  { id: "expenses",  label: "Expenses",  icon: "credit" },
  { id: "updates",   label: "Updates",   icon: "feed" },
  { id: "bridge",    label: "Bridge",    icon: "bridge" },
  { id: "details",   label: "Details",   icon: "info" },
  { id: "profile",   label: "Profile",   icon: "user" },
];

// Shown only to a site engineer who also supervises — i.e. holds
// member_tasks:view_all (the project_manager tag confers it). Appended rather
// than inserted so the field tabs keep their learned positions.
const TEAM_TAB: { id: string; label: string; icon: IconName } = {
  id: "team", label: "Team", icon: "team",
};

// Office pages, linked only for a site engineer who holds the page's
// capability (resolved in layout.tsx). Appended after Team for the same reason.
export type OfficeTab = "finance";

const OFFICE_TABS: Record<OfficeTab, { id: string; label: string; icon: IconName }> = {
  finance:   { id: "finance",   label: "Finance",   icon: "rupee" },
};

// Planwise green mesh — same recipe as the customer portal card.
const HEADER_BG = "radial-gradient(60% 120% at 0 0,#3d8a65 0,#0000 70%),radial-gradient(50% 120% at 100% 100%,#8fe0b8 0,#0000 70%),#1e5b47";
const ON_GREEN = "#FFFFFF";
const ON_GREEN_MUTED = "rgba(255,255,255,.72)";
const selectOnGreen: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,.45)", background: "rgba(255,255,255,.14)",
  color: ON_GREEN, outline: "none", fontFamily: "inherit",
};

interface SiteEngineerChromeProps {
  fullName: string;
  /** Own id — the Profile tab is /team/<id>. */
  userId: string;
  projects: ChromeProject[];
  /** Site engineer who also manages other engineers — adds the Team tab. */
  canSuperviseTeam?: boolean;
  officeTabs?: OfficeTab[];
}

export function SiteEngineerChrome({ fullName, userId, projects, canSuperviseTeam = false, officeTabs = [] }: SiteEngineerChromeProps) {
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
  const activeTab = routeProjectId ? "details"
    : pathname === `/team/${userId}` ? "profile"
    : pathname.startsWith("/finance") ? "finance"
    : pathname.startsWith("/bridge") ? "bridge"
    : pathname === "/site/team" || pathname.startsWith("/team/") ? "team"
    : onSite ? (searchParams.get("tab") ?? "today")
    : "";

  const tabs = [
    ...TABS,
    ...(canSuperviseTeam ? [TEAM_TAB] : []),
    ...officeTabs.map(t => OFFICE_TABS[t]),
  ];

  function go(tabId: string) {
    if (tabId === "details") {
      if (activeProjectId) router.push(`/projects/${activeProjectId}`);
      return;
    }
    if (tabId === "bridge") {
      router.push("/bridge");
      return;
    }
    if (tabId === "profile") {
      router.push(`/team/${userId}`);
      return;
    }
    if (tabId === "team") {
      router.push("/site/team");
      return;
    }
    if (tabId in OFFICE_TABS) {
      router.push(`/${tabId}`);
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
          border: "1px solid rgba(255,255,255,.45)", borderRadius: 10, padding, cursor: "pointer",
          color: ON_GREEN,
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
        position: "sticky", top: 0, zIndex: 50, background: HEADER_BG, color: ON_GREEN,
        boxShadow: "0 20px 40px -24px rgba(15,53,39,.6)",
      }}>
        {/* One row: project + tabs on the left (tabs scroll if they run out of
            room), name + sign-out pinned top right. */}
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "10px 28px", display: "flex", alignItems: "center", gap: 14 }}>
          {projects.length > 0 && (
            <select value={activeProjectId} onChange={e => switchProject(e.target.value)} aria-label="Project" title={stageLabel}
              style={{ ...selectOnGreen, padding: "7px 12px", borderRadius: 10, fontSize: 13, fontWeight: 600, maxWidth: 200, flexShrink: 0 }}>
              {projects.map(p => <option key={p.id} value={p.id} style={{ color: "var(--color-ink)" }}>{p.name}</option>)}
            </select>
          )}
          <nav style={{ display: "flex", gap: 2, flex: 1, minWidth: 0, overflowX: "auto", scrollbarWidth: "none" }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => go(t.id)} style={{
                padding: "7px 12px", fontSize: 13, fontWeight: activeTab === t.id ? 600 : 500,
                border: "none", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
                background: activeTab === t.id ? "rgba(255,255,255,.2)" : "transparent",
                color: activeTab === t.id ? ON_GREEN : ON_GREEN_MUTED,
                transition: "background .15s",
              }}>
                <span style={{ position: "relative", display: "inline-block" }}>
                  {t.label}
                  {t.id === "bridge" && <ChatBadge size={15} />}
                </span>
              </button>
            ))}
          </nav>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <Avatar initials={initials || "?"} tone="teal" size={30} />
            <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>{fullName}</div>
            {signOutButton(7, 15, "none")}
          </div>
        </div>
      </div>

      {/* Mobile — sticky project selector on top.
          The inner div carries display:flex; the .mobile-only wrapper keeps
          its own display so the class can hide it on desktop. */}
      <div className="mobile-only" style={{
        position: "sticky", top: 0, zIndex: 30, background: HEADER_BG, color: ON_GREEN,
        padding: "max(env(safe-area-inset-top, 0px), 12px) 20px 14px",
        borderRadius: "0 0 22px 22px", boxShadow: "0 20px 40px -24px rgba(15,53,39,.6)",
      }}>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10 }}>
        {projects.length > 0 && (
          <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
            <select value={activeProjectId} onChange={e => switchProject(e.target.value)}
              style={{
                ...selectOnGreen, padding: "8px 12px", borderRadius: 10, fontSize: 14, fontWeight: 600,
                width: "100%", textAlign: "center", appearance: "none",
              }}>
              {projects.map(p => <option key={p.id} value={p.id} style={{ color: "var(--color-ink)" }}>{p.name}</option>)}
            </select>
            <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
              <Icon name="list" size={16} color={ON_GREEN_MUTED} />
            </div>
          </div>
        )}
        {signOutButton(9, 16, "rgba(255,255,255,.14)")}
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
