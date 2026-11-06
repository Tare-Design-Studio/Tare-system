import { Avatar } from "@/components/atoms";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { signOut } from "@/app/(auth)/actions";

/* Phone header for the owner overview. The cards below it are the same grid
   the desktop renders (see page.tsx + overview.module.css). */

function computeDateLabel(): string {
  const d = new Date();
  const day = d.toLocaleDateString("en-IN", { weekday: "short" });
  const month = d.toLocaleDateString("en-IN", { month: "short" });
  return `${day} · ${month} ${d.getDate()}`;
}

export default function MobileHome({ firstName }: { firstName: string }) {
  const initials = firstName.slice(0, 2).toUpperCase();

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "4px 0 18px" }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12, color: "var(--color-tan)", letterSpacing: 0.6, textTransform: "uppercase" }}>
          {computeDateLabel()}
        </div>
        <div style={{
          fontFamily: "'Instrument Serif', serif", fontSize: 30, lineHeight: 1.05,
          marginTop: 2, letterSpacing: -0.8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          Hey,{" "}
          <em style={{ color: "var(--color-forest)", fontStyle: "italic" }}>{firstName}</em>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
        <NotificationBell />
        <Avatar initials={initials} tone="forest" size={40} />
        <form action={signOut}>
          <button
            type="submit"
            title="Sign out"
            aria-label="Sign out"
            style={{
              width: 40, height: 40, borderRadius: 999, background: "rgba(30,28,24,.05)",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              border: "none", cursor: "pointer", color: "var(--color-tan)",
            }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
