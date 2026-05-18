export type CalEvent = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  visibility: string;
  source_type: string | null;
  project_id: string | null;
  enquiry_id: string | null;
  customer_id: string | null;
};

export function eventHref(e: CalEvent): string | null {
  if (e.customer_id) return `/customers/${e.customer_id}`;
  if (e.enquiry_id) return `/enquiries/${e.enquiry_id}`;
  if (e.project_id) return `/projects/${e.project_id}`;
  return null;
}

const TONE_MAP: Record<string, { bg: string; fg: string }> = {
  meeting: { bg: "var(--color-ink)", fg: "#F3EFE7" },
  site: { bg: "var(--color-forest)", fg: "#F3EFE7" },
  reminder: { bg: "#EED0D0", fg: "#7A3535" },
  payment: { bg: "#F5E0B5", fg: "#7A5518" },
  checkpoint: { bg: "#CCE5E0", fg: "#234A42" },
  task: { bg: "#EAE3D3", fg: "var(--color-ink)" },
};

export function eventTone(e: CalEvent) {
  return TONE_MAP[e.source_type ?? ""] ?? TONE_MAP["task"];
}

export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
