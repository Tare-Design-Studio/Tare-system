"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Avatar } from "@/components/atoms";
import { signOut } from "@/app/(auth)/actions";
import { NotificationBell } from "@/components/notifications/NotificationBell";

// Converts a VAPID public key from base64url to a Uint8Array for the browser API
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  return arr.buffer as ArrayBuffer;
}

async function registerPushSubscription() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) return;

  try {
    const reg = await navigator.serviceWorker.ready;

    // Reuse existing subscription if still valid
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    }

    const rawP256dh = sub.getKey("p256dh");
    const rawAuth = sub.getKey("auth");
    if (!rawP256dh || !rawAuth) return;

    const p256dh = btoa(String.fromCharCode(...new Uint8Array(rawP256dh)));
    const auth = btoa(String.fromCharCode(...new Uint8Array(rawAuth)));

    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint, keys: { p256dh, auth } }),
    });
  } catch {
    // Permission denied or subscription failed — silent, non-fatal
  }
}

const S = { w: "1.7", cap: "round", join: "round" } as const;

function Svg({ children, size = 15 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={S.w} strokeLinecap={S.cap} strokeLinejoin={S.join}>
      {children}
    </svg>
  );
}

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  // Roles that can see this item. If omitted — visible to all.
  roles?: string[];
  // If set, team_member also needs one of these tags to see it.
  tags?: string[];
  // Holding this capability shows the item regardless of role/tags — for
  // owner-granted permissions that no tag confers (team:coordinate, 096).
  capability?: string;
};

const ALL_NAV: NavItem[] = [
  {
    href: "/site", label: "My Site",
    icon: <Svg><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></Svg>,
    roles: ["site_engineer"],
  },
  {
    href: "/", label: "Overview",
    icon: <Svg><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></Svg>,
    roles: ["owner", "team_member"],
  },
  {
    href: "/calendar", label: "Calendar",
    icon: <Svg><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></Svg>,
  },
  {
    href: "/projects", label: "Projects",
    icon: <Svg><path d="M4 21V7l8-4 8 4v14" /><path d="M9 21v-6h6v6" /><path d="M9 10h.01M15 10h.01M9 13h.01M15 13h.01" /></Svg>,
  },
  {
    href: "/tasks", label: "My Tasks",
    icon: <Svg><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></Svg>,
    // Mirrors the layout's def — tasks:assign is owner-granted per user (087),
    // so role gating alone hid the page from the owner who grants it.
    roles: ["team_member"],
    capability: "tasks:assign",
  },
  {
    href: "/me", label: "My Profile",
    icon: <Svg><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" /></Svg>,
    roles: ["team_member", "site_engineer"],
  },
  {
    href: "/bridge", label: "Bridge",
    icon: <Svg><path d="M4 18h16" /><path d="M4 14c0-4 3.6-8 8-8s8 4 8 8" /><path d="M8 18v-4M16 18v-4M12 18v-8" /></Svg>,
  },
  {
    href: "/customers", label: "Customers",
    icon: <Svg><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3 2.7-5.5 6-5.5s6 2.5 6 5.5" /><circle cx="17" cy="9" r="2.5" /><path d="M15 20c0-2 1.5-4 4-4s4 2 4 4" /></Svg>,
    roles: ["owner"],
    tags: ["accountant", "admin", "project_manager"],
  },
  {
    href: "/finance", label: "Finance",
    icon: <Svg><path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2" /><path d="M3 7v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8H5a2 2 0 0 1-2-2z" /><circle cx="17" cy="14" r="1" /></Svg>,
    roles: ["owner"],
    tags: ["accountant"],
  },
  {
    href: "/enquiries", label: "Enquiries",
    icon: <Svg><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></Svg>,
    roles: ["owner"],
    tags: ["accountant", "admin"],
  },
  {
    href: "/team", label: "Team & Access",
    icon: <Svg><path d="M12 3 4 7v5c0 5 3.5 9.7 8 11 4.5-1.3 8-6 8-11V7z" /></Svg>,
    roles: ["owner"],
    tags: ["accountant", "admin"],
    capability: "team:coordinate",
  },
];

