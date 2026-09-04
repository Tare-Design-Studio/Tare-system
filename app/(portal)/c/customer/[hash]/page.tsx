import StageFeedback from "./StageFeedback";
import PaymentSchedule from "./PaymentSchedule";
import NameGate from "./NameGate";
import { notFound } from "next/navigation";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customer Portal — ArchitectOS" };

type Checkpoint = {
  id: string;
  name: string;
  sequence_order: number;
  due_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  total_items: number;
  completed_items: number;
  progress_pct: number | null;
  status: "complete" | "in_progress" | "overdue" | "pending";
};
type Payment = {
  milestone_name: string;
  amount_due: number | string;
  amount_received: number | string;
  due_date: string | null;
  is_paid: boolean;
  wing: string | null;
  part: string | null;
  // Date of the most recent receipt against this milestone (MAX(paid_on) from
  // payment_records, via v_payment_status). Null until money actually lands.
  last_paid_on: string | null;
};
type ProjectSummary = {
  id: string;
  name: string;
  project_type: string | null;
  current_stage: string | null;
  status: string;
  start_date: string | null;
  expected_end_date: string | null;
  checkpoints: Checkpoint[];
  payments: Payment[];
};
type ClientUpdate = {
  id: string;
  body: string;
  project_name: string | null;
  created_at: string;
};
type PortalImage = {
  id: string;
  storage_path: string;
  webp_path: string | null;
  bucket: string;
  kind: string;
  caption: string | null;
  taken_at: string | null;
};
type SignedImage = {
  id: string;
  url: string | null;
  kind: string;
  caption: string | null;
  taken_at: string | null;
};
type Visit = {
  id: string;
  visitor_name: string | null;
  project_name: string | null;
  visited_on: string;
  note: string | null;
};
type Summary = {
  customer_name: string;
  projects: ProjectSummary[];
  updates: ClientUpdate[];
  images: PortalImage[];
  visits: Visit[];
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function fmtAmount(n: number): string {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)} L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

const CARD: React.CSSProperties = {
  background: "var(--paper)",
  borderRadius: 20,
  boxShadow: "0 1px 0 #FFF inset, 0 8px 24px -16px rgba(30,28,24,.14)",
  border: "1px solid rgba(30,28,24,.04)",
};

// Portal palette and base styles. Extracted so the name gate can be painted
// with the same tokens before any project data is rendered.
function PortalStyles() {
  return (
    <style>{`
      :root {
        --bg: #F3EFE7; --bg-2: #EDE7DB; --paper: #FBF8F2;
        --ink: #1B1A17; --ink-2: #3A3833; --muted: #8A857B;
        --line: #E2DBCC; --line-2: #D6CDBA;
        --accent: #2D6A4F; --accent-soft: #B7E4C7;
        --mint: #6B8A6E; --amber: #E2A64B; --rust: #C5543B;
      }
      *, *::before, *::after { box-sizing: border-box }
      html, body {
        margin: 0; padding: 0;
        background: var(--bg); color: var(--ink);
        font-family: 'Geist', ui-sans-serif, system-ui;
        -webkit-font-smoothing: antialiased;
      }
      body {
        background:
          radial-gradient(900px 500px at 80% -5%, #D8E2DC 0%, transparent 60%),
          radial-gradient(700px 400px at -10% 110%, #E8DFCC 0%, transparent 55%),
          var(--bg);
        min-height: 100vh;
      }
      .mono { font-family: 'Geist Mono', ui-monospace, monospace; letter-spacing: -.01em }
      .serif { font-family: 'Instrument Serif', serif; letter-spacing: -.01em }
      a { color: inherit; text-decoration: none }
      /* Slim, always-visible rail scrollbar: the payment schedule scrolls
         sideways, and on a trackpad an invisible one hides that it can. */
      .pay-rail::-webkit-scrollbar { height: 6px }
      .pay-rail::-webkit-scrollbar-track { background: transparent }
      .pay-rail::-webkit-scrollbar-thumb {
        background: var(--line-2); border-radius: 99px;
      }
      .pay-rail { scrollbar-width: thin; scrollbar-color: var(--line-2) transparent }
      @media (max-width: 640px) {
        .summary-grid { grid-template-columns: 1fr !important }
        .gallery-grid { grid-template-columns: 1fr 1fr !important }
      }
    `}</style>
  );
}

