import { type CSSProperties, type ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, style, className, onClick }: CardProps) {
  return (
    <div
      className={className}
      onClick={onClick}
      style={{
        background: "var(--color-paper-light)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card)",
        border: "1px solid var(--color-line)",
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

interface CardTitleProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function CardTitle({ title, subtitle, action }: CardTitleProps) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "20px 24px 18px", gap: 12 }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <h2
          className="font-serif"
          style={{ fontSize: 22, fontWeight: 400, color: "var(--color-ink)", margin: 0, letterSpacing: "-0.3px", lineHeight: 1.1 }}
        >
          {title}
        </h2>
        {subtitle && (
          <p style={{ fontSize: 12, color: "var(--color-tan)", margin: "6px 0 0", lineHeight: 1.2 }}>{subtitle}</p>
        )}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  );
}
