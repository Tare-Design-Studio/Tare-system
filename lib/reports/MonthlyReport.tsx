/* eslint-disable jsx-a11y/alt-text */
// Monthly team report — @react-pdf/renderer document. Pure data in, PDF out.
// Rendered server-side by app/api/reports/monthly/route.ts.

import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";

// ─── Brand palette (mirrors app/globals.css) ────────────────────────────────
const C = {
  paper: "#F3EFE7",
  paperLight: "#FBF8F2",
  ink: "#1B1A17",
  ink2: "#3A3833",
  tan: "#8A857B",
  line: "#E2DBCC",
  forest: "#2D6A4F",
  forestLight: "#3D8A65",
  rust: "#C5543B",
  amber: "#E2A64B",
  indigo: "#4A5A9A",
  slate: "#2A3340",
  slateDeep: "#1E2530",
};

// ─── Report data shapes ──────────────────────────────────────────────────────
export type TeamMemberReport = {
  id: string;
  fullName: string;
  role: "team_member" | "site_engineer";
  roleLabel: string | null;
  tags: string[];
  phone: string | null;
  experienceYears: number | null;
  // Attendance (team members)
  daysPresent: number;
  totalMinutes: number;
  avgMinutes: number;
  checkInCount: number;
  geofenceFlags: number;
  // Tasks
  dailyTotal: number;
  dailyDone: number;
  persistentTotal: number;
  persistentDone: number;
  // Performance
  drawings: number;
  revisions: number;
  errors: number;
  avgDeadlinePct: number | null;
  avgRating: number | null;
  // Broadcasts
  broadcastsReceived: number;
  broadcastsAcked: number;
  // Site engineer
  siteCheckIns: number;
  siteWithinGeo: number;
  siteProjectsVisited: number;
  // Detail rows for per-member page
  attendanceRows: { date: string; checkIn: string; checkOut: string; minutes: number; flagged: boolean }[];
  taskRows: { title: string; done: boolean; when: string }[];
  checkInRows: { date: string; time: string; project: string; withinGeo: boolean }[];
};

