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
  currentTags: string[];
}

/** Tag toggles shown inside the Edit Member modal. Each toggle saves at once. */
export function TagToggles({ userId, currentTags }: Props) {
  const [saving, setSaving] = useState<Tag | null>(null);
  const [local, setLocal] = useState<string[]>(currentTags);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function toggleTag(tag: Tag) {
    setSaving(tag);
    setError(null);
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
      setError(`Failed to update tag: ${(err as Error).message}`);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {TAGS.map((t) => {
          const on = local.includes(t.value);
          return (
            <button
              key={t.value}
              type="button"
              aria-pressed={on}
              disabled={saving === t.value}
              onClick={() => toggleTag(t.value)}
              style={{
                padding: "7px 13px", fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                cursor: saving === t.value ? "wait" : "pointer", opacity: saving === t.value ? 0.6 : 1,
                border: on ? "1px solid var(--color-ink)" : "1px solid var(--color-line)",
                background: on ? "var(--color-ink)" : "transparent",
                color: on ? "#F3EFE7" : "var(--color-ink)",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {error && <div style={{ fontSize: 12, color: "var(--color-rust)", marginTop: 6 }}>{error}</div>}
    </div>
  );
}
