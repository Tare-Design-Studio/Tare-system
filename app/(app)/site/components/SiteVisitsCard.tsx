"use client";

import { SiteVisit, formatDate, formatTime } from "./shared";

// Upcoming owner-scheduled site visits (enquiry_reminders.category='site_visit')
// for customers whose projects this engineer is assigned to.
export default function SiteVisitsCard({ siteVisits }: { siteVisits: SiteVisit[] }) {
  return (
    <div style={{ background: "var(--color-paper-light)", borderRadius: 20, boxShadow: "var(--shadow-card)", border: "1px solid rgba(30,28,24,.04)", padding: "20px 24px", marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-rust)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z" /><circle cx="12" cy="10" r="3" />
        </svg>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Scheduled Site Visits</div>
      </div>

      {siteVisits.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--color-tan)", fontStyle: "italic" }}>
          No upcoming site visits scheduled by the owner.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {siteVisits.map((v) => (
            <div key={v.id} style={{ padding: "12px 14px", borderRadius: 14, background: "var(--color-rust)0F", border: "1px solid var(--color-rust)30" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: v.message ? 6 : 0 }}>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "var(--color-rust)", color: "#FFF" }}>
                  Owner Site Visit
                </span>
                <span style={{ fontSize: 11, color: "var(--color-tan)" }}>
                  {formatDate(v.remind_at)} · {formatTime(v.remind_at)}
                </span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink)" }}>
                {v.customer_name ?? "Customer"}
                {v.project_names.length > 0 && (
                  <span style={{ fontWeight: 400, color: "var(--color-tan)" }}> · {v.project_names.join(", ")}</span>
                )}
              </div>
              {v.message && (
                <div style={{ fontSize: 12, color: "var(--color-tan)", lineHeight: 1.5, marginTop: 2 }}>{v.message}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
