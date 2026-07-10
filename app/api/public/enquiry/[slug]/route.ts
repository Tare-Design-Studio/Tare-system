import { NextResponse } from "next/server";
import { z } from "zod";
import { parsePhoneNumber, isValidPhoneNumber } from "libphonenumber-js";
import { v4 as uuidv4 } from "uuid";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ slug: string }> };

const EnquirySchema = z.object({
  name:           z.string().min(1).max(200),
  phone:          z.string().max(30).optional(),
  email:          z.string().email().optional().or(z.literal("")),
  source:         z.enum(["referral","website","whatsapp","instagram","youtube","walk_in","other"]).optional(),
  message:        z.string().max(2000).optional(),
  // Honeypot — must be empty
  website:        z.string().max(0).optional(),
  // Time-to-submit guard (ms since form rendered, sent from client)
  rendered_at_ms: z.number().optional(),
});

function normalizePhone(raw: string): string | null {
  try {
    // Try with IN country code first; if already E.164, parsePhoneNumber handles it
    if (isValidPhoneNumber(raw, "IN")) {
      return parsePhoneNumber(raw, "IN").format("E.164");
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function POST(req: Request, { params }: Params) {
  const { slug } = await params;

  // Pull IP and UA from headers
  const ip   = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
            ?? req.headers.get("x-real-ip")
            ?? null;
  const ua   = req.headers.get("user-agent") ?? null;
  // This route is excluded from middleware (api/public), so generate the
  // audit correlation id here rather than relying on an x-request-id header.
  const reqId = req.headers.get("x-request-id") ?? uuidv4();
  const referer = req.headers.get("referer") ?? null;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const parsed = EnquirySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const { name, phone, email, source, message, website, rendered_at_ms } = parsed.data;

  // Honeypot check — bots fill the hidden field
  if (website) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  // Time-to-submit guard — sub-2s submissions are bot-likely
  if (rendered_at_ms !== undefined && Date.now() - rendered_at_ms < 2000) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const phoneNormalized = phone ? normalizePhone(phone) : null;

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("submit_public_enquiry", {
    p_intake_slug:      slug,
    p_name:             name,
    p_phone_display:    phone ?? "",
    p_email:            email || "",
    p_message:          message ?? "",
    p_referrer_url:     referer ?? "",
    p_ip:               ip ?? null,
    ...(phoneNormalized ? { p_phone_normalized: phoneNormalized } : {}),
    ...(source ? { p_source: source } : {}),
    p_user_agent:       ua ?? "",
    p_request_id:       reqId ?? "",
  });

  if (error) {
    // Return generic error — never leak internal details to public
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  return NextResponse.json({ id: data }, { status: 201 });
}
