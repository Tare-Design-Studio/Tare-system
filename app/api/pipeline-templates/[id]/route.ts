import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: canCreate } = await supabase.rpc("has_capability", { p_capability: "project:create" });
  if (!canCreate) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await supabase.from("checkpoint_templates").delete().eq("id", id).eq("is_system", false);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
