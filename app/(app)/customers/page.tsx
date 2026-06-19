"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Avatar, Chip } from "@/components/atoms";
import { PageHeader } from "../PageHeader";

type PaymentRow = { is_paid: boolean; amount_due: number; amount_received: number };

type Project = {
  id: string;
  name: string;
  status: string;
  current_stage: string;
  v_payment_status: PaymentRow[];
};

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  created_at: string;
  projects: Project[];
};

const AVATAR_TONES = ["forest", "teal", "indigo", "amber", "rust", "mint"] as const;
type AvatarTone = typeof AVATAR_TONES[number];

function avatarTone(idx: number): AvatarTone {
  return AVATAR_TONES[idx % AVATAR_TONES.length];
}

function fmtAmount(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)} L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function initials(name: string) {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

function statusTone(s: string): "forest" | "teal" | "amber" | "mint" | "rust" | "ink" {
  switch (s) {
    case "active": return "forest";
    case "on_hold": return "amber";
    case "completed": return "mint";
    default: return "ink";
  }
}

function cap(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

const CARD: React.CSSProperties = {
  background: "var(--color-paper-light)",
  borderRadius: 22,
  padding: 24,
  boxShadow: "0 1px 0 #FFF inset, 0 2px 0 rgba(30,28,24,.02), 0 20px 40px -30px rgba(30,28,24,.2)",
  border: "1px solid rgba(30,28,24,.04)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid var(--color-line)",
  background: "var(--color-paper-light)",
  fontSize: 14,
  fontFamily: "inherit",
  color: "var(--color-ink)",
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--color-tan)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  display: "block",
  marginBottom: 6,
};

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/customers?include=projects");
    if (res.ok) {
      const data = await res.json();
      setCustomers(data.customers ?? []);
      if (!selectedId && (data.customers ?? []).length > 0) {
        setSelectedId(data.customers[0].id);
      }
    }
    setLoading(false);
  }, [selectedId]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = customers.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone ?? "").includes(search) ||
    (c.email ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const selected = customers.find(c => c.id === selectedId) ?? null;

  return (
    <div style={{ padding: "0 0 40px" }}>
      <PageHeader
        title="Customers"
        subtitle={`${customers.length} client${customers.length !== 1 ? "s" : ""} · Active & Completed`}
        actions={
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 20px", background: "var(--color-ink)", color: "#FBF8F2",
              borderRadius: 12, fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Customer
          </button>
        }
      />

      {customers.length === 0 && !loading ? (
        <div style={{
          ...CARD, textAlign: "center", padding: "48px 32px",
          boxShadow: "0 1px 0 #FFF inset, 0 20px 40px -30px rgba(30,28,24,.12)",
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>👤</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No customers yet</div>
          <div style={{ fontSize: 13, color: "var(--color-tan)" }}>
            Add a customer directly or convert an enquiry from the{" "}
            <button onClick={() => router.push("/enquiries")} style={{ color: "var(--color-forest)", fontWeight: 500, background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: 0 }}>
              Enquiries
            </button>{" "}board.
          </div>
        </div>
      ) : (
        <div className="stack-mobile" style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 20, alignItems: "start" }}>
          {/* Left: list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {/* Search */}
            <div style={{ position: "relative", marginBottom: 14 }}>
              <svg style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--color-tan)", pointerEvents: "none" }}
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="text"
                placeholder="Search customers…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ ...inputStyle, paddingLeft: 36, fontSize: 13 }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filtered.map((c, idx) => {
                const project = c.projects?.[0] ?? null;
                const schedule = project?.v_payment_status ?? [];
                const outstanding = schedule.reduce((n, r) => n + Math.max(0, r.amount_due - (r.amount_received ?? 0)), 0);
                const isSelected = selectedId === c.id;

                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    style={{
                      textAlign: "left", padding: "16px 18px", borderRadius: 18,
                      background: isSelected ? "var(--color-ink)" : "var(--color-paper-light)",
                      color: isSelected ? "#F3EFE7" : "var(--color-ink)",
                      border: isSelected ? "none" : "1px solid rgba(30,28,24,.04)",
                      boxShadow: isSelected ? "none" : "0 1px 0 #FFF inset, 0 8px 20px -14px rgba(30,28,24,.14)",
                      cursor: "pointer", transition: "all .15s",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                      <Avatar
                        initials={initials(c.name)}
                        tone={isSelected ? "sand" : avatarTone(idx)}
                        size={36}
                      />
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{c.name}</div>
                        <div style={{ fontSize: 11, opacity: 0.65, marginTop: 2 }}>
                          {project ? project.name : "No project linked"}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                      <span style={{ opacity: 0.65 }}>Outstanding</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                        {schedule.length > 0 ? fmtAmount(outstanding) : "—"}
                      </span>
                    </div>
                  </button>
                );
              })}
              {filtered.length === 0 && search && (
                <div style={{ fontSize: 13, color: "var(--color-tan)", textAlign: "center", padding: "20px 0" }}>
                  No results for &ldquo;{search}&rdquo;
                </div>
              )}
            </div>
          </div>

          {/* Right: detail panel */}
          {selected ? (
            <CustomerDetailPanel
              customer={selected}
              onNavigate={() => router.push(`/customers/${selected.id}`)}
              onUpdated={load}
            />
          ) : (
            <div style={{ ...CARD, textAlign: "center", padding: "40px", color: "var(--color-tan)", fontSize: 13 }}>
              Select a customer to view details
            </div>
          )}
        </div>
      )}

      {showAddModal && (
        <AddCustomerModal
          onClose={() => setShowAddModal(false)}
          onCreated={(c) => {
            setCustomers(prev => [c, ...prev]);
            setSelectedId(c.id);
            setShowAddModal(false);
          }}
        />
      )}
    </div>
  );
}

