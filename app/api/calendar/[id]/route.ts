import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

const EVENT_SELECT =
  "id, title, description, starts_at, ends_at, visibility, source_type, source_id, " +
  "project_id, enquiry_id, customer_id, assigned_user_id, created_by";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  starts_at: z.string().datetime({ offset: true }).optional(),
  ends_at: z.string().datetime({ offset: true }).nullable().optional(),
});

// Trigger-generated rows are projections of something else — a reminder event is
// rewritten by sync_reminder_to_calendar() on every enquiry_reminders change, so
// an edit here would be silently reverted the next time the source row moves, and
// a delete would leave the reminder with no calendar entry and no way back.
// The calendar is not the system of record for those; their own screen is.

// PATCH /api/calendar/[id] — edit a manually-created event.
// RLS (calendar_events_update, 026) is the real gate: the row's creator, or a
// holder of calendar:create_for_others. This route adds only the derived-row rule.
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const update: {
    title?: string;
    description?: string | null;
    starts_at?: string;
    ends_at?: string | null;
  } = {};
  if (parsed.data.title !== undefined) update.title = parsed.data.title;
  if (parsed.data.description !== undefined) update.description = parsed.data.description;
  if (parsed.data.starts_at !== undefined) update.starts_at = parsed.data.starts_at;
  if (parsed.data.ends_at !== undefined) update.ends_at = parsed.data.ends_at;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  // One read serves both checks: whether the row is a derived projection, and
  // what its stored times are.
  const { data: existing } = await supabase
    .from("calendar_events")
    .select("id, source_type, starts_at, ends_at")
    .eq("id", id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.source_type) {
    return NextResponse.json(
      { error: "This event is generated from another record and cannot be edited here." },
      { status: 409 }
    );
  }

  // An event that ends before it starts would render as a negative-length block
  // and sort wrongly. Compare against the stored value on whichever side is not
  // moving, so shifting only the start is validated against the existing end.
  const start = update.starts_at ?? existing.starts_at;
  const end = update.ends_at !== undefined ? update.ends_at : existing.ends_at;
  if (start && end && new Date(end) < new Date(start)) {
    return NextResponse.json({ error: "The event cannot end before it starts." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("calendar_events")
    .update(update)
    .eq("id", id)
    .select(EVENT_SELECT)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // RLS filtered the row out — the caller neither owns it nor holds
  // calendar:create_for_others.
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(data);
}

// DELETE /api/calendar/[id] — remove a manually-created event.
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: existing } = await supabase
    .from("calendar_events")
    .select("id, source_type")
    .eq("id", id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.source_type) {
    return NextResponse.json(
      { error: "This event is generated from another record and cannot be deleted here." },
      { status: 409 }
    );
  }

  // .select() so a row filtered out by calendar_events_delete is reported as a
  // 404 rather than a silent 204 that leaves the event on screen after a refresh.
  const { data, error } = await supabase
    .from("calendar_events")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(null, { status: 204 });
}
