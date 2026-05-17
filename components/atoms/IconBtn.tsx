"use client";
import { type ButtonHTMLAttributes, type ReactNode } from "react";

interface IconBtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  active?: boolean;
  size?: number;
}

export function IconBtn({ children, active, size = 44, style, ...props }: IconBtnProps) {
  return (
    <button
      {...props}
      style={{
        width: size, height: size,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        borderRadius: 10,
        border: "none",
        background: active ? "var(--color-forest)" : "transparent",
        color: active ? "#FBF8F2" : "var(--color-tan)",
        cursor: "pointer",
        transition: "background 0.15s, color 0.15s",
        flexShrink: 0,
        ...style,
      }}
    >
      {children}
    </button>
  );
}
