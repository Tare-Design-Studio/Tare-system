import { type CSSProperties, type ReactNode } from "react";

type ChipTone = "ink" | "sand" | "rust" | "mint" | "amber" | "rose" | "teal" | "indigo" | "forest";
type ChipSize = "sm" | "md";

const TONE_STYLES: Record<ChipTone, CSSProperties> = {
  ink:    { background: "#1B1A1714", color: "#1B1A17" },
  sand:   { background: "#E2DBCC",   color: "#8A857B" },
  rust:   { background: "#C5543B18", color: "#C5543B" },
  mint:   { background: "#6B8A6E18", color: "#2D6A4F" },
  amber:  { background: "#E2A64B18", color: "#A0720E" },
  rose:   { background: "#C46A6A18", color: "#C46A6A" },
  teal:   { background: "#3A8A7A18", color: "#3A8A7A" },
  indigo: { background: "#4A5A9A18", color: "#4A5A9A" },
  forest: { background: "#2D6A4F18", color: "#2D6A4F" },
};

interface ChipProps {
  label: ReactNode;
  tone?: ChipTone;
  size?: ChipSize;
  dot?: boolean;
}

export function Chip({ label, tone = "ink", size = "md", dot = false }: ChipProps) {
  const fontSize = size === "sm" ? 11 : 12;
  const padding  = size === "sm" ? "2px 8px" : "3px 10px";
  return (
    <span
      style={{
        ...TONE_STYLES[tone],
        display: "inline-flex", alignItems: "center", gap: 5,
        padding,
        borderRadius: 999,
        fontSize, fontWeight: 500, letterSpacing: "0.01em",
        whiteSpace: "nowrap",
      }}
    >
      {dot && (
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor", flexShrink: 0 }} />
      )}
      {label}
    </span>
  );
}
