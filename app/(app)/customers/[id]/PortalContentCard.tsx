"use client";

import { useCallback, useState } from "react";

const CARD: React.CSSProperties = {
  background: "var(--color-paper-light)",
  borderRadius: 22,
  padding: 24,
  boxShadow: "0 1px 0 #FFF inset, 0 2px 0 rgba(30,28,24,.02), 0 20px 40px -30px rgba(30,28,24,.2)",
  border: "1px solid rgba(30,28,24,.04)",
};

const miniBtn: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: 6,
  border: "1px solid var(--color-line)",
  background: "transparent",
  fontSize: 11,
  cursor: "pointer",
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--color-line)",
  background: "var(--color-paper)",
  fontSize: 13,
  fontFamily: "inherit",
};

type Tab = "updates" | "images" | "visits";

type ClientUpdate = {
  id: string; body: string; project_id: string | null;
  is_visible: boolean; created_at: string; edited_at: string | null;
};

type PortalImage = {
  id: string; project_id: string; project_name: string | null;
  kind: string; taken_at: string | null;
  visible_to_customer: boolean; customer_caption: string | null; url: string | null;
};

type Visit = {
  id: string; project_id: string; project_name: string | null;
  visitor_name: string | null; checked_in_at: string;
  duration_minutes: number | null;
  visible_to_customer: boolean; customer_note: string | null; source: string;
};