interface TopBarProps {
  fullName: string;
  role: string;
  memberTags?: string[];
  /** Nav-relevant capabilities the user holds, resolved server-side (096). */
  capabilities?: string[];
}

export function TopBar({ fullName, role, memberTags = [], capabilities = [] }: TopBarProps) {
  const pathname = usePathname();

  useEffect(() => {
    // Only prompt Owner and Team Member — Site Engineers use the mobile site view
    if (role !== "owner" && role !== "team_member") return;
    if (!("Notification" in window)) return;

    if (Notification.permission === "granted") {
      registerPushSubscription();
    } else if (Notification.permission === "default") {
      Notification.requestPermission().then((perm) => {
        if (perm === "granted") registerPushSubscription();
      });
    }
    // "denied" — respect the user's choice, do nothing
  }, [role]);

  // Filter nav items by role and tags
  const NAV = ALL_NAV.filter((item) => {
    // An explicit owner-granted capability outranks the role/tag defaults.
    if (item.capability && capabilities.includes(item.capability)) return true;
    if (!item.roles) return true; // visible to all roles
    if (item.roles.includes(role)) return true;
    // team_member with a qualifying tag can see owner-only items
    if (role === "team_member" && item.tags) {
      return item.tags.some((t) => memberTags.includes(t));
    }
    return false;
  });

  const initials = fullName.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("");
  const avatarTone = role === "owner" ? "forest" : role === "site_engineer" ? "amber" : "indigo";
  const roleLabel = role === "owner" ? "Principal" : role === "site_engineer" ? "Site Engineer" : "Team Member";
  const shortName = (() => {
    const parts = fullName.trim().split(" ");
    return parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : parts[0];
  })();

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 22, flexWrap: "wrap" }}>

      {/* Brand pill */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "8px 14px 8px 10px",
        border: "1px solid var(--line-2)", borderRadius: 14,
        background: "rgba(255,255,255,.4)", flexShrink: 0,
      }}>
        <img src="/tare-logo.png" alt="Tare Logo" style={{ width: 80, height: 35, borderRadius: 8, objectFit: "contain", flexShrink: 0 }} />
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
        </div>
      </div>

      {/* Nav pills */}
      <nav style={{
        display: "flex", alignItems: "center", gap: 2,
        background: "var(--color-paper-light)", borderRadius: 14, padding: 4,
        boxShadow: "0 1px 0 #FFF inset, 0 2px 20px -10px rgba(30,28,24,.15)",
        border: "1px solid rgba(30,28,24,.04)", flexShrink: 0, overflowX: "auto", maxWidth: "100%",
      }}>
        {NAV.map(item => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "9px 12px", borderRadius: 10,
                background: active ? "var(--color-ink)" : "transparent",
                color: active ? "#F3EFE7" : "var(--ink-2, #3A3833)",
                fontSize: 13, fontWeight: 500, letterSpacing: -0.1,
                textDecoration: "none", transition: "all .15s", flexShrink: 0,
              }}
            >
              {item.icon}
              <span style={{ display: "inline" }}>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Spacer to push items to the right */}
      <div style={{ flex: 1 }} />

      {/* Settings */}
      <Link href="/settings" style={{
        position: "relative", width: 40, height: 40, borderRadius: 12,
        background: "rgba(30,28,24,.04)", display: "inline-flex", alignItems: "center",
        justifyContent: "center", flexShrink: 0, border: "none", cursor: "pointer",
        color: "var(--color-ink)",
      }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      </Link>

      {/* Bell */}
      <NotificationBell />

      {/* User pill */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "4px 4px 4px 4px",
        background: "var(--color-paper-light)", borderRadius: 999,
        border: "1px solid rgba(30,28,24,.04)", flexShrink: 0,
      }}>
        <Avatar initials={initials || "?"} tone={avatarTone} size={32} />
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1, paddingRight: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>{shortName}</span>
          <span style={{ fontSize: 10, color: "var(--color-tan)" }}>{roleLabel}</span>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            title="Sign out"
            style={{
              width: 32, height: 32, borderRadius: 999, background: "rgba(30,28,24,.04)",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              border: "none", cursor: "pointer", color: "var(--color-tan)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </form>
      </div>

    </div>
  );
}
