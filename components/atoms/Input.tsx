"use client";
import { type InputHTMLAttributes, type ReactNode, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  suffix?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, suffix, style, ...props }, ref) => {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {label && (
          <label
            style={{
              fontSize: 11,
              color: "var(--color-tan)",
              textTransform: "uppercase",
              letterSpacing: 1,
              fontWeight: 500,
            }}
          >
            {label}
          </label>
        )}
        <div style={{ position: "relative" }}>
          <input
            ref={ref}
            {...props}
            style={{
              width: "100%",
              padding: "13px 16px",
              paddingRight: suffix ? 44 : 16,
              borderRadius: "var(--radius-input)",
              border: `1.5px solid ${error ? "var(--color-rose)" : "var(--color-line)"}`,
              background: "var(--color-paper-light)",
              fontSize: 14,
              fontFamily: "var(--font-sans)",
              color: "var(--color-ink)",
              outline: "none",
              boxSizing: "border-box",
              boxShadow: "var(--shadow-input)",
              transition: "border-color 0.15s",
              ...style,
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--color-ink)";
              props.onFocus?.(e);
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = error
                ? "var(--color-rose)"
                : "var(--color-line)";
              props.onBlur?.(e);
            }}
          />
          {suffix && (
            <div
              style={{
                position: "absolute",
                right: 14,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--color-tan)",
                display: "flex",
                alignItems: "center",
              }}
            >
              {suffix}
            </div>
          )}
        </div>
        {error && (
          <p
            style={{
              fontSize: 12,
              color: "var(--color-rose)",
              margin: 0,
              padding: "8px 12px",
              borderRadius: 8,
              background: "rgba(196,106,106,0.08)",
              border: "1px solid rgba(196,106,106,0.2)",
            }}
          >
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
