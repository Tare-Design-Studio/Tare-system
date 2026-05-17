"use client";
import { type ButtonHTMLAttributes, type ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const VARIANT_STYLES = {
  primary:   { background: "var(--color-forest)",      color: "#FBF8F2", border: "none" },
  secondary: { background: "var(--color-paper-light)", color: "var(--color-ink)", border: "1px solid var(--color-line)" },
  ghost:     { background: "transparent",              color: "var(--color-ink)", border: "none" },
  danger:    { background: "var(--color-rust)",        color: "#FBF8F2", border: "none" },
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
  size?: "sm" | "md";
}

export function Button({ variant = "primary", size = "md", children, style, ...props }: ButtonProps) {
  const padding = size === "sm" ? "7px 14px" : "10px 20px";
  const fontSize = size === "sm" ? 13 : 14;
  return (
    <button
      {...props}
      style={{
        ...VARIANT_STYLES[variant],
        padding, fontSize,
        fontWeight: 500,
        borderRadius: "var(--radius-btn)",
        cursor: props.disabled ? "not-allowed" : "pointer",
        opacity: props.disabled ? 0.5 : 1,
        display: "inline-flex", alignItems: "center", gap: 6,
        transition: "opacity 0.15s, box-shadow 0.15s",
        fontFamily: "var(--font-sans)",
        ...style,
      }}
    >
      {children}
    </button>
  );
}
