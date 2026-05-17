"use client";

type MemberAttendance = {
  user_id: string;
  full_name: string;
  days_present: number;
  total_minutes: number | null;
};

type MemberTaskSummary = {
  user_id: string;
  full_name: string;
  total_tasks: number;
  completed_tasks: number;
};

function fmtHours(minutes: number | null) {
  if (!minutes) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function AttendanceOverview({
  attendance,
  taskSummaries,
  monthLabel,
}: {
  attendance: MemberAttendance[];
  taskSummaries: MemberTaskSummary[];
  monthLabel: string;
}) {
  const taskMap = new Map(taskSummaries.map((t) => [t.user_id, t]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {attendance.length === 0 && (
        <div style={{ fontSize: 13, color: "var(--color-tan)" }}>No attendance data for {monthLabel}.</div>
      )}
      {attendance.map((a) => {
        const tasks = taskMap.get(a.user_id);
        const completionPct = tasks && tasks.total_tasks > 0
          ? Math.round((tasks.completed_tasks / tasks.total_tasks) * 100)
          : null;
        return (
          <div key={a.user_id} style={{
            display: "grid",
            gridTemplateColumns: "1fr auto auto auto",
            gap: 16, alignItems: "center",
            padding: "10px 14px", borderRadius: 12,
            background: "var(--color-bg)",
          }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{a.full_name}</div>

            <div style={{ textAlign: "center", minWidth: 64 }}>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-mono)" }}>{a.days_present}</div>
              <div style={{ fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.5 }}>days</div>
            </div>

            <div style={{ textAlign: "center", minWidth: 72 }}>
              <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "var(--font-mono)" }}>{fmtHours(a.total_minutes)}</div>
              <div style={{ fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.5 }}>hours</div>
            </div>

            <div style={{ textAlign: "center", minWidth: 80 }}>
              {tasks ? (
                <>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {tasks.completed_tasks}/{tasks.total_tasks}
                    {completionPct !== null && (
                      <span style={{ fontSize: 11, color: "var(--color-tan)", marginLeft: 4 }}>({completionPct}%)</span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--color-tan)", textTransform: "uppercase", letterSpacing: 0.5 }}>tasks done</div>
                </>
              ) : (
                <div style={{ fontSize: 12, color: "var(--color-tan)" }}>—</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
