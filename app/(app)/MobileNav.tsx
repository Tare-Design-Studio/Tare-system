"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChatBadge } from "@/components/chat/ChatBadgeProvider";

export type MobileNavItem = {
  href: string;
  label: string;
};

// Path strings for each nav href — mirrors ALL_NAV icons in TopBar.tsx but as fill-rule paths
// (TopBar uses stroke SVGs; MobileNav uses fill paths for compact rendering)
const ICON_FILL: Record<string, string> = {
  "/site":       "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z",
  "/":           "M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z",
  "/calendar":   "M20 3h-1V1h-2v2H7V1H5v2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H4V8h16v13z",
  "/projects":   "M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z",
  "/tasks":      "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-8.29 13.29L7 12.59 8.41 11.17l2.29 2.29 5.88-5.88L18 9.0l-7.29 7.29z",
  "/bridge":     "M4 18h16v-2H4v2zm0-5h16v-2H4v2zm0-5h16V6H4v2z",
  "/me":         "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
  "/customers":  "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z",
  "/finance":    "M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z",
  "/enquiries":  "M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z",
  "/team":       "M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z",
  "/settings":   "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z",
};

interface MobileNavProps {
  navItems: MobileNavItem[];
}

export function MobileNav({ navItems }: MobileNavProps) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <div className="mobile-only" style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 40 }}>
      <nav style={{
        minHeight: 96,
        paddingBottom: "max(env(safe-area-inset-bottom, 0px), 28px)",
        background: "rgba(251,248,242,.92)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        borderTop: "1px solid rgba(30,28,24,.06)",
        display: "flex",
        overflowX: "auto",
        scrollbarWidth: "none",
        paddingLeft: 4,
        paddingRight: 4,
        alignItems: "center",
      }}>
        {navItems.map(item => {
          const active = isActive(item.href);
          const iconPath = ICON_FILL[item.href] ?? ICON_FILL["/settings"];
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                padding: "0 14px",
                minWidth: 60,
                height: "100%",
                color: active ? "var(--color-forest)" : "var(--color-tan)",
                textDecoration: "none",
              }}
            >
              <div style={{
                position: "relative",
                width: 36, height: 36, borderRadius: 10,
                background: active ? "rgba(45,106,79,.1)" : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background .15s",
              }}>
                <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor">
                  <path d={iconPath} />
                </svg>
                {item.href === "/bridge" && <ChatBadge />}
              </div>
              <span style={{ fontSize: 10, fontWeight: active ? 600 : 500, letterSpacing: 0.1, whiteSpace: "nowrap" }}>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
