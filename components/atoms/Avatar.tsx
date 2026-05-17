import { type CSSProperties } from "react";

type AvatarTone = "ink" | "sand" | "rust" | "mint" | "amber" | "rose" | "teal" | "indigo" | "forest";

const TONE_STYLES: Record<AvatarTone, CSSProperties> = {
  ink:    { background: "#1B1A17", color: "#F3EFE7" },
  sand:   { background: "#E2DBCC", color: "#1B1A17" },
  rust:   { background: "#C5543B", color: "#FBF8F2" },
  mint:   { background: "#6B8A6E", color: "#FBF8F2" },
  amber:  { background: "#E2A64B", color: "#1B1A17" },
  rose:   { background: "#C46A6A", color: "#FBF8F2" },
  teal:   { background: "#3A8A7A", color: "#FBF8F2" },
  indigo: { background: "#4A5A9A", color: "#FBF8F2" },
  forest: { background: "#2D6A4F", color: "#FBF8F2" },
};

interface AvatarProps {
  initials?: string;
  name?: string;
  tone?: AvatarTone;
  size?: number;
}

export function Avatar({ initials, name, tone = "forest", size = 36 }: AvatarProps) {
  const displayInitials = initials || (name ? name.split(" ").map(n => n[0]).join("") : "?");
  return (
    <span
      style={{
        ...TONE_STYLES[tone],
        width: size, height: size,
        borderRadius: "50%",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontFamily: "var(--font-sans)",
        fontWeight: 600,
        fontSize: size * 0.38,
        letterSpacing: "0.02em",
        flexShrink: 0,
      }}
    >
      {displayInitials.slice(0, 2).toUpperCase()}
    </span>
  );
}
