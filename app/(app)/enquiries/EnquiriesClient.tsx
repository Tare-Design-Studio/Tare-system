"use client";

import { useState } from "react";
import Link from "next/link";
import { Chip, Icon } from "@/components/atoms";
import { PageHeader } from "../PageHeader";

type Reminder = {
  id: string;
  remind_at: string;
  message: string | null;
  category: string;
  priority: string | null;
  is_done: boolean;
};

export type Enquiry = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  status: string;
  message: string | null;
  created_at: string;
  converted_to_customer_id: string | null;
  enquiry_reminders: Reminder[];
};

const COLUMNS = [
  { id: "new",                   label: "New",                  tone: "teal"    },
  { id: "quotation_sent",        label: "Quotation Sent",       tone: "indigo"  },
  { id: "awaiting_approval",     label: "Awaiting Approval",    tone: "amber"   },
  { id: "closed_for_discussion", label: "Closed for Discussion",tone: "rust"    },
  { id: "converted",             label: "Converted",            tone: "forest"  },
  { id: "lost",                  label: "Lost",                 tone: "ink"     },
] as const;

const SOURCE_TONE: Record<string, string> = {
  referral:  "mint",
  website:   "teal",
  whatsapp:  "forest",
  instagram: "rose",
  youtube:   "amber",
  walk_in:   "indigo",
  other:     "neutral",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function nextReminder(reminders: Reminder[]) {
  return reminders
    .filter((r) => !r.is_done)
    .sort((a, b) => new Date(a.remind_at).getTime() - new Date(b.remind_at).getTime())[0] ?? null;
}

function EnquiryCard({
  enquiry,
  selected,
  onSelect,
  onStatusChange,
  onConvert,
  onDelete,
}: {
  enquiry: Enquiry;
  selected: boolean;
  onSelect: () => void;
  onStatusChange: (id: string, status: string) => Promise<void>;
  onConvert: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const reminder = nextReminder(enquiry.enquiry_reminders);
  const src = enquiry.source ?? "other";

  return (
    <div
      className="project-card"
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(); }}
      style={{
        textAlign: "left",
        padding: "18px 20px",
        borderRadius: "var(--radius-card)",
        background: selected ? "var(--color-ink)" : "var(--color-paper-light)",
        color: selected ? "#F3EFE7" : "var(--color-ink)",
        border: selected ? "1px solid var(--color-ink)" : "1px solid var(--color-line)",
        boxShadow: selected ? "none" : "var(--shadow-card)",
        width: "100%",
        cursor: "pointer",
      }}
    >
      <div className="font-serif" style={{ fontSize: 24, marginBottom: 6, letterSpacing: "-0.01em", lineHeight: 1.1 }}>
        {enquiry.name}
      </div>
      {enquiry.message && (
        <div style={{
          fontSize: 12, marginBottom: 12, opacity: selected ? 0.8 : 0.65,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
          overflow: "hidden", lineHeight: 1.4,
        }}>
          {enquiry.message}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {enquiry.source && (
          <Chip size="sm" tone={SOURCE_TONE[src] as never} label={enquiry.source.replace(/_/g, " ")} />
        )}
      </div>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 10,
        opacity: 0.55,
        color: selected ? "rgba(243,239,231,.55)" : "var(--color-tan)",
      }}>
        {formatDate(enquiry.created_at)}
      </div>

      {reminder && (
        <div style={{
          marginTop: 8, padding: "6px 10px", borderRadius: 8,
          background: selected ? "rgba(255,255,255,.1)" : "var(--color-bg)",
          display: "flex", gap: 6, alignItems: "center",
        }}>
          <Icon name="clock" size={11} color={selected ? "rgba(243,239,231,.7)" : "var(--color-amber)"} />
          <span style={{ fontSize: 10, opacity: 0.85 }}>
            {reminder.category.replace(/_/g, " ")} · {formatDate(reminder.remind_at)}
          </span>
        </div>
      )}

      {selected && (
        <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 10 }}>
          <select
            value={enquiry.status}
            onChange={(e) => onStatusChange(enquiry.id, e.target.value)}
            style={{
              width: "100%", padding: "10px 12px", borderRadius: "var(--radius-btn)",
              border: "1px solid rgba(255,255,255,.15)",
              background: "rgba(255,255,255,.08)", color: "#F3EFE7",
              fontSize: 12, fontWeight: 500, fontFamily: "inherit", cursor: "pointer", outline: "none",
            }}
          >
            {COLUMNS.map((col) => (
              <option key={col.id} value={col.id} style={{ background: "var(--color-ink)", color: "#F3EFE7" }}>
                {col.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {selected && (
        <Link
          href={`/enquiries/${enquiry.id}`}
          onClick={(e) => e.stopPropagation()}
          style={{
            display: "block", marginTop: 12, padding: "10px 14px", borderRadius: "var(--radius-btn)",
            background: "rgba(255,255,255,.1)", color: "#F3EFE7",
            fontSize: 12, fontWeight: 500, textAlign: "center", textDecoration: "none",
          }}
        >
          View Full Timeline →
        </Link>
      )}
      {selected && enquiry.converted_to_customer_id && (
        <Link
          href={`/customers/${enquiry.converted_to_customer_id}`}
          onClick={(e) => e.stopPropagation()}
          style={{
            display: "block", marginTop: 8, padding: "10px 14px", borderRadius: "var(--radius-btn)",
            background: "rgba(255,255,255,.06)", color: "rgba(243,239,231,.75)",
            fontSize: 12, fontWeight: 500, textAlign: "center", textDecoration: "none",
          }}
        >
          View Customer →
        </Link>
      )}
      {selected && !enquiry.converted_to_customer_id && (
        <button
          onClick={(e) => { e.stopPropagation(); onConvert(enquiry.id); }}
          style={{
            display: "block", width: "100%", marginTop: 8, padding: "10px 14px", borderRadius: "var(--radius-btn)",
            background: "var(--color-forest)", color: "#FFF",
            fontSize: 12, fontWeight: 500, textAlign: "center", border: "none", cursor: "pointer",
          }}
        >
          Convert to Customer
        </button>
      )}
      {selected && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(enquiry.id); }}
          style={{
            display: "block", width: "100%", marginTop: 8, padding: "10px 14px", borderRadius: "var(--radius-btn)",
            background: "transparent", color: "rgba(255,200,200,.85)",
            fontSize: 12, fontWeight: 500, textAlign: "center", border: "1px solid rgba(255,200,200,.3)", cursor: "pointer",
          }}
        >
          Delete enquiry
        </button>
      )}
    </div>
  );
}

// New Enquiry quick-add form
function NewEnquiryPanel({ onCreated }: { onCreated: (e: Enquiry) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setLoading(true);
    const res = await fetch("/api/enquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone, source, message }),
    });
    setLoading(false);
    if (res.ok) {
      const created = await res.json();
      onCreated({ ...created, enquiry_reminders: [] });
      setOpen(false);
      setName(""); setPhone(""); setSource(""); setMessage("");
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          padding: "10px 18px", borderRadius: "var(--radius-btn)",
          background: "var(--color-ink)", color: "#F3EFE7",
          fontSize: 13, fontWeight: 500, border: "1px solid var(--color-ink)", cursor: "pointer",
          display: "inline-flex", alignItems: "center", gap: 8,
          boxShadow: "0 1px 0 rgba(255,255,255,0.1) inset",
        }}
      >
        <Icon name="plus" size={14} color="#F3EFE7" /> New Enquiry
      </button>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "12px 14px", borderRadius: "var(--radius-input)",
    border: "1px solid var(--color-line)", background: "var(--color-paper-light)",
    fontSize: 13, color: "var(--color-ink)", fontFamily: "inherit",
    marginBottom: 12, boxShadow: "var(--shadow-input)",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 50,
      background: "rgba(27,26,23,.45)", display: "flex",
      alignItems: "center", justifyContent: "center",
      backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
    }}>
      <div className="modal-mobile-full" style={{
        background: "var(--color-paper-light)", borderRadius: 28,
        padding: 32, width: 440, boxShadow: "0 1px 0 #FFF inset, 0 32px 64px -24px rgba(27,26,23,.3)",
        border: "1px solid rgba(27,26,23,0.04)"
      }}>
        <div className="font-serif" style={{ fontSize: 32, marginBottom: 24, letterSpacing: "-0.01em", lineHeight: 1.1 }}>
          New Enquiry
        </div>
        <input style={inputStyle} placeholder="Name *" value={name} onChange={(e) => setName(e.target.value)} />
        <input style={inputStyle} placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <select style={inputStyle} value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">Source (optional)</option>
          {["referral","website","whatsapp","instagram","youtube","walk_in","other"].map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
          ))}
        </select>
        <textarea
          style={{ ...inputStyle, resize: "vertical", minHeight: 72 }}
          placeholder="Message (optional)"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button
            onClick={submit}
            disabled={loading || !name.trim()}
            style={{
              flex: 1, padding: "12px", borderRadius: "var(--radius-btn)",
              background: "var(--color-ink)", color: "#F3EFE7",
              fontSize: 13, fontWeight: 500, border: "1px solid var(--color-ink)", cursor: "pointer",
              opacity: loading || !name.trim() ? 0.5 : 1,
              boxShadow: "0 1px 0 rgba(255,255,255,0.1) inset",
            }}
          >
            {loading ? "Saving…" : "Create"}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              padding: "12px 18px", borderRadius: "var(--radius-btn)", border: "1px solid var(--color-line)",
              background: "var(--color-paper-light)", fontSize: 13, cursor: "pointer", color: "var(--color-ink)",
              boxShadow: "0 1px 0 #FFF inset", fontWeight: 500,
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EnquiriesClient({ initial }: { initial: Enquiry[] }) {
  const [enquiries, setEnquiries] = useState<Enquiry[]>(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [mobileStage, setMobileStage] = useState<string>(COLUMNS[0].id);

  async function handleStatusChange(id: string, status: string) {
    setEnquiries((prev) => prev.map((e) => e.id === id ? { ...e, status } : e));
    await fetch(`/api/enquiries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }

  async function handleConvert(id: string) {
    if (!confirm("Convert this enquiry into a customer? This action cannot be undone.")) return;
    const res = await fetch(`/api/enquiries/${id}/convert`, { method: "POST" });
    if (!res.ok) {
      alert(`Failed to convert: ${await res.text()}`);
      return;
    }
    const data = await res.json();
    setEnquiries((prev) => prev.map((e) =>
      e.id === id
        ? { ...e, status: "converted", converted_to_customer_id: data.customer_id ?? data.id }
        : e
    ));
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this enquiry? This cannot be undone.")) return;
    const res = await fetch(`/api/enquiries/${id}`, { method: "DELETE" });
    if (!res.ok) {
      alert(`Failed to delete: ${await res.text()}`);
      return;
    }
    setEnquiries((prev) => prev.filter((e) => e.id !== id));
    setSelected(null);
  }

  return (
    <div style={{ padding: "0 0 40px" }}>
      <PageHeader
        title="Enquiries"
        subtitle={`${enquiries.length} enquiries · Owner only`}
        actions={<NewEnquiryPanel onCreated={(e) => setEnquiries((prev) => [e, ...prev])} />}
      />

      {/* Mobile: stage chip picker + single-column list */}
      <>
        <style>{`
          @media (min-width: 768px) { .enq-mobile { display: none !important; } }
          @media (max-width: 767px) { .enq-desktop { display: none !important; } }
        `}</style>

        <div className="enq-mobile" style={{ padding: "16px 0 40px" }}>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 12, WebkitOverflowScrolling: "touch" }}>
            {COLUMNS.map((col) => {
              const count = enquiries.filter((e) => e.status === col.id).length;
              return (
                <button
                  key={col.id}
                  onClick={() => setMobileStage(col.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
                    padding: "8px 14px", borderRadius: 999, border: mobileStage === col.id ? "1px solid var(--color-ink)" : "1px solid var(--color-line)", cursor: "pointer",
                    background: mobileStage === col.id ? "var(--color-ink)" : "var(--color-paper-light)",
                    color: mobileStage === col.id ? "#F3EFE7" : "var(--color-ink)",
                    fontSize: 12, fontWeight: 500, fontFamily: "inherit",
                    boxShadow: mobileStage === col.id ? "none" : "0 1px 0 #FFF inset, 0 2px 8px -4px rgba(30,28,24,.06)",
                  }}
                >
                  {col.label}
                  <span style={{ opacity: 0.6 }}>{count}</span>
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(() => {
              const activeCol = COLUMNS.find(c => c.id === mobileStage)!;
              const items = enquiries.filter((e) => e.status === mobileStage);
              return items.length === 0 ? (
                <div style={{
                  padding: 24, borderRadius: 14, border: "1px dashed var(--color-line)",
                  textAlign: "center", color: "var(--color-tan)", fontSize: 13,
                }}>
                  No enquiries in <strong>{activeCol.label}</strong>
                </div>
              ) : items.map((e) => (
                <EnquiryCard
                  key={e.id}
                  enquiry={e}
                  selected={selected === e.id}
                  onSelect={() => setSelected(selected === e.id ? null : e.id)}
                  onStatusChange={handleStatusChange}
                  onConvert={handleConvert}
                  onDelete={handleDelete}
                />
              ));
            })()}
          </div>
        </div>

        {/* Desktop: Kanban */}
        <div className="enq-desktop" style={{
          padding: "20px 0 40px",
          display: "flex", gap: 16, overflowX: "auto",
          alignItems: "flex-start",
        }}>
          {COLUMNS.map((col) => {
            const items = enquiries.filter((e) => e.status === col.id);
            return (
              <div key={col.id} style={{ minWidth: 260, flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                  <Chip tone={col.tone as never} dot label={col.label} />
                  <span className="font-mono" style={{ fontSize: 12, color: "var(--color-tan)" }}>{items.length}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {items.map((e) => (
                    <EnquiryCard
                      key={e.id}
                      enquiry={e}
                      selected={selected === e.id}
                      onSelect={() => setSelected(selected === e.id ? null : e.id)}
                      onStatusChange={handleStatusChange}
                      onConvert={handleConvert}
                      onDelete={handleDelete}
                    />
                  ))}
                  {items.length === 0 && (
                    <div style={{
                      padding: 20, borderRadius: 14,
                      border: "1px dashed var(--color-line)",
                      textAlign: "center", color: "var(--color-tan)", fontSize: 12,
                    }}>
                      Empty
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </>
    </div>
  );
}
