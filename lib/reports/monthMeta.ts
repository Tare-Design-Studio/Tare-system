// Monthly report availability — a month's report is downloadable only once that
// month has fully elapsed (i.e. the report covers completed calendar months only).
// "Now" is computed in Asia/Kolkata so the cutover matches the studio's clock.

const TZ = "Asia/Kolkata";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export type ReportMonth = {
  /** YYYY-MM */
  key: string;
  /** e.g. "May 2026" */
  label: string;
};

/** Year/month (1-based) of the current date in IST. */
function istYearMonth(now: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value);
  return { year, month };
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** First day (YYYY-MM-DD) of the given month key. */
export function monthStartDate(key: string): string {
  return `${key}-01`;
}

/** Last day (YYYY-MM-DD) of the given month key. */
export function monthEndDate(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${key}-${String(lastDay).padStart(2, "0")}`;
}

export function monthKeyLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return monthLabel(y, m);
}

/**
 * The most recent N fully-completed months, newest first. The current
 * (in-progress) month is excluded — it only becomes available on the 1st.
 */
export function availableReportMonths(now: Date = new Date(), count = 12): ReportMonth[] {
  const { year, month } = istYearMonth(now);
  const out: ReportMonth[] = [];
  // Start from the previous month (current month not yet complete).
  let y = year;
  let m = month - 1;
  for (let i = 0; i < count; i++) {
    if (m < 1) {
      m += 12;
      y -= 1;
    }
    out.push({ key: monthKey(y, m), label: monthLabel(y, m) });
    m -= 1;
  }
  return out;
}

/** True only if `key` names a month that has fully elapsed in IST. */
export function isMonthAvailable(key: string, now: Date = new Date()): boolean {
  const { year, month } = istYearMonth(now);
  const currentKey = monthKey(year, month);
  // Available iff strictly before the current month.
  return key < currentKey && /^\d{4}-\d{2}$/.test(key);
}
