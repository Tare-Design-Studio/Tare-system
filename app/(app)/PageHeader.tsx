import { type CSSProperties, type ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
  children,
  style,
}: {
  title: string;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        padding: "8px 4px 28px",
        gap: 16,
        flexWrap: "wrap",
        ...style,
      }}
    >
      <div style={{ minWidth: 0 }}>
        {(eyebrow || subtitle) && (
          <div
            style={{
              fontSize: 12,
              color: "var(--color-tan)",
              letterSpacing: 0.6,
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            {eyebrow || subtitle}
          </div>
        )}
        <h1
          className="font-serif"
          style={{
            margin: 0,
            fontWeight: 400,
            fontSize: 48,
            lineHeight: 1,
            letterSpacing: -1.2,
            color: "var(--color-ink)",
          }}
        >
          {title}
        </h1>
        {children}
      </div>
      {actions && (
        <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
          {actions}
        </div>
      )}
    </div>
  );
}
