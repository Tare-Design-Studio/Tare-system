"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/atoms";
import { useMemberEditMode } from "./MemberEditMode";

const DELETE_PHRASE = "delete-employee-data";

export type ManageMember = {
  id: string;
  full_name: string;
  role: string;
  role_label: string | null;
  phone: string | null;
  experience_years: number | null;
  salary_inr: number | null;
};

const overlay: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 120, display: "flex", alignItems: "center", justifyContent: "center",
  background: "rgba(27,26,23,.5)", backdropFilter: "blur(4px)", padding: 24,
};

const fieldLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: "var(--color-tan)", textTransform: "uppercase",
  letterSpacing: "0.08em", display: "block", marginBottom: 6,
};

const field: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--color-line)",
  background: "var(--color-paper-light)", fontSize: 14, fontFamily: "inherit", color: "var(--color-ink)",
  outline: "none", boxSizing: "border-box",
};

export function MemberManageMenu({ member }: { member: ManageMember }) {
  const router = useRouter();
  const editMode = useMemberEditMode();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"edit" | "delete" | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  // The per-row pencil only appears once the card's edit mode is toggled on.
  // Keep mounted while a modal is open so it doesn't unmount mid-action.
  if (!editMode && mode === null) return null;

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Manage ${member.full_name}`}
        title="Manage member"
        style={{
          width: 30, height: 30, borderRadius: 8, border: "1px solid var(--color-line)",
          background: "var(--color-paper-light)", color: "var(--color-tan)", cursor: "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <Icon name="pencil" size={13} />
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 60, width: 180, padding: 6,
            borderRadius: 12, background: "var(--color-paper-light)", border: "1px solid var(--color-line)",
            boxShadow: "0 8px 28px -8px rgba(30,28,24,.28)",
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); setMode("edit"); }}
            style={menuItem}
          >
            Edit details
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); setMode("delete"); }}
            style={{ ...menuItem, color: "var(--color-rust)" }}
          >
            Remove access
          </button>
        </div>
      )}

      {mode === "edit" && (
        <EditMemberModal member={member} onClose={() => setMode(null)} onSaved={() => { setMode(null); router.refresh(); }} />
      )}
      {mode === "delete" && (
        <DeleteMemberModal member={member} onClose={() => setMode(null)} onDeleted={() => { setMode(null); router.refresh(); }} />
      )}
    </div>
  );
}

const menuItem: React.CSSProperties = {
  display: "block", width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 8,
  border: "none", background: "transparent", color: "var(--color-ink)", fontSize: 13,
  fontFamily: "inherit", cursor: "pointer",
};

function EditMemberModal({ member, onClose, onSaved }: { member: ManageMember; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    full_name: member.full_name,
    role_label: member.role_label ?? "",
    phone: member.phone ?? "",
    experience_years: member.experience_years != null ? String(member.experience_years) : "",
    salary_inr: member.salary_inr != null ? String(member.salary_inr) : "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(k: keyof typeof form, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function save() {
    if (!form.full_name.trim()) { setError("Name is required"); return; }
    setSaving(true); setError(null);
    const payload: Record<string, unknown> = {
      full_name: form.full_name.trim(),
      role_label: form.role_label.trim() || null,
      phone: form.phone.trim() || null,
      experience_years: form.experience_years.trim() === "" ? null : Number(form.experience_years),
      salary_inr: form.salary_inr.trim() === "" ? null : Number(form.salary_inr),
    };
    const res = await fetch(`/api/team/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Failed to save");
      return;
    }
    onSaved();
  }

  return (
    <div style={overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-mobile-full" style={{ background: "var(--color-paper-light)", borderRadius: 22, padding: 28, width: "100%", maxWidth: 440, boxShadow: "0 32px 80px -20px rgba(27,26,23,.3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <h2 className="font-serif" style={{ fontSize: 26, fontWeight: 400, margin: 0, letterSpacing: -0.5 }}>Edit Member</h2>
          <button onClick={onClose} aria-label="Close" style={closeBtn}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={fieldLabel}>Full Name *</label>
            <input style={field} value={form.full_name} onChange={(e) => set("full_name", e.target.value)} />
          </div>
          <div>
            <label style={fieldLabel}>Role / Title</label>
            <input style={field} value={form.role_label} onChange={(e) => set("role_label", e.target.value)} placeholder="e.g. Senior Architect" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={fieldLabel}>Phone</label>
              <input style={field} value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+91 98400…" />
            </div>
            <div>
              <label style={fieldLabel}>Experience (yrs)</label>
              <input style={field} type="number" min={0} value={form.experience_years} onChange={(e) => set("experience_years", e.target.value)} />
            </div>
          </div>
          <div>
            <label style={fieldLabel}>Salary (₹/yr)</label>
            <input style={field} type="number" min={0} value={form.salary_inr} onChange={(e) => set("salary_inr", e.target.value)} />
          </div>
          {error && <div style={errBox}>{error}</div>}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
            <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
            <button type="button" onClick={save} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DeleteMemberModal({ member, onClose, onDeleted }: { member: ManageMember; onClose: () => void; onDeleted: () => void }) {
  const [phrase, setPhrase] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmed = phrase.trim().toLowerCase() === DELETE_PHRASE;

  async function remove() {
    if (!confirmed || deleting) return;
    setDeleting(true); setError(null);
    const res = await fetch(`/api/team/${member.id}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Failed to delete");
      return;
    }
    onDeleted();
  }

  return (
    <div style={overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-mobile-full" style={{ background: "var(--color-paper-light)", borderRadius: 22, padding: 28, width: "100%", maxWidth: 440, boxShadow: "0 32px 80px -20px rgba(27,26,23,.3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h2 className="font-serif" style={{ fontSize: 26, fontWeight: 400, margin: 0, letterSpacing: -0.5, color: "var(--color-rust)" }}>Remove Access</h2>
          <button onClick={onClose} aria-label="Close" style={closeBtn}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--color-ink)", margin: "0 0 16px" }}>
          This permanently removes <strong>{member.full_name}</strong> and revokes their access to the system.
          Their historical records are retained. This cannot be undone from the app.
        </p>
        <label style={fieldLabel}>Type <code style={{ fontFamily: "var(--font-mono)", color: "var(--color-rust)" }}>{DELETE_PHRASE}</code> to confirm</label>
        <input
          style={{ ...field, borderColor: phrase && !confirmed ? "var(--color-rust)" : "var(--color-line)" }}
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          placeholder={DELETE_PHRASE}
          autoFocus
        />
        {error && <div style={{ ...errBox, marginTop: 12 }}>{error}</div>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
          <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
          <button
            type="button"
            onClick={remove}
            disabled={!confirmed || deleting}
            style={{
              ...primaryBtn,
              background: confirmed ? "var(--color-rust)" : "var(--color-tan)",
              cursor: confirmed && !deleting ? "pointer" : "not-allowed",
              opacity: confirmed ? 1 : 0.7,
            }}
          >
            {deleting ? "Removing…" : "Delete Permanently"}
          </button>
        </div>
      </div>
    </div>
  );
}

const closeBtn: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8, background: "var(--color-bg)", border: "none", cursor: "pointer",
  color: "var(--color-tan)", display: "flex", alignItems: "center", justifyContent: "center",
};
const cancelBtn: React.CSSProperties = {
  padding: "9px 18px", borderRadius: 10, border: "1px solid var(--color-line)", background: "transparent",
  fontSize: 13, fontFamily: "inherit", cursor: "pointer", color: "var(--color-ink)",
};
const primaryBtn: React.CSSProperties = {
  padding: "9px 20px", borderRadius: 10, background: "var(--color-ink)", color: "#FBF8F2",
  fontSize: 13, fontWeight: 600, fontFamily: "inherit", border: "none", cursor: "pointer",
};
const errBox: React.CSSProperties = {
  padding: "10px 14px", borderRadius: 10, background: "#C5543B18", color: "var(--color-rust)", fontSize: 13,
};
