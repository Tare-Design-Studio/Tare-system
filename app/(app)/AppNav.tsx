"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar } from "@/components/atoms";
import { signOut } from "@/app/(auth)/actions";

const NAV = [
  {
    href: "/",
    label: "Dashboard",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </svg>
    ),
  },
  {
    href: "/team",
    label: "Team",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="8" r="3.5" />
        <path d="M3 20c0-3 2.7-5.5 6-5.5s6 2.5 6 5.5" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M15 20c0-2 1.5-4 4-4s4 2 4 4" />
      </svg>
    ),
  },
  {
    href: "/settings/access-matrix",
    label: "Access",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    href: "/settings/table-presets",
    label: "Presets",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
      </svg>
    ),
  },
];

interface AppNavProps {
  fullName: string;
  role: string;
}

export function AppNav({ fullName, role }: AppNavProps) {
  const pathname = usePathname();

  const avatarTone =
    role === "owner" ? "forest" : role === "site_engineer" ? "amber" : "indigo";

  return (
    <nav
      style={{
        width: 220,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid var(--color-line)",
        background: "var(--color-paper-light)",
        padding: "20px 12px",
        gap: 4,
      }}
    >
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", marginBottom: 16 }}>
        <img src="/tare-logo.png" alt="Tare Logo" style={{ width: 30, height: 30, borderRadius: 9, objectFit: "contain", flexShrink: 0 }} />
        <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.3 }}>Ascension Systems</span>
      </div>

      {/* Nav links */}
      {NAV.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "9px 12px",
              borderRadius: 10,
              textDecoration: "none",
              color: active ? "var(--color-ink)" : "var(--color-tan)",
              background: active ? "var(--color-paper)" : "transparent",
              fontWeight: active ? 500 : 400,
              fontSize: 14,
              border: active ? "1px solid var(--color-line)" : "1px solid transparent",
              transition: "color 0.15s, background 0.15s",
            }}
          >
            <span style={{ opacity: active ? 1 : 0.6 }}>{item.icon}</span>
            {item.label}
          </Link>
        );
      })}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* User + sign out */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid var(--color-line)",
          background: "var(--color-paper)",
        }}
      >
        <Avatar
          initials={fullName.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("") || "?"}
          tone={avatarTone}
          size={28}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {fullName || "Unknown"}
          </div>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            title="Sign out"
            style={{ background: "none", border: "none", padding: 4, cursor: "pointer", color: "var(--color-tan)" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </form>
      </div>
    </nav>
  );
}