type Project = { id: string; name: string };
type Member = { id: string; full_name: string };

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function PortalContentCard({
  customerId, projects, members,
}: {
  customerId: string;
  projects: Project[];
  members: Member[];
}) {
  const [tab, setTab] = useState<Tab>("updates");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [updates, setUpdates] = useState<ClientUpdate[]>([]);
  const [images, setImages] = useState<PortalImage[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);

  const [draft, setDraft] = useState("");
  const [draftProject, setDraftProject] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  const [showLogVisit, setShowLogVisit] = useState(false);
  const [visitProject, setVisitProject] = useState("");
  const [visitUser, setVisitUser] = useState("");
  const [visitDate, setVisitDate] = useState("");
  const [visitNote, setVisitNote] = useState("");

  const load = useCallback(async (which: Tab) => {
    setLoading(true);
    setErr(null);
    const path =
      which === "updates" ? "updates" :
      which === "images"  ? "portal-images" : "visits";
    try {
      const res = await fetch(`/api/customers/${customerId}/${path}`);
      if (!res.ok) throw new Error(await res.text() || "Request failed");
      const { data } = await res.json();
      if (which === "updates") setUpdates(data ?? []);
      else if (which === "images") setImages(data ?? []);
      else setVisits(data ?? []);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  // Loading is driven by events, never by a render effect: the first fetch is
  // kicked off once from the first render pass, and every later one comes from
  // a tab click. Keeps this component off the cascading-render path that
  // react-hooks/set-state-in-effect warns about.
  const [started, setStarted] = useState(false);
  if (!started) {
    setStarted(true);
    void load("updates");
  }

  function selectTab(next: Tab) {
    if (next === tab) return;
    setTab(next);
    void load(next);
  }

  async function post() {
    if (!draft.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft.trim(), project_id: draftProject || null }),
      });
      if (!res.ok) throw new Error(await res.text() || "Failed to post");
      setDraft("");
      setDraftProject("");
      await load("updates");
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function patchUpdate(id: string, patch: Record<string, unknown>) {
    const res = await fetch(`/api/customers/${customerId}/updates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) { alert(await res.text() || "Failed"); return; }
    await load("updates");
  }

  async function removeUpdate(id: string) {
    if (!confirm("Delete this update? The client will no longer see it.")) return;
    const res = await fetch(`/api/customers/${customerId}/updates/${id}`, { method: "DELETE" });
    if (!res.ok) { alert(await res.text() || "Failed"); return; }
    await load("updates");
  }

  async function patchImage(assetId: string, patch: Record<string, unknown>) {
    const res = await fetch(`/api/customers/${customerId}/portal-images`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset_id: assetId, ...patch }),
    });
    if (!res.ok) { alert(await res.text() || "Failed"); return; }
    await load("images");
  }

  async function patchVisit(visitId: string, patch: Record<string, unknown>) {
    const res = await fetch(`/api/customers/${customerId}/visits`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visit_id: visitId, ...patch }),
    });
    if (!res.ok) { alert(await res.text() || "Failed"); return; }
    await load("visits");
  }

  async function logVisit() {
    if (!visitProject || !visitUser || !visitDate || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/visits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: visitProject,
          user_id: visitUser,
          visited_on: visitDate,
          customer_note: visitNote.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text() || "Failed to log visit");
      setShowLogVisit(false);
      setVisitProject(""); setVisitUser(""); setVisitDate(""); setVisitNote("");
      await load("visits");
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: "updates", label: "Updates" },
    { key: "images",  label: "Images"  },
    { key: "visits",  label: "Visits"  },
  ];

  return (
    <div style={{ ...CARD, marginTop: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Client Portal Content</h2>
      </div>
      <p style={{ margin: "6px 0 16px", fontSize: 12, color: "var(--color-tan)" }}>
        Only what you publish here is visible on the client&apos;s portal.
      </p>

      <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => selectTab(t.key)}
            style={{
              ...miniBtn,
              fontWeight: tab === t.key ? 600 : 400,
              background: tab === t.key ? "var(--color-forest)" : "transparent",
              color: tab === t.key ? "#FFF" : "inherit",
              borderColor: tab === t.key ? "var(--color-forest)" : "var(--color-line)",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {err && <div style={{ fontSize: 12, color: "var(--color-rust)", marginBottom: 12 }}>{err}</div>}
      {loading && <div style={{ fontSize: 13, color: "var(--color-tan)" }}>Loading…</div>}

      {/* ── Updates ─────────────────────────────────────────────── */}
      {!loading && tab === "updates" && (
        <>
          <div style={{ marginBottom: 18 }}>
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="Write an update for the client…"
              rows={3}
              maxLength={2000}
              style={{ ...input, resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
              <select value={draftProject} onChange={e => setDraftProject(e.target.value)} style={{ ...input, width: "auto", flex: 1 }}>
                <option value="">No project tag</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button
                onClick={post}
                disabled={busy || !draft.trim()}
                style={{
                  ...miniBtn,
                  padding: "8px 16px", fontSize: 12, fontWeight: 600,
                  background: "var(--color-forest)", color: "#FFF", borderColor: "var(--color-forest)",
                  opacity: busy || !draft.trim() ? .5 : 1,
                }}
              >
                Post
              </button>
            </div>
          </div>

          {updates.length === 0 && (
            <div style={{ fontSize: 13, color: "var(--color-tan)" }}>No updates yet.</div>
          )}

          {updates.map(u => (
            <div key={u.id} style={{ padding: "12px 0", borderTop: "1px solid var(--color-line)" }}>
              {editingId === u.id ? (
                <>
                  <textarea
                    value={editBody}
                    onChange={e => setEditBody(e.target.value)}
                    rows={3}
                    maxLength={2000}
                    style={{ ...input, resize: "vertical" }}
                  />
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <button
                      style={miniBtn}
                      onClick={async () => {
                        if (!editBody.trim()) return;
                        await patchUpdate(u.id, { body: editBody.trim() });
                        setEditingId(null);
                      }}
                    >
                      Save
                    </button>
                    <button style={miniBtn} onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                    <span style={{ fontSize: 11, color: "var(--color-tan)" }}>
                      {fmtDate(u.created_at)}{u.edited_at ? " · edited" : ""}
                      {!u.is_visible && " · hidden"}
                    </span>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button style={miniBtn} onClick={() => patchUpdate(u.id, { is_visible: !u.is_visible })}>
                        {u.is_visible ? "Hide" : "Show"}
                      </button>
                      <button style={miniBtn} onClick={() => { setEditingId(u.id); setEditBody(u.body); }}>Edit</button>
                      <button style={miniBtn} onClick={() => removeUpdate(u.id)}>Delete</button>
                    </div>
                  </div>
                  <div style={{
                    fontSize: 13, lineHeight: 1.5, marginTop: 6, whiteSpace: "pre-wrap",
                    opacity: u.is_visible ? 1 : .5,
                  }}>
                    {u.body}
                  </div>
                </>
              )}
            </div>
          ))}
        </>
      )}

      {/* ── Images ──────────────────────────────────────────────── */}
      {!loading && tab === "images" && (
        <>
          {images.length === 0 && (
            <div style={{ fontSize: 13, color: "var(--color-tan)" }}>
              No images uploaded on this customer&apos;s projects yet.
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
            {images.map(img => (
              <div key={img.id} style={{ border: "1px solid var(--color-line)", borderRadius: 12, overflow: "hidden" }}>
                {img.url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={img.url}
                    alt={img.customer_caption ?? img.kind}
                    loading="lazy"
                    style={{
                      width: "100%", aspectRatio: "4 / 3", objectFit: "cover", display: "block",
                      opacity: img.visible_to_customer ? 1 : .45,
                    }}
                  />
                )}
                <div style={{ padding: 8 }}>
                  <div style={{ fontSize: 10, color: "var(--color-tan)", marginBottom: 6 }}>
                    {[img.project_name, img.kind === "drawing" ? "Drawing" : "Site photo"].filter(Boolean).join(" · ")}
                  </div>
                  <input
                    defaultValue={img.customer_caption ?? ""}
                    placeholder="Caption (optional)"
                    maxLength={200}
                    onBlur={e => {
                      const v = e.target.value.trim();
                      if (v !== (img.customer_caption ?? "")) patchImage(img.id, { customer_caption: v || null });
                    }}
                    style={{ ...input, fontSize: 11, padding: "5px 7px", marginBottom: 6 }}
                  />
                  <button
                    onClick={() => patchImage(img.id, { visible_to_customer: !img.visible_to_customer })}
                    style={{
                      ...miniBtn,
                      width: "100%",
                      background: img.visible_to_customer ? "var(--color-forest)" : "transparent",
                      color: img.visible_to_customer ? "#FFF" : "inherit",
                      borderColor: img.visible_to_customer ? "var(--color-forest)" : "var(--color-line)",
                    }}
                  >
                    {img.visible_to_customer ? "Visible to client" : "Hidden"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Visits ──────────────────────────────────────────────── */}
      {!loading && tab === "visits" && (
        <>
          <div style={{ marginBottom: 14 }}>
            <button style={miniBtn} onClick={() => setShowLogVisit(v => !v)}>
              {showLogVisit ? "Cancel" : "Log a visit"}
            </button>
          </div>

          {showLogVisit && (
            <div style={{ border: "1px solid var(--color-line)", borderRadius: 12, padding: 14, marginBottom: 16, display: "grid", gap: 8 }}>
              <select value={visitProject} onChange={e => setVisitProject(e.target.value)} style={input}>
                <option value="">Select project…</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select value={visitUser} onChange={e => setVisitUser(e.target.value)} style={input}>
                <option value="">Who visited…</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
              </select>
              <input type="date" value={visitDate} onChange={e => setVisitDate(e.target.value)} style={input} />
              <input
                value={visitNote}
                onChange={e => setVisitNote(e.target.value)}
                placeholder="Note for the client (optional)"
                maxLength={300}
                style={input}
              />
              <button
                onClick={logVisit}
                disabled={busy || !visitProject || !visitUser || !visitDate}
                style={{
                  ...miniBtn, padding: "8px 16px", fontSize: 12, fontWeight: 600,
                  background: "var(--color-forest)", color: "#FFF", borderColor: "var(--color-forest)",
                  opacity: busy || !visitProject || !visitUser || !visitDate ? .5 : 1,
                }}
              >
                Save visit
              </button>
            </div>
          )}

          {visits.length === 0 && (
            <div style={{ fontSize: 13, color: "var(--color-tan)" }}>No site visits recorded yet.</div>
          )}

          {visits.map(v => (
            <div key={v.id} style={{
              display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start",
              padding: "12px 0", borderTop: "1px solid var(--color-line)",
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {v.visitor_name ?? "Unknown"}
                  {v.source === "manual" && (
                    <span style={{ fontSize: 10, fontWeight: 400, color: "var(--color-tan)", marginLeft: 6 }}>
                      logged manually
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "var(--color-tan)", marginTop: 2 }}>
                  {[v.project_name, fmtDate(v.checked_in_at)].filter(Boolean).join(" · ")}
                </div>
                <input
                  defaultValue={v.customer_note ?? ""}
                  placeholder="Note shown to client (optional)"
                  maxLength={300}
                  onBlur={e => {
                    const val = e.target.value.trim();
                    if (val !== (v.customer_note ?? "")) patchVisit(v.id, { customer_note: val || null });
                  }}
                  style={{ ...input, fontSize: 11, padding: "5px 7px", marginTop: 6, maxWidth: 320 }}
                />
              </div>
              <button
                onClick={() => patchVisit(v.id, { visible_to_customer: !v.visible_to_customer })}
                style={{
                  ...miniBtn, flexShrink: 0,
                  background: v.visible_to_customer ? "var(--color-forest)" : "transparent",
                  color: v.visible_to_customer ? "#FFF" : "inherit",
                  borderColor: v.visible_to_customer ? "var(--color-forest)" : "var(--color-line)",
                }}
              >
                {v.visible_to_customer ? "Visible to client" : "Hidden"}
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