export default async function CustomerPortalPage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  if (!hash || hash.length !== 16) notFound();

  const supabase = await createClient();
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const userAgent = h.get("user-agent") || null;
  const reqId = h.get("x-request-id") || null;

  // Who is looking. Self-declared at the door (NameGate) and remembered in a
  // cookie so the prompt shows once per device. Unverified — it identifies the
  // open for the studio's records, it does not authorise it. The link alone
  // still grants everything it ever did.
  const jar = await cookies();
  const viewerName = jar.get("portal_viewer")?.value?.trim() || null;

  const { data, error } = await supabase.rpc("get_customer_portal_summary", {
    p_hash: hash,
    p_ip: ip ?? undefined,
    p_user_agent: userAgent ?? undefined,
    p_request_id: reqId ?? undefined,
    p_viewer_name: viewerName ?? undefined,
  }) as { data: Summary | null; error: unknown };

  if (error || !data) notFound();
  const summary = data;

  // Ask before showing anything. The RPC has already resolved the hash (so a
  // bad link still 404s rather than being asked for a name), and the view is
  // logged either way — the gate governs what is rendered, not what is
  // recorded, so a visitor who refuses to answer is still counted as an open.
  if (!viewerName) {
    return (
      <>
        <PortalStyles />
        <NameGate customerName={summary.customer_name} />
      </>
    );
  }

  // media-private is not a public bucket and the portal caller is anon, which
  // cannot mint signed URLs — so signing runs through the service client. The
  // hash in the URL is the only thing that got us here, and the RPC already
  // resolved it to this customer, so only their own curated images are signed.
  const rawImages: PortalImage[] = Array.isArray(summary.images) ? summary.images : [];
  let images: SignedImage[] = [];
  if (rawImages.length > 0) {
    const service = createServiceClient();
    images = await Promise.all(
      rawImages.map(async (img) => {
        // Prefer the compressed derivative; fall back to the original for
        // anything uploaded before webp conversion existed.
        const path = img.webp_path ?? img.storage_path;
        const { data: signed } = await service.storage
          .from(img.bucket)
          .createSignedUrl(path, 3600);
        return {
          id: img.id,
          url: signed?.signedUrl ?? null,
          kind: img.kind,
          caption: img.caption,
          taken_at: img.taken_at,
        };
      })
    );
    images = images.filter((i) => i.url !== null);
  }

  const updates: ClientUpdate[] = Array.isArray(summary.updates) ? summary.updates : [];
  const visits: Visit[] = Array.isArray(summary.visits) ? summary.visits : [];

  // The portal leads with what the client actually needs to act on: the next
  // payment coming up, and the last one that landed. Totals (billed /
  // outstanding) are still visible per project, but no longer head the page —
  // a running balance is the studio's view of the relationship, not the
  // client's next action.
  const allPayments = summary.projects.flatMap((p) =>
    p.payments.map((x) => ({ ...x, projectName: p.name }))
  );

  // Next expected = the earliest-dated milestone not yet settled. Undated ones
  // sort last so a schedule with no dates still yields a sensible pick rather
  // than nothing.
  const nextExpected = allPayments
    .filter((x) => paymentStatus(x) !== "paid")
    .sort((a, b) => {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    })[0] ?? null;

  // Most recent receipt, by the date money actually arrived (last_paid_on from
  // payment_records via v_payment_status) — not by due date, which is when it
  // was meant to.
  const lastReceived = allPayments
    .filter((x) => x.last_paid_on && Number(x.amount_received) > 0)
    .sort((a, b) => (b.last_paid_on ?? "").localeCompare(a.last_paid_on ?? ""))[0] ?? null;

  const hasPayments = allPayments.length > 0;

  return (
    <>
        <PortalStyles />

      <div style={{ maxWidth: 880, margin: "0 auto", padding: "max(env(safe-area-inset-top, 0px), 40px) 28px 60px" }}>

        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 40, paddingBottom: 20, borderBottom: "1px solid var(--line)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img src="/tare-logo.png" alt="Tare Logo" style={{ width: 80, height: 35, borderRadius: 8, objectFit: "contain", flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 10, letterSpacing: 1.5, color: "var(--muted)", textTransform: "uppercase", marginTop: 1 }}>Client Portal</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 500, color: "var(--accent)", background: "rgba(45,106,79,.1)", padding: "3px 8px", borderRadius: 99 }}>
              {summary.projects.length} Project{summary.projects.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Hero */}
        <div style={{ marginBottom: 36 }}>
          <div style={{ fontSize: 12, color: "var(--muted)", letterSpacing: .6, textTransform: "uppercase", marginBottom: 8 }}>
            Customer Portal
          </div>
          <h1 className="serif" style={{ margin: 0, fontSize: 52, lineHeight: 1, fontWeight: 400, letterSpacing: -1.2 }}>
            {summary.customer_name}
          </h1>
        </div>

        {/* Summary cards */}
        {hasPayments && (
          <div className="summary-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 16, marginBottom: 32 }}>
            <SummaryCard
              label="Next Payment"
              value={nextExpected ? fmtAmount(Number(nextExpected.amount_due) - Number(nextExpected.amount_received)) : "—"}
              sub={nextExpected
                ? `${nextExpected.milestone_name}${nextExpected.due_date ? ` · due ${fmtDate(nextExpected.due_date)}` : " · no date set"}`
                : "Nothing outstanding"}
              color="var(--amber)"
            />
            <SummaryCard
              label="Received"
              value={lastReceived ? fmtAmount(Number(lastReceived.amount_received)) : "—"}
              sub={lastReceived
                ? `${lastReceived.milestone_name} · ${fmtDate(lastReceived.last_paid_on)}`
                : "No payments yet"}
              color="var(--mint)"
            />
          </div>
        )}

        {/* Updates from the studio — the box the client reads first. */}
        {updates.length > 0 && (
          <div style={{ ...CARD, padding: 24, marginBottom: 20 }}>
            <div className="serif" style={{ fontSize: 28, letterSpacing: -.5, marginBottom: 16 }}>Updates</div>
            <div>
              {updates.map((u, i) => (
                <div
                  key={u.id}
                  style={{
                    padding: "14px 0",
                    borderBottom: i < updates.length - 1 ? "1px solid var(--line)" : "none",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", marginBottom: 6 }}>
                    <span className="mono" style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: .6 }}>
                      {fmtDate(u.created_at)}
                    </span>
                    {u.project_name && (
                      <span style={{ fontSize: 11, color: "var(--accent)", background: "rgba(45,106,79,.1)", padding: "3px 8px", borderRadius: 99 }}>
                        {u.project_name}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.55, color: "var(--ink-2)", whiteSpace: "pre-wrap" }}>
                    {u.body}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Photos & drawings — one flat gallery across every project. */}
        {images.length > 0 && (
          <div style={{ ...CARD, padding: 24, marginBottom: 20 }}>
            <div className="serif" style={{ fontSize: 28, letterSpacing: -.5, marginBottom: 16 }}>Photos &amp; Drawings</div>
            <div className="gallery-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {images.map(img => (
                <figure key={img.id} style={{ margin: 0 }}>
                  <img
                    src={img.url ?? ""}
                    alt={img.caption ?? (img.kind === "drawing" ? "Drawing" : "Site photo")}
                    loading="lazy"
                    style={{
                      width: "100%", aspectRatio: "4 / 3", objectFit: "cover",
                      borderRadius: 12, border: "1px solid var(--line)", display: "block",
                      background: "var(--bg-2)",
                    }}
                  />
                  {(img.caption || img.taken_at) && (
                    <figcaption style={{ fontSize: 11, color: "var(--muted)", marginTop: 6, lineHeight: 1.4 }}>
                      {img.caption ?? (img.kind === "drawing" ? "Drawing" : "Site photo")}
                      {img.taken_at && <> · {fmtDate(img.taken_at)}</>}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          </div>
        )}

        {/* Site visits — who came, and when. Nothing else. */}
        {visits.length > 0 && (
          <div style={{ ...CARD, padding: 24, marginBottom: 20 }}>
            <div className="serif" style={{ fontSize: 28, letterSpacing: -.5, marginBottom: 16 }}>Site Visits</div>
            <div>
              {visits.map((v, i) => (
                <div
                  key={v.id}
                  style={{
                    display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline",
                    padding: "12px 0",
                    borderBottom: i < visits.length - 1 ? "1px solid var(--line)" : "none",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{v.visitor_name ?? "Site visit"}</div>
                    {(v.note || v.project_name) && (
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
                        {[v.project_name, v.note].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </div>
                  <span className="mono" style={{ fontSize: 12, color: "var(--muted)", flexShrink: 0 }}>
                    {fmtDate(v.visited_on)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Projects */}
        {summary.projects.map(p => (
          <ProjectCard key={p.id} project={p} portalHash={hash} />
        ))}

        {summary.projects.length === 0 && (
          <div style={{ ...CARD, padding: 40, textAlign: "center", color: "var(--muted)", fontSize: 14, marginBottom: 32 }}>
            No projects linked.
          </div>
        )}

        {/* Footer */}
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 24, display: "flex", alignItems: "center", justifyContent: "space-between", color: "var(--muted)", fontSize: 11 }}>
          <span />
          <span className="mono">/c/customer/{hash}</span>
        </div>

      </div>
    </>
  );
}

function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{ ...CARD, borderRadius: 18, padding: "18px 20px" }}>
      <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{label}</div>
      <div className="mono" style={{ fontSize: 26, fontWeight: 600, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>{sub}</div>
    </div>
  );
}

// Mirrors the studio-side PaymentsCard rule exactly: an explicit is_paid flag
// settles a milestone even with no record behind it (waiver/adjustment), and a
// milestone is also paid once receipts cover what was billed.
function paymentStatus(pay: Payment): "paid" | "partial" | "pending" {
  const due = Number(pay.amount_due);
  const got = Number(pay.amount_received);
  if (pay.is_paid || (due > 0 && got >= due)) return "paid";
  if (got > 0) return "partial";
  return "pending";
}

function ProjectCard({ project: p, portalHash }: { project: ProjectSummary; portalHash: string }) {
  const projTotal = p.payments.reduce((s, x) => s + Number(x.amount_due), 0);
  const projReceived = p.payments.reduce((s, x) => s + Number(x.amount_received), 0);
  const completed = p.checkpoints.filter(c => c.status === "complete").length;
  const total = p.checkpoints.length;
  const overallPct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div style={{ ...CARD, padding: 24, marginBottom: 20 }}>
      {/* Project header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 16 }}>
        <div>
          <div className="serif" style={{ fontSize: 28, letterSpacing: -.5, lineHeight: 1.1 }}>{p.name}</div>
          <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: .6, marginTop: 6 }}>
            {[p.project_type, p.current_stage?.replace(/_/g, " ")].filter(Boolean).join(" · ") || p.status}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div className="mono" style={{ fontSize: 17, fontWeight: 600 }}>{fmtAmount(projReceived)} / {fmtAmount(projTotal)}</div>
          <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>Received / Billed</div>
        </div>
      </div>

      {/* Project meta */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", color: "var(--ink-2)", fontSize: 13, marginBottom: 18 }}>
        {p.start_date && <span>Started: <b>{fmtDate(p.start_date)}</b></span>}
        {p.expected_end_date && <span>Est. completion: <b>{fmtDate(p.expected_end_date)}</b></span>}
      </div>

      {/* Payment schedule — same status rules as the studio-side PaymentsCard,
          so a client and the studio read one story. A horizontal rail per
          (wing, part) group, opened at the latest paid milestone. */}
      {p.payments.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1 }}>
              Payment Schedule
            </div>
            <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
              {fmtAmount(projReceived)} received of {fmtAmount(projTotal)}
            </span>
          </div>
          <PaymentSchedule payments={p.payments} />
        </div>
      )}

      {/* Milestones */}
      {total > 0 && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1 }}>
              Project Milestones
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ width: 100, height: 5, background: "var(--line-2)", borderRadius: 99, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${overallPct}%`, background: "var(--accent)", borderRadius: 99, transition: "width .3s" }} />
              </div>
              <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{completed}/{total}</span>
            </div>
          </div>
          <div style={{ background: "var(--bg)", borderRadius: 14, padding: "6px 16px", border: "1px solid var(--line)" }}>
            {p.checkpoints.map((cp, i) => {
              const isActive = cp.status === "in_progress" || cp.status === "overdue";
              return (
                <div key={cp.id} style={{ display: "grid", gridTemplateColumns: "20px 1fr auto", gap: 12, alignItems: "center", padding: "12px 0", borderBottom: i < p.checkpoints.length - 1 ? "1px solid var(--line)" : "none" }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: "50%",
                    background: cp.status === "complete" ? "var(--ink)" : isActive ? "var(--accent)" : "var(--bg-2)",
                    border: `2px solid ${cp.status === "complete" ? "var(--ink)" : isActive ? "var(--accent)" : "var(--line-2)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {cp.status === "complete" && (
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#F3EFE7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: cp.status === "complete" || isActive ? 600 : 400, color: cp.status === "pending" ? "var(--muted)" : "var(--ink)" }}>
                      {cp.name}
                    </div>
                    {cp.total_items > 0 && (
                      <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center" }}>
                        <div style={{ width: 80, height: 4, background: "var(--line-2)", borderRadius: 99, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${cp.progress_pct ?? 0}%`, background: cp.status === "complete" ? "var(--mint)" : "var(--accent)", borderRadius: 99 }} />
                        </div>
                        <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
                          {cp.completed_items}/{cp.total_items}
                        </span>
                      </div>
                    )}
                  </div>
                  <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: cp.status === "complete" ? "var(--mint)" : isActive ? "var(--accent)" : "var(--muted)" }}>
                    {cp.progress_pct !== null ? `${cp.progress_pct}%` : cp.status === "complete" ? "100%" : "0%"}
                  </span>
                  {cp.status === "complete" && (
                    <div style={{ gridColumn: "2 / -1" }}>
                      <StageFeedback
                        portalHash={portalHash}
                        checkpointId={cp.id}
                        checkpointName={cp.name}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
