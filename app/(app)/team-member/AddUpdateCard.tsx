"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Project = {
  id: string;
  name: string;
  status: string;
};

const C: React.CSSProperties = {
  background: "var(--color-paper-light)",
  borderRadius: 22,
  padding: 24,
  boxShadow: "0 1px 0 #FFF inset, 0 2px 0 rgba(30,28,24,.02), 0 20px 40px -30px rgba(30,28,24,.2)",
  border: "1px solid rgba(30,28,24,.04)",
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid var(--color-line)",
  background: "var(--color-paper-light)",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
};

export default function AddUpdateCard({ projects }: { projects: Project[] }) {
  const router = useRouter();
  const activeProjects = useMemo(
    () => projects.filter(p => p.status === "active"),
    [projects]
  );
  const [scope, setScope] = useState<"project" | "general">("project");
  const [projectId, setProjectId] = useState(activeProjects[0]?.id ?? projects[0]?.id ?? "");
  const [body, setBody] = useState("");
  const [updateType, setUpdateType] = useState("note");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    if (!body.trim()) return;
    if (scope === "project" && !projectId) {
      setMessage("Select a project first.");
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      if (scope === "project") {
        const res = await fetch(`/api/projects/${projectId}/updates`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ update_type: updateType, body: body.trim() }),
        });
        if (!res.ok) throw new Error("Failed to post project update");
      } else {
        const usersRes = await fetch("/api/users");
        const usersData = await usersRes.json();
        const recipientIds = (usersData.users ?? []).map((u: { id: string }) => u.id);
        const res = await fetch("/api/broadcasts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: body.trim(), recipient_ids: recipientIds }),
        });
        if (!res.ok) throw new Error("Failed to post general update");
      }
      setBody("");
      setMessage(scope === "project" ? "Project update posted." : "General update posted.");
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not post update.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={C}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 22, fontFamily: "'Instrument Serif', serif", fontWeight: 400, letterSpacing: -0.3 }}>Add Update</div>
          <div style={{ fontSize: 12, color: "var(--color-tan)", marginTop: 6 }}>Share project notes or a general team update</div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 6, background: "var(--color-bg)", padding: 4, borderRadius: 12, width: "fit-content" }}>
          {(["project", "general"] as const).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              style={{
                padding: "6px 12px",
                borderRadius: 9,
                border: "none",
                background: scope === s ? "var(--color-ink)" : "transparent",
                color: scope === s ? "#FBF8F2" : "var(--color-tan)",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {scope === "project" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 10 }}>
            <select value={projectId} onChange={e => setProjectId(e.target.value)} style={{ ...input, appearance: "none" }}>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={updateType} onChange={e => setUpdateType(e.target.value)} style={{ ...input, appearance: "none" }}>
              <option value="note">Note</option>
              <option value="progress">Progress</option>
              <option value="remark">Remark</option>
              <option value="drawing">Drawing</option>
              <option value="material">Material</option>
            </select>
          </div>
        )}

        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder={scope === "project" ? "Write a project update..." : "Write a general update for everyone..."}
          rows={4}
          style={{ ...input, resize: "vertical", lineHeight: 1.45 }}
        />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span style={{ fontSize: 12, color: message?.includes("Failed") || message?.includes("Could not") ? "var(--color-rust)" : "var(--color-tan)" }}>
            {message ?? (scope === "general" ? "Posts to everyone as a broadcast." : "Appears in the project team stream.")}
          </span>
          <button
            type="button"
            onClick={submit}
            disabled={saving || !body.trim() || (scope === "project" && !projectId)}
            style={{
              padding: "9px 16px",
              borderRadius: 10,
              border: "none",
              background: saving || !body.trim() ? "var(--color-line)" : "var(--color-ink)",
              color: "#FBF8F2",
              fontSize: 12,
              fontWeight: 700,
              cursor: saving || !body.trim() ? "default" : "pointer",
            }}
          >
            {saving ? "Posting..." : "Post Update"}
          </button>
        </div>
      </div>
    </div>
  );
}
