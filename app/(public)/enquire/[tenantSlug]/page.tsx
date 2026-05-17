"use client";

import { useState, useEffect } from "react";
import { use } from "react";

const SOURCES = [
  { value: "referral",  label: "Referral" },
  { value: "instagram", label: "Instagram" },
  { value: "youtube",   label: "YouTube" },
  { value: "whatsapp",  label: "WhatsApp" },
  { value: "website",   label: "Website" },
  { value: "walk_in",   label: "Walk-in" },
  { value: "other",     label: "Other" },
];

const C: React.CSSProperties = {
  width: "100%",
  padding: "11px 14px",
  borderRadius: 12,
  border: "1px solid var(--line, #E2DBCC)",
  background: "#FBF8F2",
  fontSize: 14,
  color: "#1B1A17",
  fontFamily: "inherit",
  outline: "none",
  marginBottom: 14,
  display: "block",
};

export default function PublicEnquiryPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = use(params);
  const [renderedAt]  = useState(() => Date.now());
  const [name,    setName]    = useState("");
  const [phone,   setPhone]   = useState("");
  const [email,   setEmail]   = useState("");
  const [source,  setSource]  = useState("");
  const [message, setMessage] = useState("");
  const [hp,      setHp]      = useState(""); // honeypot
  const [status,  setStatus]  = useState<"idle"|"loading"|"success"|"error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setStatus("loading");

    const res = await fetch(`/api/public/enquiry/${tenantSlug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        source: source || undefined,
        message: message.trim() || undefined,
        website: hp,           // honeypot
        rendered_at_ms: renderedAt,
      }),
    });

    setStatus(res.ok ? "success" : "error");
  }

  if (status === "success") {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        padding: "40px 20px",
        background: "radial-gradient(900px 600px at 80% -10%, #D8E2DC 0%, transparent 60%), radial-gradient(700px 500px at -10% 110%, #E8DFCC 0%, transparent 55%), #F3EFE7",
        fontFamily: "'Geist', ui-sans-serif, system-ui",
      }}>
        <div style={{ maxWidth: 440, textAlign: "center" }}>
          <div style={{
            width: 56, height: 56, borderRadius: "50%",
            background: "#2D6A4F", margin: "0 auto 20px",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h1 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 34, fontWeight: 400, margin: "0 0 12px", color: "#1B1A17" }}>
            We'll be in touch.
          </h1>
          <p style={{ fontSize: 15, color: "#8A857B", lineHeight: 1.6 }}>
            Thanks for reaching out, {name.split(" ")[0]}. We'll review your enquiry and get back to you within 24 hours.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      padding: "40px 20px",
      background: "radial-gradient(900px 600px at 80% -10%, #D8E2DC 0%, transparent 60%), radial-gradient(700px 500px at -10% 110%, #E8DFCC 0%, transparent 55%), #F3EFE7",
      fontFamily: "'Geist', ui-sans-serif, system-ui",
      WebkitFontSmoothing: "antialiased",
    }}>
      <div style={{ width: "100%", maxWidth: 520 }}>
        {/* Brand */}
        <div style={{ marginBottom: 32, textAlign: "center" }}>
          <h1 style={{
            fontFamily: "'Instrument Serif', serif", fontWeight: 400,
            fontSize: 38, letterSpacing: -0.5, color: "#1B1A17", margin: "0 0 8px",
          }}>
            Get in Touch
          </h1>
          <p style={{ fontSize: 15, color: "#8A857B", margin: 0 }}>
            Tell us about your project. We'll get back to you within 24 hours.
          </p>
        </div>

        <form onSubmit={submit} style={{
          background: "#FBF8F2",
          borderRadius: 22,
          padding: "32px 28px",
          boxShadow: "0 1px 0 #FFF inset, 0 20px 60px -20px rgba(27,26,23,.18)",
          border: "1px solid rgba(27,26,23,.04)",
        }}>
          {/* Honeypot — hidden from real users, bots fill it */}
          <input
            type="text"
            name="website"
            value={hp}
            onChange={(e) => setHp(e.target.value)}
            style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 0, height: 0 }}
            tabIndex={-1}
            autoComplete="off"
          />

          <div style={{ marginBottom: 6, fontSize: 11, color: "#8A857B", textTransform: "uppercase", letterSpacing: 1, fontWeight: 500 }}>
            Your Name *
          </div>
          <input
            style={C}
            type="text"
            placeholder="e.g. Rahul Sharma"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={200}
          />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ marginBottom: 6, fontSize: 11, color: "#8A857B", textTransform: "uppercase", letterSpacing: 1, fontWeight: 500 }}>Phone</div>
              <input style={C} type="tel" placeholder="+91 98XXX XXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <div style={{ marginBottom: 6, fontSize: 11, color: "#8A857B", textTransform: "uppercase", letterSpacing: 1, fontWeight: 500 }}>Email</div>
              <input style={C} type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>

          <div style={{ marginBottom: 6, fontSize: 11, color: "#8A857B", textTransform: "uppercase", letterSpacing: 1, fontWeight: 500 }}>
            How did you find us?
          </div>
          <select style={C} value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Select source (optional)</option>
            {SOURCES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>

          <div style={{ marginBottom: 6, fontSize: 11, color: "#8A857B", textTransform: "uppercase", letterSpacing: 1, fontWeight: 500 }}>
            Tell us about your project
          </div>
          <textarea
            style={{ ...C, resize: "vertical", minHeight: 100 }}
            placeholder="Type, scale, location, budget — anything that helps us understand your vision."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={2000}
          />

          {status === "error" && (
            <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 10, background: "#FBE8E8", color: "#7A3535", fontSize: 13 }}>
              Something went wrong. Please try again.
            </div>
          )}

          <button
            type="submit"
            disabled={status === "loading" || !name.trim()}
            style={{
              width: "100%", padding: "13px", borderRadius: 12,
              background: status === "loading" ? "#8A857B" : "#2D6A4F",
              color: "#FFF", fontSize: 14, fontWeight: 600,
              border: "none", cursor: status === "loading" ? "default" : "pointer",
              letterSpacing: 0.1, transition: "background .15s",
            }}
          >
            {status === "loading" ? "Sending…" : "Send Enquiry"}
          </button>

          <p style={{ textAlign: "center", marginTop: 14, fontSize: 11, color: "#8A857B" }}>
            We respect your privacy. No spam, ever.
          </p>
        </form>
      </div>
    </div>
  );
}