function CustomerDetailPanel({
  customer, onNavigate, onUpdated,
}: {
  customer: Customer;
  onNavigate: () => void;
  onUpdated: () => void;
}) {
  const router = useRouter();
  const project = customer.projects?.[0] ?? null;
  const schedule = project?.v_payment_status ?? [];
  const totalFee = schedule.reduce((n, r) => n + r.amount_due, 0);
  const totalPaid = schedule.reduce((n, r) => n + (r.amount_received ?? 0), 0);
  const outstanding = totalFee - totalPaid;

  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const hasLinkedProjects = (customer.projects?.length ?? 0) > 0;

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onEsc(e: KeyboardEvent) { if (e.key === "Escape") setMenuOpen(false); }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [menuOpen]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Contact card */}
      <div style={CARD}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 14 }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center", minWidth: 0 }}>
            <Avatar initials={initials(customer.name)} tone="forest" size={52} />
            <div style={{ minWidth: 0 }}>
              <div className="font-serif" style={{ fontSize: 30, letterSpacing: -0.5, lineHeight: 1, fontWeight: 400, overflowWrap: "anywhere" }}>{customer.name}</div>
              <div style={{ display: "flex", gap: 14, marginTop: 8, color: "var(--color-tan)", fontSize: 12, flexWrap: "wrap" }}>
                {customer.phone && (
                  <span style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 0, overflowWrap: "anywhere" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 14a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.06 3.28h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.09 10.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21 17.92z" />
                    </svg>
                    {customer.phone}
                  </span>
                )}
                {customer.email && (
                  <span style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 0, overflowWrap: "anywhere" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
                      <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                    </svg>
                    {customer.email}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: "var(--color-tan)", marginTop: 6 }}>
                Since {fmtDate(customer.created_at)}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div ref={menuRef} style={{ position: "relative", display: "inline-flex" }}>
              <button
                onClick={() => setMenuOpen(v => !v)}
                aria-label="Manage customer"
                title="Manage customer"
                style={{
                  width: 34, height: 34, borderRadius: 10, display: "inline-flex", alignItems: "center", justifyContent: "center",
                  border: "1px solid var(--color-line)", background: "transparent", color: "var(--color-tan)", cursor: "pointer",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  style={{
                    position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 60, width: 180, padding: 6,
                    borderRadius: 12, background: "var(--color-paper-light)", border: "1px solid var(--color-line)",
                    boxShadow: "0 8px 28px -8px rgba(30,28,24,.28)",
                  }}
                >
                  <button
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); setShowEditModal(true); }}
                    style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 8, border: "none", background: "transparent", color: "var(--color-ink)", fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}
                  >
                    Edit details
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); setShowDeleteModal(true); }}
                    style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 8, border: "none", background: "transparent", color: "var(--color-rust)", fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}
                  >
                    Delete customer
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={() => setShowLinkModal(true)}
              style={{
                padding: "8px 14px", borderRadius: 10, fontSize: 12, fontWeight: 600,
                border: "1px solid var(--color-line)", background: "transparent",
                color: "var(--color-ink)", cursor: "pointer",
              }}
            >
              {project ? "Re-link Project" : "Link Project"}
            </button>
            <button
              onClick={onNavigate}
              style={{
                padding: "8px 14px", borderRadius: 10, fontSize: 12, fontWeight: 600,
                border: "none", background: "var(--color-ink)", color: "#FBF8F2", cursor: "pointer",
              }}
            >
              Open Full Profile
            </button>
          </div>
        </div>

        {/* Financial summary stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
          {[
            { label: "Total Project Value", value: totalFee > 0 ? fmtAmount(totalFee) : "—", color: "var(--color-ink)" },
            { label: "Paid to Date", value: totalPaid > 0 ? fmtAmount(totalPaid) : "—", color: "var(--color-mint)" },
            { label: "Outstanding", value: outstanding > 0 ? fmtAmount(outstanding) : "—", color: outstanding > 0 ? "var(--color-amber)" : "var(--color-ink)" },
          ].map((s, i) => (
            <div key={i} style={{ padding: "14px 16px", borderRadius: 14, background: "var(--color-bg)" }}>
              <div style={{ fontSize: 11, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>
                {s.label}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 600, color: s.color, letterSpacing: -0.5 }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Linked project */}
      {project && (
        <div style={CARD}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>
            Linked Project
          </div>
          <button
            onClick={() => router.push(`/projects/${project.id}`)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              width: "100%", textAlign: "left", padding: "12px 14px", borderRadius: 14,
              background: "var(--color-bg)", border: "none", cursor: "pointer",
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{project.name}</div>
              <div style={{ fontSize: 12, color: "var(--color-tan)", marginTop: 2 }}>
                {cap(project.current_stage)}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Chip label={cap(project.status)} tone={statusTone(project.status)} size="sm" dot />
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-tan)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </div>
          </button>
        </div>
      )}

      {/* Payment schedule */}
      {schedule.length > 0 && (
        <div style={CARD}>
          <div style={{ fontSize: 16, fontFamily: "'Instrument Serif', serif", fontWeight: 400, marginBottom: 16 }}>
            Payment Schedule
            <span style={{ fontSize: 12, color: "var(--color-tan)", fontFamily: "inherit", marginLeft: 8, fontWeight: 400 }}>
              {schedule.length} milestones
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {schedule.map((m, i) => (
              <div
                key={i}
                style={{
                  display: "grid", gridTemplateColumns: "1fr auto auto", gap: 16, alignItems: "center",
                  padding: "13px 0",
                  borderBottom: i < schedule.length - 1 ? "1px solid var(--color-line)" : "none",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 500 }}>
                  Milestone {i + 1}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 600 }}>
                  {fmtAmount(m.amount_due)}
                </div>
                <Chip
                  label={m.is_paid || (m.amount_received ?? 0) >= m.amount_due ? "Paid" : (m.amount_received ?? 0) > 0 ? "Partial" : "Due"}
                  tone={m.is_paid || (m.amount_received ?? 0) >= m.amount_due ? "mint" : (m.amount_received ?? 0) > 0 ? "amber" : "rust"}
                  size="sm"
                  dot
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {!project && (
        <div style={{ ...CARD, textAlign: "center", padding: "28px" }}>
          <div style={{ fontSize: 13, color: "var(--color-tan)", marginBottom: 14 }}>No project linked yet</div>
          <button
            onClick={() => setShowLinkModal(true)}
            style={{
              padding: "9px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600,
              background: "var(--color-ink)", color: "#FBF8F2", border: "none", cursor: "pointer",
            }}
          >
            Link a Project
          </button>
        </div>
      )}

      {showLinkModal && (
        <LinkProjectModal
          customerId={customer.id}
          onClose={() => setShowLinkModal(false)}
          onLinked={() => { setShowLinkModal(false); onUpdated(); }}
        />
      )}

      {showEditModal && (
        <EditCustomerModal
          customer={customer}
          onClose={() => setShowEditModal(false)}
          onSaved={() => { setShowEditModal(false); onUpdated(); }}
        />
      )}

      {showDeleteModal && (
        <DeleteCustomerModal
          customer={customer}
          hasLinkedProjects={hasLinkedProjects}
          onClose={() => setShowDeleteModal(false)}
          onDeleted={() => { setShowDeleteModal(false); onUpdated(); }}
        />
      )}
    </div>
  );
}

const DELETE_CUSTOMER_PHRASE = "delete-employee-data";

function EditCustomerModal({
  customer, onClose, onSaved,
}: {
  customer: Customer;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: customer.name,
    phone: customer.phone ?? "",
    email: customer.email ?? "",
    address: customer.address ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Name is required"); return; }
    setSaving(true); setError(null);
    const res = await fetch(`/api/customers/${customer.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
      }),
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
    <div
      style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(27,26,23,.5)", backdropFilter: "blur(4px)", padding: 24 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-mobile-full" style={{ background: "var(--color-paper-light)", borderRadius: 22, padding: 32, width: "100%", maxWidth: 480, boxShadow: "0 32px 80px -20px rgba(27,26,23,.3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
          <h2 className="font-serif" style={{ fontSize: 28, fontWeight: 400, margin: 0, letterSpacing: -0.5 }}>Edit Customer</h2>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: "var(--color-bg)", border: "none", cursor: "pointer", color: "var(--color-tan)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={labelStyle}>Name *</label>
            <input style={inputStyle} value={form.name} onChange={e => set("name", e.target.value)} required />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Phone</label>
              <input style={inputStyle} value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="+91 98400…" />
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input style={inputStyle} type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="email@…" />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Address</label>
            <input style={inputStyle} value={form.address} onChange={e => set("address", e.target.value)} placeholder="e.g. Whitefield, Bangalore" />
          </div>
          {error && (
            <div style={{ padding: "10px 14px", borderRadius: 10, background: "#C5543B18", color: "var(--color-rust)", fontSize: 13 }}>{error}</div>
          )}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: "9px 18px", borderRadius: 10, border: "1px solid var(--color-line)", background: "transparent", fontSize: 13, cursor: "pointer" }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ padding: "9px 20px", borderRadius: 10, background: saving ? "var(--color-tan)" : "var(--color-ink)", color: "#FBF8F2", fontSize: 13, fontWeight: 600, border: "none", cursor: saving ? "not-allowed" : "pointer" }}>
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteCustomerModal({
  customer, hasLinkedProjects, onClose, onDeleted,
}: {
  customer: Customer;
  hasLinkedProjects: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [phrase, setPhrase] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmed = phrase.trim().toLowerCase() === DELETE_CUSTOMER_PHRASE;

  async function remove() {
    if (!confirmed || deleting) return;
    setDeleting(true); setError(null);
    const res = await fetch(`/api/customers/${customer.id}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Failed to delete");
      return;
    }
    onDeleted();
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(27,26,23,.5)", backdropFilter: "blur(4px)", padding: 24 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-mobile-full" style={{ background: "var(--color-paper-light)", borderRadius: 22, padding: 32, width: "100%", maxWidth: 460, boxShadow: "0 32px 80px -20px rgba(27,26,23,.3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h2 className="font-serif" style={{ fontSize: 26, fontWeight: 400, margin: 0, letterSpacing: -0.5, color: "var(--color-rust)" }}>Delete Customer</h2>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: "var(--color-bg)", border: "none", cursor: "pointer", color: "var(--color-tan)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        {hasLinkedProjects ? (
          <p style={{ fontSize: 13, lineHeight: 1.6, margin: "0 0 4px", color: "var(--color-ink)" }}>
            <strong>{customer.name}</strong> still has linked project(s). Unlink them first, then delete.
          </p>
        ) : (
          <p style={{ fontSize: 13, lineHeight: 1.6, margin: "0 0 16px", color: "var(--color-ink)" }}>
            This permanently deletes <strong>{customer.name}</strong> and cannot be undone.
          </p>
        )}
        {!hasLinkedProjects && (
          <>
            <label style={{ ...labelStyle, marginBottom: 6 }}>Type <code style={{ fontFamily: "var(--font-mono)", color: "var(--color-rust)", textTransform: "none" }}>{DELETE_CUSTOMER_PHRASE}</code> to confirm</label>
            <input
              style={{ ...inputStyle, borderColor: phrase && !confirmed ? "var(--color-rust)" : "var(--color-line)" }}
              value={phrase}
              onChange={e => setPhrase(e.target.value)}
              placeholder={DELETE_CUSTOMER_PHRASE}
              autoFocus
            />
          </>
        )}
        {error && (
          <div style={{ padding: "10px 14px", borderRadius: 10, background: "#C5543B18", color: "var(--color-rust)", fontSize: 13, marginTop: 12 }}>{error}</div>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
          <button type="button" onClick={onClose} style={{ padding: "9px 18px", borderRadius: 10, border: "1px solid var(--color-line)", background: "transparent", fontSize: 13, cursor: "pointer" }}>Cancel</button>
          {!hasLinkedProjects && (
            <button
              type="button"
              onClick={remove}
              disabled={!confirmed || deleting}
              style={{
                padding: "9px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, border: "none",
                background: confirmed ? "var(--color-rust)" : "var(--color-tan)", color: "#FBF8F2",
                cursor: confirmed && !deleting ? "pointer" : "not-allowed", opacity: confirmed ? 1 : 0.7,
              }}
            >
              {deleting ? "Deleting…" : "Delete Permanently"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function AddCustomerModal({
  onClose, onCreated,
}: {
  onClose: () => void;
  onCreated: (c: Customer) => void;
}) {
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Name is required"); return; }
    setLoading(true); setError(null);
    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Failed to create"); setLoading(false); return; }
    onCreated({ ...data, projects: [] });
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(27,26,23,.5)", backdropFilter: "blur(4px)", padding: 24 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-mobile-full" style={{ background: "var(--color-paper-light)", borderRadius: 22, padding: 32, width: "100%", maxWidth: 480, boxShadow: "0 32px 80px -20px rgba(27,26,23,.3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
          <h2 className="font-serif" style={{ fontSize: 28, fontWeight: 400, margin: 0, letterSpacing: -0.5 }}>Add Customer</h2>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: "var(--color-bg)", border: "none", cursor: "pointer", color: "var(--color-tan)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={labelStyle}>Name *</label>
            <input style={inputStyle} value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Rahul Sharma" required />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Phone</label>
              <input style={inputStyle} value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="+91 98400…" />
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input style={inputStyle} type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="email@…" />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Address</label>
            <input style={inputStyle} value={form.address} onChange={e => set("address", e.target.value)} placeholder="e.g. Whitefield, Bangalore" />
          </div>
          {error && (
            <div style={{ padding: "10px 14px", borderRadius: 10, background: "#C5543B18", color: "var(--color-rust)", fontSize: 13 }}>{error}</div>
          )}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: "9px 18px", borderRadius: 10, border: "1px solid var(--color-line)", background: "transparent", fontSize: 13, cursor: "pointer" }}>Cancel</button>
            <button type="submit" disabled={loading} style={{ padding: "9px 20px", borderRadius: 10, background: loading ? "var(--color-tan)" : "var(--color-ink)", color: "#FBF8F2", fontSize: 13, fontWeight: 600, border: "none", cursor: loading ? "not-allowed" : "pointer" }}>
              {loading ? "Saving…" : "Add Customer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function LinkProjectModal({
  customerId, onClose, onLinked,
}: {
  customerId: string;
  onClose: () => void;
  onLinked: () => void;
}) {
  const [projects, setProjects] = useState<{ id: string; name: string; status: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/projects")
      .then(r => r.json())
      .then(d => { setProjects(d.projects ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function handleLink() {
    if (!selected) return;
    setSaving(true); setError(null);
    const res = await fetch(`/api/projects/${selected}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer_id: customerId }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Failed to link"); setSaving(false); return; }
    onLinked();
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(27,26,23,.5)", backdropFilter: "blur(4px)", padding: 24 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-mobile-full" style={{ background: "var(--color-paper-light)", borderRadius: 22, padding: 32, width: "100%", maxWidth: 480, boxShadow: "0 32px 80px -20px rgba(27,26,23,.3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 className="font-serif" style={{ fontSize: 28, fontWeight: 400, margin: 0, letterSpacing: -0.5 }}>Link Project</h2>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: "var(--color-bg)", border: "none", cursor: "pointer", color: "var(--color-tan)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        {loading ? (
          <div style={{ fontSize: 13, color: "var(--color-tan)", textAlign: "center", padding: "20px 0" }}>Loading projects…</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={labelStyle}>Select Project</label>
              <select
                value={selected}
                onChange={e => setSelected(e.target.value)}
                style={{ ...inputStyle, appearance: "none" as const }}
              >
                <option value="">— Choose a project —</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({cap(p.status)})</option>
                ))}
              </select>
            </div>
            {error && (
              <div style={{ padding: "10px 14px", borderRadius: 10, background: "#C5543B18", color: "var(--color-rust)", fontSize: 13 }}>{error}</div>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" onClick={onClose} style={{ padding: "9px 18px", borderRadius: 10, border: "1px solid var(--color-line)", background: "transparent", fontSize: 13, cursor: "pointer" }}>Cancel</button>
              <button
                onClick={handleLink}
                disabled={!selected || saving}
                style={{ padding: "9px 20px", borderRadius: 10, background: (!selected || saving) ? "var(--color-tan)" : "var(--color-ink)", color: "#FBF8F2", fontSize: 13, fontWeight: 600, border: "none", cursor: (!selected || saving) ? "not-allowed" : "pointer" }}
              >
                {saving ? "Linking…" : "Link Project"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
