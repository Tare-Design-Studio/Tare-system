import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import BroadcastsClient from "./BroadcastsClient";

export default async function BroadcastsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  const isOwner = profile?.role === "owner";

  // Fetch broadcasts: owner sees all they created; team member sees their received ones
  let broadcasts: {
    id: string;
    body: string;
    created_at: string;
    is_acknowledged: boolean;
    author?: string;
    recipient_count?: number;
    ack_count?: number;
  }[] = [];

  if (isOwner) {
    const { data } = await supabase
      .from("owner_broadcasts")
      .select(`
        id, body, created_at,
        users!author_id(full_name),
        owner_broadcast_recipients(is_acknowledged)
      `)
      .order("created_at", { ascending: false })
      .limit(100);

    broadcasts = (data ?? []).map((b) => {
      const recips = (b.owner_broadcast_recipients as { is_acknowledged: boolean }[]) ?? [];
      return {
        id: b.id,
        body: b.body,
        created_at: b.created_at,
        is_acknowledged: recips.every((r) => r.is_acknowledged),
        author: (b.users as { full_name: string } | null)?.full_name ?? "Unknown",
        recipient_count: recips.length,
        ack_count: recips.filter((r) => r.is_acknowledged).length,
      };
    });
  } else {
    // Use service client to bypass RLS chain issue on owner_broadcasts join
    const serviceDb = createServiceClient();
    const { data } = await serviceDb
      .from("owner_broadcast_recipients")
      .select("broadcast_id, is_acknowledged, owner_broadcasts!broadcast_id(id, body, created_at, users!author_id(full_name))")
      .eq("user_id", user.id)
      .order("broadcast_id", { ascending: false })
      .limit(100);

    type OBRow = { body: string; created_at: string; users: { full_name: string } | { full_name: string }[] | null };
    broadcasts = (data ?? []).map((r) => {
      const raw = r.owner_broadcasts;
      const ob: OBRow | null = Array.isArray(raw) ? (raw[0] as OBRow ?? null) : (raw as OBRow | null);
      const senderRaw = ob?.users;
      const author = Array.isArray(senderRaw)
        ? (senderRaw[0]?.full_name ?? "Owner")
        : (senderRaw as { full_name: string } | null)?.full_name ?? "Owner";
      return {
        id: r.broadcast_id as string,
        body: ob?.body ?? "",
        created_at: ob?.created_at ?? "",
        is_acknowledged: r.is_acknowledged ?? false,
        author,
      };
    });
  }

  return <BroadcastsClient broadcasts={broadcasts} isOwner={isOwner} />;
}
