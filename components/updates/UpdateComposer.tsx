"use client";

import { useRef, useState } from "react";

type PendingImage = {
  localId: string;
  previewUrl: string;
  assetId: string | null;
  uploading: boolean;
  error: string | null;
};

const UPDATE_TYPES = [
  { id: "note", label: "Note" },
  { id: "progress", label: "Progress" },
  { id: "remark", label: "Remark" },
  { id: "image", label: "Photos" },
] as const;

interface UpdateComposerProps {
  projectId: string;
  /** Called after a successful post so the parent can refresh its feed. */
  onPosted?: () => void;
  /** Compact layout for the mobile site-engineer dashboard. */
  compact?: boolean;
}

export function UpdateComposer({ projectId, onPosted, compact = false }: UpdateComposerProps) {
  const [updateType, setUpdateType] = useState<string>("note");
  const [body, setBody] = useState("");
  const [images, setImages] = useState<PendingImage[]>([]);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadFile = async (file: File) => {
    const localId = crypto.randomUUID();
    const previewUrl = URL.createObjectURL(file);
    setImages((prev) => [...prev, { localId, previewUrl, assetId: null, uploading: true, error: null }]);

    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`/api/projects/${projectId}/updates/images`, { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      setImages((prev) =>
        prev.map((img) =>
          img.localId === localId ? { ...img, assetId: json.data.id, uploading: false } : img
        )
      );
    } catch (e: unknown) {
      setImages((prev) =>
        prev.map((img) =>
          img.localId === localId
            ? { ...img, uploading: false, error: e instanceof Error ? e.message : "Upload failed" }
            : img
        )
      );
    }
  };

  const onFiles = (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files).slice(0, 10 - images.length)) {
      uploadFile(file);
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const removeImage = (localId: string) => {
    setImages((prev) => prev.filter((img) => img.localId !== localId));
  };

  const post = async () => {
    const assetIds = images.filter((i) => i.assetId).map((i) => i.assetId as string);
    if (images.some((i) => i.uploading)) {
      setError("Wait for photos to finish uploading.");
      return;
    }
    if (!body.trim() && assetIds.length === 0) {
      setError(
        images.some((i) => i.error)
          ? "Photo upload failed — remove the failed photo or retry, or add a note."
          : "Add a note or at least one photo."
      );
      return;
    }
    setPosting(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          update_type: assetIds.length > 0 && !body.trim() ? "image" : updateType,
          body: body.trim() || undefined,
          media_asset_ids: assetIds.length > 0 ? assetIds : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to post update");
      setBody("");
      setImages([]);
      setUpdateType("note");
      onPosted?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error posting update");
    } finally {
      setPosting(false);
    }
  };

  const thumb = compact ? 56 : 64;

  return (
    <div
      // Grammarly-style extensions inject a sibling node next to the textarea,
      // which mismatches this parent's children — suppress the benign warning.
      suppressHydrationWarning
      style={{
        padding: compact ? 14 : 18,
        borderRadius: 16,
        background: "var(--color-paper-light)",
        boxShadow: "0 1px 0 #FFF inset",
        border: "1px solid var(--color-line)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {compact ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontSize: 15, fontFamily: "var(--font-serif)", fontWeight: 400, letterSpacing: -0.2 }}>
            Add Update
          </div>
          <select
            value={updateType}
            onChange={(e) => setUpdateType(e.target.value)}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid var(--color-line)",
              background: "var(--bg-2)",
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "inherit",
              color: "var(--color-ink)",
              outline: "none",
              cursor: "pointer",
            }}
          >
            {UPDATE_TYPES.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {UPDATE_TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => setUpdateType(t.id)}
              style={{
                padding: "5px 12px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                border: "1px solid var(--color-line)",
                background: updateType === t.id ? "var(--color-forest)" : "var(--bg-2)",
                color: updateType === t.id ? "#FFF" : "var(--color-ink)",
                cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write an update…"
        rows={compact ? 2 : 3}
        maxLength={2000}
        // Browser extensions (Grammarly etc.) inject attributes into textareas
        // between SSR and hydration — suppress the resulting benign mismatch.
        suppressHydrationWarning
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid var(--color-line)",
          background: "var(--bg-2)",
          fontSize: 13,
          fontFamily: "inherit",
          outline: "none",
          resize: "vertical",
        }}
      />

      {images.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {images.map((img) => (
            <div key={img.localId} style={{ position: "relative", width: thumb, height: thumb }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.previewUrl}
                alt="upload preview"
                style={{
                  width: thumb,
                  height: thumb,
                  objectFit: "cover",
                  borderRadius: 10,
                  opacity: img.uploading || img.error ? 0.5 : 1,
                  border: img.error ? "1px solid var(--color-rust)" : "1px solid var(--color-line)",
                }}
              />
              {img.uploading && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    color: "var(--color-ink)",
                  }}
                >
                  …
                </div>
              )}
              {img.error && (
                <div
                  title={img.error}
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 9,
                    fontWeight: 700,
                    textAlign: "center",
                    padding: 4,
                    color: "var(--color-rust)",
                    background: "rgba(255,255,255,.6)",
                    borderRadius: 10,
                  }}
                >
                  Failed
                </div>
              )}
              <button
                onClick={() => removeImage(img.localId)}
                aria-label="Remove image"
                style={{
                  position: "absolute",
                  top: -6,
                  right: -6,
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "var(--color-ink)",
                  color: "#FFF",
                  fontSize: 11,
                  lineHeight: 1,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <div style={{ color: "var(--color-rust)", fontSize: 12 }}>{error}</div>}

      <div style={{ display: "flex", gap: 8 }}>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          multiple
          onChange={(e) => onFiles(e.target.files)}
          style={{ display: "none" }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={images.length >= 10}
          style={{
            padding: "9px 14px",
            borderRadius: 10,
            border: "1px solid var(--color-line)",
            background: "var(--bg-2)",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--color-ink)",
            cursor: images.length >= 10 ? "default" : "pointer",
            opacity: images.length >= 10 ? 0.5 : 1,
          }}
        >
          + Photo
        </button>
        <button
          onClick={post}
          disabled={posting}
          style={{
            flex: 1,
            padding: "9px 14px",
            borderRadius: 10,
            background: "var(--color-ink)",
            color: "#F3EFE7",
            fontSize: 13,
            fontWeight: 700,
            border: "none",
            cursor: "pointer",
            opacity: posting ? 0.6 : 1,
          }}
        >
          {posting ? "Posting…" : "Post Update"}
        </button>
      </div>
    </div>
  );
}
