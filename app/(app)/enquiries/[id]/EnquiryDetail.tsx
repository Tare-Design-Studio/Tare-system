"use client";

import { useState, useRef } from "react";
import Link from "next/link";

const CARD: React.CSSProperties = {
  background: "var(--color-paper-light)",
  borderRadius: 22,
  padding: 24,
  boxShadow: "0 1px 0 #FFF inset, 0 2px 0 rgba(30,28,24,.02), 0 20px 40px -30px rgba(30,28,24,.2)",
  border: "1px solid rgba(30,28,24,.04)",
};

const CATEGORIES = [
  { value: "meeting",    label: "Meeting"    },
  { value: "call",       label: "Call"       },
  { value: "quotation",  label: "Quotation"  },
  { value: "follow_up",  label: "Follow-up"  },
  { value: "site_visit", label: "Site Visit" },
  { value: "drawing",    label: "Drawing"    },
  { value: "other",      label: "Other"      },
];

const CATEGORY_COLOR: Record<string, string> = {
  meeting:    "var(--color-forest)",
  call:       "var(--color-teal)",
  quotation:  "var(--color-amber)",
  follow_up:  "var(--color-indigo)",
  site_visit: "var(--color-rust)",
  drawing:    "var(--color-mint)",
  other:      "var(--color-tan)",
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  new:                   { label: "New",                   color: "var(--color-teal)"   },
  quotation_sent:        { label: "Quotation Sent",        color: "var(--color-indigo)" },
  awaiting_approval:     { label: "Awaiting Approval",     color: "var(--color-amber)"  },
  closed_for_discussion: { label: "Closed for Discussion", color: "var(--color-rust)"   },
  converted:             { label: "Converted",             color: "var(--color-forest)" },
  lost:                  { label: "Lost",                  color: "var(--color-ink)"    },
};

type Remark = { id: string; remark: string; created_at: string; created_by: string | null };
type Reminder = {
  id: string; remind_at: string; message: string | null;
  category: string; priority: string | null; is_done: boolean; done_at: string | null;
};

type Enquiry = {
  id: string; name: string; phone: string | null; email: string | null;
  source: string | null; status: string; message: string | null; created_at: string;
  converted_to_customer_id: string | null;
  enquiry_remarks: Remark[];
  enquiry_reminders: Reminder[];
};

type TimelineItem =
  | { kind: "remark"; data: Remark; date: Date }
  | { kind: "reminder"; data: Reminder; date: Date };

