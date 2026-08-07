// The tenant works in IST; the server may not (Vercel runs UTC). Deriving the
// attendance work_date with `toISOString().slice(0, 10)` takes the UTC date,
// which is still *yesterday* until 05:30 IST. That mismatch is what left rows
// stuck open: a check-out looked up a work_date that did not exist, the API
// answered "No check-in found for today", and last_check_in_at was never
// cleared — so the board kept reporting the member as present.
//
// Every place that turns "now" into an attendance work_date must go through
// here, so the API, the presence board and the dashboard always agree on which
// day it is.
export const TENANT_TZ = "Asia/Kolkata";

// en-CA renders as YYYY-MM-DD, which is the wire format for a Postgres `date`.
export function localDate(d: Date = new Date(), tz: string = TENANT_TZ): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
