"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const TAGS = [
  { value: "accountant", label: "Accountant" },
  { value: "admin", label: "Admin" },
  { value: "project_manager", label: "Project Manager" },
] as const;

type Tag = (typeof TAGS)[number]["value"];

interface Props {
  userId: string;
  userName: string;
  currentTags: string[];
}

export function TagsPanel({ userId, userName, currentTags }: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState<Tag | null>(null);
  const [local, setLocal] = useState<string[]>(currentTags);
  const router = useRouter();

  async function toggleTag(tag: Tag) {
    setSaving(tag);
    const has = local.includes(tag);
    try {
      if (has) {
        const res = await fetch(`/api/team-member-tags?user_id=${userId}&tag=${tag}`, { method: "DELETE" });
        if (!res.ok) throw new Error(await res.text());
        setLocal((prev) => prev.filter((t) => t !== tag));
      } else {
        const res = await fetch("/api/team-member-tags", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, tag }),
        });
        if (!res.ok) throw new Error(await res.text());
        setLocal((prev) => [...prev, tag]);
      }
      router.refresh();
    } catch (err) {
      alert(`Failed to update tag: ${(err as Error).message}`);
    } finally {
      setSaving(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          padding: "4px 10px",
          borderRadius: 6,
          border: "1px solid var(--color-line)",
          background: "transparent",
          fontSize: 11,
          color: "var(--color-tan)",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
        aria-label={`Manage tags for ${userName}`}
      >
        Tags
      </button>
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(20,20,20,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--color-paper)",
              borderRadius: 14,
              padding: 22,
              width: "100%",
              maxWidth: 360,
              boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Manage tags</div>
            <div style={{ fontSize: 12, color: "var(--color-tan)", marginBottom: 14 }}>
              {userName}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {TAGS.map((t) => {
                const checked = local.includes(t.value);
                const isSaving = saving === t.value;
                return (
                  <label
                    key={t.value}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid var(--color-line)",
                      cursor: isSaving ? "wait" : "pointer",
                      opacity: isSaving ? 0.6 : 1,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isSaving}
                      onChange={() => toggleTag(t.value)}
                    />
                    <span style={{ fontSize: 13 }}>{t.label}</span>
                  </label>
                );
              })}
            </div>
            <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() => setOpen(false)}
                style={{
                  padding: "10px 20px",
                  minHeight: 44,
                  borderRadius: 8,
                  border: "1px solid var(--color-line)",
                  background: "transparent",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