export type ReportData = {
  studioName: string;
  monthLabel: string;
  generatedAt: string; // formatted IST string
  /** data: URI of the Tare logo PNG (read server-side); null if unavailable. */
  logoSrc: string | null;
  members: TeamMemberReport[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtHours(minutes: number): string {
  if (!minutes || minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const ROLE_LABEL: Record<string, string> = {
  team_member: "Team Member",
  site_engineer: "Site Engineer",
};

const TAG_LABEL: Record<string, string> = {
  accountant: "Accountant",
  admin: "Admin",
  project_manager: "Project Manager",
};

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 48,
    backgroundColor: C.paperLight,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: C.ink,
  },
  // ── Cover ──────────────────────────────────────────────────────────────
  cover: {
    flex: 1,
    backgroundColor: C.paperLight,
    position: "relative",
  },
  // Thin amber spine down the left edge.
  coverSpine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: 8,
    backgroundColor: C.amber,
  },
  // Deep slate band anchoring the lower third.
  coverBand: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 232,
    backgroundColor: C.slateDeep,
  },
  // Paper content zone — sits entirely above the slate band (band is 232pt).
  coverInner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 610, // page height (842) − band (232)
    paddingTop: 70,
    paddingHorizontal: 56,
    paddingBottom: 40,
    justifyContent: "space-between",
  },
  // Brand lockup
  coverLogo: { height: 56, objectFit: "contain", alignSelf: "flex-start" },
  coverHairline: { height: 2, width: 56, backgroundColor: C.amber, marginTop: 24 },

  // Title block — anchored to the lower part of the paper zone, above the band.
  coverTitleWrap: {},
  coverEyebrow: { fontSize: 10, letterSpacing: 4, color: C.amber, marginBottom: 18 },
  coverTitle: { fontSize: 54, fontFamily: "Times-Roman", lineHeight: 1.04, color: C.ink },
  coverTitleEm: { fontFamily: "Times-Italic", color: C.forest },
  coverMonth: {
    fontSize: 15,
    letterSpacing: 3,
    color: C.tan,
    marginTop: 20,
    textTransform: "uppercase",
  },

  // Metric band (on slate)
  coverBandInner: {
    position: "absolute",
    left: 56,
    right: 56,
    bottom: 56,
  },
  coverBandLabel: { fontSize: 8, letterSpacing: 3, color: C.amber, marginBottom: 18 },
  coverMetaRow: { flexDirection: "row" },
  coverMetaCell: { flex: 1, borderLeft: `1pt solid #3A4350`, paddingLeft: 12 },
  coverMetaLabel: { fontSize: 7, letterSpacing: 1.5, color: "#8B95A3", marginBottom: 6, textTransform: "uppercase" },
  coverMetaValue: { fontSize: 22, fontFamily: "Times-Roman", color: C.paperLight },
  coverGenRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 22,
    borderTop: `1pt solid #3A4350`,
    paddingTop: 12,
  },
  coverGenText: { fontSize: 8, color: "#8B95A3", letterSpacing: 0.5 },

  // Section headings
  sectionEyebrow: { fontSize: 8, letterSpacing: 2, color: C.forest, marginBottom: 4 },
  sectionTitle: { fontSize: 22, fontFamily: "Times-Roman", color: C.ink, marginBottom: 2 },
  sectionSub: { fontSize: 9, color: C.tan, marginBottom: 18 },

  // Summary stat band
  statBand: { flexDirection: "row", gap: 10, marginBottom: 22 },
  statCard: {
    flex: 1,
    backgroundColor: C.paper,
    borderRadius: 10,
    border: `1pt solid ${C.line}`,
    padding: 12,
  },
  statValue: { fontSize: 20, fontFamily: "Times-Roman", color: C.forest },
  statLabel: { fontSize: 7.5, letterSpacing: 1, color: C.tan, marginTop: 3, textTransform: "uppercase" },

  // Tables
  table: { borderRadius: 10, overflow: "hidden", border: `1pt solid ${C.line}` },
  tHead: { flexDirection: "row", backgroundColor: C.slate },
  tHeadCell: { color: C.paperLight, fontSize: 7.5, letterSpacing: 0.5, paddingVertical: 7, paddingHorizontal: 8, textTransform: "uppercase" },
  tRow: { flexDirection: "row", borderTop: `1pt solid ${C.line}`, backgroundColor: C.paperLight },
  tRowAlt: { backgroundColor: C.paper },
  tCell: { fontSize: 8.5, paddingVertical: 6, paddingHorizontal: 8, color: C.ink2 },

  // Per-member header block
  memberHeader: { marginBottom: 16 },
  memberNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  memberName: { fontSize: 20, fontFamily: "Times-Roman", color: C.ink },
  roleChip: {
    fontSize: 7,
    letterSpacing: 0.5,
    color: C.paperLight,
    backgroundColor: C.indigo,
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
    textTransform: "uppercase",
  },
  roleChipSe: { backgroundColor: C.amber },
  tagChip: {
    fontSize: 7,
    color: C.forest,
    backgroundColor: "#E4EEE8",
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  memberMeta: { fontSize: 8.5, color: C.tan, marginTop: 5 },

  subHeading: { fontSize: 8, letterSpacing: 1.5, color: C.forest, textTransform: "uppercase", marginTop: 16, marginBottom: 7 },
  empty: { fontSize: 8.5, color: C.tan, fontStyle: "italic", paddingVertical: 6 },

  // Footer
  footer: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTop: `1pt solid ${C.line}`,
    paddingTop: 8,
    fontSize: 7.5,
    color: C.tan,
  },
});

