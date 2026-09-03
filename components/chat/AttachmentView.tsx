"use client";

import { useEffect, useState } from "react";

// Shared by the ChatDock drawer and the /bridge page. It lived in ChatDock
// while the dock was the only surface that could send a PDF or DWG; /bridge
// still rendered every attachment through an <img>, so a document sent from
// the dock appeared there as a broken image. One implementation now, so the
// two cannot disagree about how a file is displayed.

export type Attachment = {
  id: string;
  storage_path: string;
  webp_path: string | null;
  mime_type: string | null;
  file_name: string | null;
  byte_size: number | null;
  scan_status: string;
};

/** What the file picker offers. Mirrors the upload route's allowed types. */
export const CHAT_ACCEPT = ".jpg,.jpeg,.png,.pdf,.dwg";

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "heic", "heif"];

/** True when this attachment should render inline as a picture. */
export function isImageAttachment(a: Pick<Attachment, "storage_path">): boolean {
  const ext = (a.storage_path.split(".").pop() ?? "").toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
}

export function fmtSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * An image renders inline; a PDF or DWG renders as a named row you can open.
 *
 * The URL is signed per view and expires, so it is fetched on mount rather
 * than embedded in the message payload.
 */
export default function AttachmentView({
  attachment,
  maxImageWidth,
}: {
  attachment: Attachment;
  maxImageWidth?: number;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  // Decided on the stored extension, for the same reason the signing route
  // does: one of the MIME types browsers send for DWG is `image/vnd.dwg`, so a
  // mime.startsWith("image/") test would try to render a drawing in an <img>.
  const isImage = isImageAttachment(attachment);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/chat/attachments/${attachment.id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("signing failed"))))
      .then((j) => { if (!cancelled) setUrl(j.url); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [attachment.id]);

  const name = attachment.file_name ?? "Attachment";

  if (isImage) {
    if (failed) return <div style={{ fontSize: 11, color: "var(--color-tan)" }}>Image unavailable</div>;
    return url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
        style={{
          maxWidth: maxImageWidth ?? "100%", width: "100%",
          borderRadius: 8, display: "block", marginTop: 6, cursor: "zoom-in",
        }}
      />
    ) : (
      <div style={{ fontSize: 11, color: "var(--color-tan)", marginTop: 6 }}>Loading image…</div>
    );
  }

  const ext = (attachment.storage_path.split(".").pop() ?? "").toLowerCase();
  const badge = (ext || "file").toUpperCase();

  if (failed) return <div style={{ fontSize: 11, color: "var(--color-tan)" }}>File unavailable</div>;

  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => { if (!url) e.preventDefault(); }}
      style={{
        display: "flex", alignItems: "center", gap: 10, marginTop: 6,
        padding: "8px 10px", borderRadius: 8, textDecoration: "none",
        background: "var(--color-paper)", border: "1px solid var(--color-line)",
        color: "inherit", cursor: url ? "pointer" : "default", opacity: url ? 1 : 0.6,
      }}
    >
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
        padding: "3px 6px", borderRadius: 4, flexShrink: 0,
        background: "var(--color-ink)", color: "var(--color-paper-light)",
      }}>{badge}</span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{
          display: "block", fontSize: 12, fontWeight: 500,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{name}</span>
        {attachment.byte_size ? (
          <span style={{ fontSize: 10, color: "var(--color-tan)" }}>{fmtSize(attachment.byte_size)}</span>
        ) : null}
      </span>
    </a>
  );
}
