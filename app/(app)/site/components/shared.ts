export type CheckpointItem = { id: string; is_complete: boolean };

export type Checkpoint = {
  id: string;
  name: string;
  sequence_order: number;
  due_date: string;
  completed_at: string | null;
  checkpoint_items: CheckpointItem[];
};

export type Project = {
  id: string;
  name: string;
  slug: string;
  site_location: string | null;
  current_stage: string;
  status: string;
  site_lat: number | null;
  site_lng: number | null;
  site_geofence_radius_m: number | null;
  project_checkpoints: Checkpoint[];
};

export type Engineer = { id: string; name: string; role: string };

export type MaterialPlan = {
  id: string;
  material_name: string;
  unit: string;
  planned_quantity: number;
  consumed: number;
  pct_used: number;
};

export type Expense = {
  id: string;
  amount: number;
  category: string;
  description: string | null;
  spent_on: string;
  approval_status: string;
};

export type CheckIn = {
  id: string;
  checked_in_at: string;
  within_geofence: boolean;
  notes: string | null;
  engineer?: { full_name: string } | null;
};

export const CATEGORY_LABELS: Record<string, string> = {
  labour: "Labour",
  transport: "Transport",
  materials: "Materials",
  misc: "Misc",
};

export const CATEGORY_TONE: Record<string, "teal" | "indigo" | "forest" | "amber"> = {
  labour: "teal",
  transport: "indigo",
  materials: "forest",
  misc: "amber",
};

export function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function formatTime(d: string) {
  return new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}