function Footer({ studioName, monthLabel }: { studioName: string; monthLabel: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>{studioName} · {monthLabel} Report</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

function StatCard({ value, label }: { value: string | number; label: string }) {
  return (
    <View style={s.statCard}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

// ─── Overview rows ───────────────────────────────────────────────────────────
const OV_COLS = [
  { key: "name", label: "Member", flex: 2.4 },
  { key: "role", label: "Role", flex: 1.4 },
  { key: "present", label: "Present", flex: 1 },
  { key: "hours", label: "Hours", flex: 1.2 },
  { key: "tasks", label: "Tasks", flex: 1.1 },
  { key: "activity", label: "Activity", flex: 1.3 },
] as const;

function OverviewRow({ m, alt }: { m: TeamMemberReport; alt: boolean }) {
  const isSe = m.role === "site_engineer";
  const present = isSe ? "—" : `${m.daysPresent}d`;
  const hours = isSe ? "—" : fmtHours(m.totalMinutes);
  const tasks = isSe ? "—" : `${m.dailyDone + m.persistentDone}/${m.dailyTotal + m.persistentTotal}`;
  const activity = isSe ? `${m.siteCheckIns} check-ins` : `${m.drawings} drawings`;
  return (
    <View style={[s.tRow, ...(alt ? [s.tRowAlt] : [])]}>
      <Text style={[s.tCell, { flex: OV_COLS[0].flex, fontFamily: "Helvetica-Bold", color: C.ink }]}>{m.fullName}</Text>
      <Text style={[s.tCell, { flex: OV_COLS[1].flex }]}>{ROLE_LABEL[m.role]}</Text>
      <Text style={[s.tCell, { flex: OV_COLS[2].flex }]}>{present}</Text>
      <Text style={[s.tCell, { flex: OV_COLS[3].flex }]}>{hours}</Text>
      <Text style={[s.tCell, { flex: OV_COLS[4].flex }]}>{tasks}</Text>
      <Text style={[s.tCell, { flex: OV_COLS[5].flex }]}>{activity}</Text>
    </View>
  );
}

// ─── Per-member detail page ──────────────────────────────────────────────────
function MemberPage({ m, data }: { m: TeamMemberReport; data: ReportData }) {
  const isSe = m.role === "site_engineer";
  return (
    <Page size="A4" style={s.page} wrap>
      <View style={s.memberHeader}>
        <View style={s.memberNameRow}>
          <Text style={s.memberName}>{m.fullName}</Text>
          <Text style={[s.roleChip, ...(isSe ? [s.roleChipSe] : [])]}>{ROLE_LABEL[m.role]}</Text>
          {m.tags.map((t) => (
            <Text key={t} style={s.tagChip}>{TAG_LABEL[t] ?? t}</Text>
          ))}
        </View>
        <Text style={s.memberMeta}>
          {[
            m.phone,
            m.experienceYears != null ? `${m.experienceYears} yrs experience` : null,
            data.monthLabel,
          ].filter(Boolean).join("  ·  ")}
        </Text>
      </View>

      {isSe ? (
        <>
          <View style={s.statBand}>
            <StatCard value={m.siteCheckIns} label="Site Check-Ins" />
            <StatCard value={m.siteWithinGeo} label="Within Geofence" />
            <StatCard value={m.siteCheckIns - m.siteWithinGeo} label="Outside Geofence" />
            <StatCard value={m.siteProjectsVisited} label="Projects Visited" />
          </View>
          <Text style={s.subHeading}>Site Check-In Log</Text>
          {m.checkInRows.length === 0 ? (
            <Text style={s.empty}>No site check-ins recorded this month.</Text>
          ) : (
            <View style={s.table}>
              <View style={s.tHead}>
                <Text style={[s.tHeadCell, { flex: 1.2 }]}>Date</Text>
                <Text style={[s.tHeadCell, { flex: 1 }]}>Time</Text>
                <Text style={[s.tHeadCell, { flex: 2.6 }]}>Project</Text>
                <Text style={[s.tHeadCell, { flex: 1.2 }]}>Geofence</Text>
              </View>
              {m.checkInRows.map((r, i) => (
                <View key={i} style={[s.tRow, ...(i % 2 ? [s.tRowAlt] : [])]}>
                  <Text style={[s.tCell, { flex: 1.2 }]}>{r.date}</Text>
                  <Text style={[s.tCell, { flex: 1 }]}>{r.time}</Text>
                  <Text style={[s.tCell, { flex: 2.6 }]}>{r.project}</Text>
                  <Text style={[s.tCell, { flex: 1.2, color: r.withinGeo ? C.forest : C.rust }]}>
                    {r.withinGeo ? "In zone" : "Out of zone"}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </>
      ) : (
        <>
          <View style={s.statBand}>
            <StatCard value={`${m.daysPresent}d`} label="Days Present" />
            <StatCard value={fmtHours(m.totalMinutes)} label="Total Hours" />
            <StatCard value={fmtHours(m.avgMinutes)} label="Avg / Day" />
            <StatCard value={m.checkInCount} label="Check-Ins" />
          </View>
          <View style={s.statBand}>
            <StatCard value={`${m.dailyDone}/${m.dailyTotal}`} label="Daily Tasks" />
            <StatCard value={`${m.persistentDone}/${m.persistentTotal}`} label="Persistent Tasks" />
            <StatCard value={m.drawings} label="Drawings" />
            <StatCard value={`${m.broadcastsAcked}/${m.broadcastsReceived}`} label="Broadcasts Ack" />
          </View>

          <Text style={s.subHeading}>Performance</Text>
          <View style={s.statBand}>
            <StatCard value={m.drawings} label="Drawings" />
            <StatCard value={m.revisions} label="Revisions" />
            <StatCard value={m.errors} label="Errors" />
            <StatCard value={m.avgDeadlinePct != null ? `${m.avgDeadlinePct}%` : "—"} label="Deadline Met" />
          </View>

          <Text style={s.subHeading}>Attendance Log</Text>
          {m.attendanceRows.length === 0 ? (
            <Text style={s.empty}>No attendance recorded this month.</Text>
          ) : (
            <View style={s.table}>
              <View style={s.tHead}>
                <Text style={[s.tHeadCell, { flex: 1.4 }]}>Date</Text>
                <Text style={[s.tHeadCell, { flex: 1 }]}>Check In</Text>
                <Text style={[s.tHeadCell, { flex: 1 }]}>Check Out</Text>
                <Text style={[s.tHeadCell, { flex: 1 }]}>Worked</Text>
                <Text style={[s.tHeadCell, { flex: 1.1 }]}>Geofence</Text>
              </View>
              {m.attendanceRows.map((r, i) => (
                <View key={i} style={[s.tRow, ...(i % 2 ? [s.tRowAlt] : [])]} wrap={false}>
                  <Text style={[s.tCell, { flex: 1.4 }]}>{r.date}</Text>
                  <Text style={[s.tCell, { flex: 1 }]}>{r.checkIn || "—"}</Text>
                  <Text style={[s.tCell, { flex: 1 }]}>{r.checkOut || "—"}</Text>
                  <Text style={[s.tCell, { flex: 1 }]}>{fmtHours(r.minutes)}</Text>
                  <Text style={[s.tCell, { flex: 1.1, color: r.flagged ? C.rust : C.ink2 }]}>
                    {r.flagged ? "Flagged" : "OK"}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <Text style={s.subHeading}>Tasks</Text>
          {m.taskRows.length === 0 ? (
            <Text style={s.empty}>No tasks recorded this month.</Text>
          ) : (
            <View style={s.table}>
              <View style={s.tHead}>
                <Text style={[s.tHeadCell, { flex: 4 }]}>Task</Text>
                <Text style={[s.tHeadCell, { flex: 1 }]}>Status</Text>
                <Text style={[s.tHeadCell, { flex: 1.4 }]}>When</Text>
              </View>
              {m.taskRows.map((r, i) => (
                <View key={i} style={[s.tRow, ...(i % 2 ? [s.tRowAlt] : [])]} wrap={false}>
                  <Text style={[s.tCell, { flex: 4 }]}>{r.title}</Text>
                  <Text style={[s.tCell, { flex: 1, color: r.done ? C.forest : C.tan }]}>{r.done ? "Done" : "Open"}</Text>
                  <Text style={[s.tCell, { flex: 1.4 }]}>{r.when}</Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}

      <Footer studioName={data.studioName} monthLabel={data.monthLabel} />
    </Page>
  );
}

// ─── Document ────────────────────────────────────────────────────────────────
export function MonthlyReport({ data }: { data: ReportData }) {
  const teamMembers = data.members.filter((m) => m.role === "team_member");
  const siteEngineers = data.members.filter((m) => m.role === "site_engineer");
  const totalMinutes = teamMembers.reduce((sum, m) => sum + m.totalMinutes, 0);
  const totalCheckIns = siteEngineers.reduce((sum, m) => sum + m.siteCheckIns, 0);

  return (
    <Document
      title={`${data.studioName} — ${data.monthLabel} Report`}
      author={data.studioName}
    >
      {/* Cover */}
      <Page size="A4" style={{ padding: 0 }}>
        <View style={s.cover}>
          <View style={s.coverSpine} />

          <View style={s.coverInner}>
            {/* Brand lockup */}
            <View>
              {data.logoSrc ? (
                <Image src={data.logoSrc} style={s.coverLogo} />
              ) : (
                <Text style={[s.coverTitle, { fontSize: 30 }]}>{data.studioName}</Text>
              )}
              <View style={s.coverHairline} />
            </View>

            {/* Editorial title block */}
            <View style={s.coverTitleWrap}>
              <Text style={s.coverEyebrow}>MONTHLY TEAM REPORT</Text>
              <Text style={s.coverTitle}>
                Team &amp;{"\n"}
                <Text style={s.coverTitleEm}>Performance</Text>
              </Text>
              <Text style={s.coverMonth}>{data.monthLabel}</Text>
            </View>
          </View>

          {/* Slate metric band */}
          <View style={s.coverBand} />
          <View style={s.coverBandInner}>
            <Text style={s.coverBandLabel}>AT A GLANCE</Text>
            <View style={s.coverMetaRow}>
              <View style={[s.coverMetaCell, { borderLeftWidth: 0, paddingLeft: 0 }]}>
                <Text style={s.coverMetaLabel}>Team Members</Text>
                <Text style={s.coverMetaValue}>{teamMembers.length}</Text>
              </View>
              <View style={s.coverMetaCell}>
                <Text style={s.coverMetaLabel}>Site Engineers</Text>
                <Text style={s.coverMetaValue}>{siteEngineers.length}</Text>
              </View>
              <View style={s.coverMetaCell}>
                <Text style={s.coverMetaLabel}>Total Hours</Text>
                <Text style={s.coverMetaValue}>{fmtHours(totalMinutes)}</Text>
              </View>
              <View style={s.coverMetaCell}>
                <Text style={s.coverMetaLabel}>Site Check-Ins</Text>
                <Text style={s.coverMetaValue}>{totalCheckIns}</Text>
              </View>
            </View>
            <View style={s.coverGenRow}>
              <Text style={s.coverGenText}>{data.studioName.toUpperCase()}</Text>
              <Text style={s.coverGenText}>GENERATED {data.generatedAt.toUpperCase()}</Text>
            </View>
          </View>
        </View>
      </Page>

      {/* Overview */}
      <Page size="A4" style={s.page} wrap>
        <Text style={s.sectionEyebrow}>OVERVIEW</Text>
        <Text style={s.sectionTitle}>Team at a Glance</Text>
        <Text style={s.sectionSub}>
          {data.monthLabel} · {data.members.length} member{data.members.length !== 1 ? "s" : ""}
        </Text>

        <View style={s.statBand}>
          <StatCard value={teamMembers.length} label="Team Members" />
          <StatCard value={siteEngineers.length} label="Site Engineers" />
          <StatCard value={fmtHours(totalMinutes)} label="Total Hours Worked" />
          <StatCard value={totalCheckIns} label="Site Check-Ins" />
        </View>

        <Text style={s.subHeading}>All Members</Text>
        {data.members.length === 0 ? (
          <Text style={s.empty}>No members to report.</Text>
        ) : (
          <View style={s.table}>
            <View style={s.tHead}>
              {OV_COLS.map((c) => (
                <Text key={c.key} style={[s.tHeadCell, { flex: c.flex }]}>{c.label}</Text>
              ))}
            </View>
            {data.members.map((m, i) => (
              <OverviewRow key={m.id} m={m} alt={i % 2 === 1} />
            ))}
          </View>
        )}

        <Footer studioName={data.studioName} monthLabel={data.monthLabel} />
      </Page>

      {/* Per-member detail pages */}
      {data.members.map((m) => (
        <MemberPage key={m.id} m={m} data={data} />
      ))}
    </Document>
  );
}