function buildTimeline(remarks: Remark[], reminders: Reminder[]): TimelineItem[] {
  const items: TimelineItem[] = [
    ...remarks.map((r) => ({ kind: "remark" as const, data: r, date: new Date(r.created_at) })),
    ...reminders.map((r) => ({ kind: "reminder" as const, data: r, date: new Date(r.remind_at) })),
  ];
  return items.sort((a, b) => a.date.getTime() - b.date.getTime());
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

export default function EnquiryDetail({ enquiry: initial }: { enquiry: Enquiry }) {
  const [enquiry, setEnquiry] = useState<Enquiry>(initial);
  const [text, setText] = useState("");
  const [category, setCategory] = useState("follow_up");
  const [remindAt, setRemindAt] = useState("");
  const [showRemind, setShowRemind] = useState(false);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const timeline = buildTimeline(enquiry.enquiry_remarks, enquiry.enquiry_reminders);
  const statusMeta = STATUS_LABELS[enquiry.status] ?? { label: enquiry.status, color: "var(--color-tan)" };

  async function addNote() {
    if (!text.trim() || busy) return;
    setBusy(true);
    const res = await fetch(`/api/enquiries/${enquiry.id}/remarks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ remark: text.trim() }),
    });
    if (res.ok) {
      const r: Remark = await res.json();
      setEnquiry((e) => ({ ...e, enquiry_remarks: [...e.enquiry_remarks, r] }));
      setText("");
    }
    setBusy(false);
  }

  async function addReminder() {
    if (!text.trim() || !remindAt || busy) return;
    setBusy(true);
    const res = await fetch(`/api/enquiries/${enquiry.id}/reminders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text.trim(), category, remind_at: remindAt + ":00", priority: "normal" }),
    });
    if (res.ok) {
      const r: Reminder = await res.json();
      setEnquiry((e) => ({ ...e, enquiry_reminders: [...e.enquiry_reminders, r] }));
      setText("");
      setRemindAt("");
      setShowRemind(false);
    }
    setBusy(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }

  async function toggleDone(reminder: Reminder) {
    const res = await fetch(`/api/enquiries/${enquiry.id}/reminders`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reminder_id: reminder.id, is_done: !reminder.is_done }),
    });
    if (res.ok) {
      const updated: Reminder = await res.json();
      setEnquiry((e) => ({
        ...e,
        enquiry_reminders: e.enquiry_reminders.map((r) => r.id === updated.id ? updated : r),
      }));
    }
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      {/* Back */}
      <Link href="/enquiries" style={{
        display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 20,
        fontSize: 13, color: "var(--color-tan)", textDecoration: "none",
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
        </svg>
        Enquiries
      </Link>

      {/* Header card */}
      <div style={{ ...CARD, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div style={{ fontSize: 26, fontFamily: "'Instrument Serif', serif", fontWeight: 400, letterSpacing: -0.3 }}>
              {enquiry.name}
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 6, flexWrap: "wrap" }}>
              {enquiry.phone && (
                <a href={`tel:${enquiry.phone}`} style={{ fontSize: 13, color: "var(--color-ink)", textDecoration: "none" }}>
                  {enquiry.phone}
                </a>
              )}
              {enquiry.email && (
                <a href={`mailto:${enquiry.email}`} style={{ fontSize: 13, color: "var(--color-ink)", textDecoration: "none" }}>
                  {enquiry.email}
                </a>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
                background: statusMeta.color + "18", color: statusMeta.color,
              }}>
                {statusMeta.label}
              </span>
              {enquiry.source && (
                <span style={{ fontSize: 11, color: "var(--color-tan)" }}>
                  via {enquiry.source.replace(/_/g, " ")}
                </span>
              )}
              <span style={{ fontSize: 11, color: "var(--color-tan)" }}>
                Received {fmtDate(enquiry.created_at)}
              </span>
            </div>
          </div>
          {enquiry.converted_to_customer_id && (
            <Link href={`/customers/${enquiry.converted_to_customer_id}`} style={{
              fontSize: 12, fontWeight: 600, padding: "8px 14px", borderRadius: 10,
              background: "var(--color-forest)", color: "#FFF", textDecoration: "none",
            }}>
              View Customer →
            </Link>
          )}
        </div>

        {enquiry.message && (
          <div style={{
            marginTop: 16, padding: "12px 14px", borderRadius: 12,
            background: "var(--color-bg)", fontSize: 13, color: "var(--color-ink)", lineHeight: 1.6,
          }}>
            {enquiry.message}
          </div>
        )}
      </div>

      {/* Timeline */}
      <div style={{ ...CARD, marginBottom: 18 }}>
        <div style={{ fontSize: 16, fontFamily: "'Instrument Serif', serif", fontWeight: 400, marginBottom: 20 }}>
          Timeline
        </div>

        {timeline.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--color-tan)", padding: "12px 0" }}>
            No activity yet. Add a note or set a reminder below.
          </div>
        ) : (
          <div style={{ position: "relative" }}>
            {/* Vertical line */}
            <div style={{
              position: "absolute", left: 11, top: 8, bottom: 8,
              width: 1, background: "var(--color-line)",
            }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {timeline.map((item) => (
                <div key={item.kind + item.data.id} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  {/* Dot */}
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: item.kind === "remark" ? "var(--color-paper-light)" : CATEGORY_COLOR[item.data.category] ?? "var(--color-tan)",
                    border: item.kind === "remark" ? "1.5px solid var(--color-line)" : "none",
                    zIndex: 1,
                  }}>
                    {item.kind === "reminder" && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                      </svg>
                    )}
                    {item.kind === "remark" && (
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--color-tan)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                      </svg>
                    )}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, paddingTop: 1 }}>
                    {item.kind === "remark" && (
                      <div style={{
                        padding: "10px 14px", borderRadius: 12,
                        background: "var(--color-bg)", fontSize: 13, lineHeight: 1.6,
                        color: "var(--color-ink)",
                      }}>
                        <div>{item.data.remark}</div>
                        <div style={{ fontSize: 10, color: "var(--color-tan)", marginTop: 4 }}>
                          {fmt(item.data.created_at)}
                        </div>
                      </div>
                    )}
                    {item.kind === "reminder" && (
                      <div style={{
                        padding: "10px 14px", borderRadius: 12,
                        background: item.data.is_done ? "var(--color-bg)" : CATEGORY_COLOR[item.data.category] + "12",
                        border: item.data.is_done ? "none" : `1px solid ${CATEGORY_COLOR[item.data.category]}30`,
                        opacity: item.data.is_done ? 0.55 : 1,
                      }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                              <span style={{
                                fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
                                background: CATEGORY_COLOR[item.data.category] ?? "var(--color-tan)",
                                color: "#FFF",
                              }}>
                                {item.data.category.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                              </span>
                              <span style={{ fontSize: 10, color: "var(--color-tan)" }}>
                                {fmt(item.data.remind_at)}
                              </span>
                            </div>
                            {item.data.message && (
                              <div style={{ fontSize: 13, color: "var(--color-ink)", lineHeight: 1.5 }}>
                                {item.data.message}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => toggleDone(item.data)}
                            style={{
                              width: 22, height: 22, borderRadius: "50%", border: "1.5px solid",
                              borderColor: item.data.is_done ? "var(--color-forest)" : "var(--color-line)",
                              background: item.data.is_done ? "var(--color-forest)" : "transparent",
                              cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                            }}
                          >
                            {item.data.is_done && (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12"/>
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Compose */}
      <div style={{ ...CARD }}>
        <div style={{ fontSize: 16, fontFamily: "'Instrument Serif', serif", fontWeight: 400, marginBottom: 16 }}>
          Add to Timeline
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write a note or reminder message…"
          rows={3}
          style={{
            width: "100%", padding: "11px 14px", borderRadius: 12,
            border: "1px solid var(--color-line)", background: "var(--color-bg)",
            fontSize: 14, color: "var(--color-ink)", fontFamily: "inherit",
            resize: "vertical", outline: "none", boxSizing: "border-box",
          }}
        />

        <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button
            onClick={() => setShowRemind((v) => !v)}
            style={{
              padding: "8px 14px", borderRadius: 10, fontSize: 12, fontWeight: 600,
              border: "1px solid var(--color-line)",
              background: showRemind ? "var(--color-ink)" : "transparent",
              color: showRemind ? "#FFF" : "var(--color-tan)",
              cursor: "pointer",
            }}
          >
            Set Reminder
          </button>

          {!showRemind && (
            <button
              onClick={addNote}
              disabled={!text.trim() || busy}
              style={{
                padding: "8px 16px", borderRadius: 10, fontSize: 12, fontWeight: 600,
                background: !text.trim() ? "var(--color-line)" : "var(--color-ink)",
                color: "#FFF", border: "none", cursor: !text.trim() ? "default" : "pointer",
              }}
            >
              {busy ? "Adding…" : "Add Note"}
            </button>
          )}

          {showRemind && (
            <>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{
                  padding: "8px 12px", borderRadius: 10, fontSize: 12,
                  border: "1px solid var(--color-line)", background: "var(--color-bg)",
                  color: "var(--color-ink)", fontFamily: "inherit", cursor: "pointer",
                }}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>

              <input
                type="datetime-local"
                value={remindAt}
                onChange={(e) => setRemindAt(e.target.value)}
                style={{
                  padding: "8px 12px", borderRadius: 10, fontSize: 12,
                  border: "1px solid var(--color-line)", background: "var(--color-bg)",
                  color: "var(--color-ink)", fontFamily: "inherit",
                }}
              />

              <button
                onClick={addReminder}
                disabled={!text.trim() || !remindAt || busy}
                style={{
                  padding: "8px 16px", borderRadius: 10, fontSize: 12, fontWeight: 600,
                  background: (!text.trim() || !remindAt) ? "var(--color-line)" : "var(--color-forest)",
                  color: "#FFF", border: "none", cursor: (!text.trim() || !remindAt) ? "default" : "pointer",
                }}
              >
                {busy ? "Saving…" : "Remind"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
