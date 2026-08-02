"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// 60-second voice broadcast recorder (client request #6). Recording stops
// itself at the cap so a message stays on point; the server enforces the same
// limit because a browser-side stop is only an affordance.

const MAX_SECONDS = 60;

// The browser picks the first type it actually supports — Safari does not do
// audio/webm, Chrome and Firefox prefer it.
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const t of ["audio/webm", "audio/mp4", "audio/ogg"]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return undefined;
}

export default function VoiceRecorder({ onSent }: { onSent?: () => void }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [duration, setDuration] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  function releaseMic() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  // Never leave the microphone open if the component unmounts mid-recording.
  useEffect(() => releaseMic, []);

  // One object URL per blob, revoked when the blob is replaced. Derived with
  // useMemo rather than an effect: calling createObjectURL inline in JSX would
  // mint a new URL on every render and leak every previous one, and doing it in
  // an effect would set state during the effect for no benefit.
  const previewUrl = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function start() {
    setError(null);
    setBlob(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickMimeType();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];

      rec.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const type = rec.mimeType || mimeType || "audio/webm";
        setBlob(new Blob(chunksRef.current, { type }));
        releaseMic();
      };

      rec.start();
      recorderRef.current = rec;
      setRecording(true);
      setSeconds(0);

      // Tick from a ref rather than inside the setState updater: calling stop()
      // from within an updater would fire during React's render phase.
      let elapsed = 0;
      timerRef.current = setInterval(() => {
        elapsed += 1;
        setSeconds(elapsed);
        if (elapsed >= MAX_SECONDS) stop(elapsed);
      }, 1000);
    } catch {
      setError("Microphone unavailable. Check browser permissions.");
      releaseMic();
    }
  }

  function stop(atSeconds?: number) {
    setDuration(atSeconds ?? seconds);
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    setRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  async function send() {
    if (!blob) return;
    setSending(true);
    setError(null);
    try {
      const form = new FormData();
      const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
      form.append("file", new File([blob], `voice.${ext}`, { type: blob.type }));
      // Floor of 1s: a very short clip still has to report a positive length.
      form.append("duration_s", String(Math.max(1, duration)));
      form.append("body", note.trim());

      const res = await fetch("/api/broadcasts/voice", { method: "POST", body: form });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not send");

      setBlob(null); setSeconds(0); setDuration(0); setNote("");
      onSent?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send");
    } finally {
      setSending(false);
    }
  }

  const remaining = MAX_SECONDS - seconds;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {!recording && !blob && (
          <button
            type="button"
            onClick={start}
            style={{
              padding: "8px 15px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer",
              background: "transparent", color: "var(--color-ink)", border: "1px solid var(--color-line)",
              display: "flex", alignItems: "center", gap: 7,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#B4553F" }} />
            Record voice note
          </button>
        )}

        {recording && (
          <>
            <button
              type="button"
              onClick={() => stop()}
              style={{
                padding: "8px 15px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer",
                background: "#B4553F", color: "#FBF8F2", border: "1px solid #B4553F",
              }}
            >
              Stop
            </button>
            <span style={{ fontSize: 12, color: remaining <= 10 ? "#B4553F" : "var(--color-tan)" }}>
              {seconds}s · {remaining}s left
            </span>
          </>
        )}

        {blob && !recording && (
          <>
            {previewUrl && <audio controls src={previewUrl} style={{ height: 34, maxWidth: "100%" }} />}
            <span style={{ fontSize: 12, color: "var(--color-tan)" }}>{duration}s</span>
            <button
              type="button"
              onClick={() => { setBlob(null); setSeconds(0); setDuration(0); }}
              style={{ background: "none", border: "none", fontSize: 12, color: "var(--color-tan)", textDecoration: "underline", cursor: "pointer" }}
            >
              Discard
            </button>
          </>
        )}
      </div>

      {blob && !recording && (
        <>
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Optional caption"
            style={{
              width: "100%", padding: "9px 11px", fontSize: 13, fontFamily: "inherit",
              color: "var(--color-ink)", background: "var(--color-paper)",
              border: "1px solid var(--color-line)", borderRadius: 10, outline: "none",
            }}
          />
          <button
            type="button"
            onClick={send}
            disabled={sending}
            style={{
              alignSelf: "flex-start", padding: "9px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600,
              background: "var(--color-ink)", color: "#FBF8F2", border: "none",
              cursor: sending ? "default" : "pointer", opacity: sending ? 0.6 : 1,
            }}
          >
            {sending ? "Sending…" : "Send voice broadcast"}
          </button>
        </>
      )}

      <div style={{ fontSize: 11, color: "var(--color-tan)" }}>
        Voice notes are capped at {MAX_SECONDS} seconds.
      </div>

      {error && <div style={{ fontSize: 12, color: "#B4553F" }}>{error}</div>}
    </div>
  );
}
