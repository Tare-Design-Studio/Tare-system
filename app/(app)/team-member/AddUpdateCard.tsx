"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { compressToWebp, MAX_UPDATE_IMAGES } from "@/lib/images/compress";

type Project = {
  id: string;
  name: string;
};

type Pending = { file: File; preview: string };

const C: React.CSSProperties = {
  background: "var(--color-paper-light)",
  borderRadius: 22,
  padding: 24,
  boxShadow: "0 1px 0 #FFF inset, 0 2px 0 rgba(30,28,24,.02), 0 20px 40px -30px rgba(30,28,24,.2)",
  border: "1px solid rgba(30,28,24,.04)",
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid var(--color-line)",
  background: "var(--color-paper-light)",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
};

export default function AddUpdateCard({ projects }: { projects: Project[] }) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [body, setBody] = useState("");
  const [updateType, setUpdateType] = useState("note");
  const [images, setImages] = useState<Pending[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pickImages(files: FileList | null) {
    if (!files?.length) return;
    const room = MAX_UPDATE_IMAGES - images.length;
    if (room <= 0) return;

    const picked = Array.from(files).slice(0, room);
    const compressed = await Promise.all(picked.map(compressToWebp));
    setImages((prev) => [
      ...prev,
      ...compressed.map((file) => ({ file, preview: URL.createObjectURL(file) })),
    ]);
    if (files.length > room) {
      setMessage(`Up to ${MAX_UPDATE_IMAGES} images per update.`);
    }
    // Let the same file be picked again after removing it.
    if (fileRef.current) fileRef.current.value = "";
  }

  function removeImage(index: number) {
    setImages((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function submit() {
    // An update may be photos alone — a site picture is often the whole point.
    if (!body.trim() && images.length === 0) return;
    if (!projectId) {
      setMessage("Select a project first.");
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      // Upload first: an image that fails should stop the post rather than leave
      // an update claiming photos it does not have.
      const media_asset_ids: string[] = [];
      for (const img of images) {
        const form = new FormData();
        form.append("file", img.file);
        const up = await fetch(`/api/projects/${projectId}/updates/images`, {
          method: "POST",
          body: form,
        });
        if (!up.ok) {
          const err = await up.json().catch(() => null);
          throw new Error(err?.error ?? "Failed to upload image");
        }
        const { data } = await up.json();
        media_asset_ids.push(data.id);
      }

      const res = await fetch(`/api/projects/${projectId}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          update_type: updateType,
          ...(body.trim() ? { body: body.trim() } : {}),
          ...(media_asset_ids.length ? { media_asset_ids } : {}),
        }),
      });
      if (!res.ok) throw new Error("Failed to post project update");
      setBody("");
      images.forEach((i) => URL.revokeObjectURL(i.preview));
      setImages([]);
      setMessage("Project update posted.");
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not post update.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={C}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 22, fontFamily: "'Instrument Serif', serif", fontWeight: 400, letterSpacing: -0.3 }}>Add Update</div>
          <div style={{ fontSize: 12, color: "var(--color-tan)", marginTop: 6 }}>Share a note with your project team</div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 10 }}>
          <select value={projectId} onChange={e => setProjectId(e.target.value)} style={{ ...input, appearance: "none" }}>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={updateType} onChange={e => setUpdateType(e.target.value)} style={{ ...input, appearance: "none" }}>
            <option value="note">Note</option>
            <option value="progress">Progress</option>
            <option value="remark">Remark</option>
            <option value="drawing">Drawing</option>
            <option value="material">Material</option>
          </select>
        </div>

        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Write a project update..."
          rows={4}
          style={{ ...input, resize: "vertical", lineHeight: 1.45 }}
        />

        {/* Photos — compressed to WebP in the browser before upload */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {images.map((img, i) => (
            <div key={img.preview} style={{ position: "relative", width: 56, height: 56 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.preview}
                alt=""
                style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 10, border: "1px solid var(--color-line)" }}
              />
              <button
                type="button"
                onClick={() => removeImage(i)}
                aria-label="Remove image"
                style={{
                  position: "absolute", top: -6, right: -6, width: 18, height: 18,
                  borderRadius: 9, border: "none", background: "var(--color-ink)",
                  color: "#FBF8F2", fontSize: 11, lineHeight: 1, cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>
          ))}
          {images.length < MAX_UPDATE_IMAGES && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              aria-label="Add image"
              title="Add image"
              style={{
                width: 56, height: 56, borderRadius: 10, cursor: "pointer",
                border: "1px dashed var(--color-line)", background: "transparent",
                color: "var(--color-tan)", fontSize: 20, lineHeight: 1,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              +
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => pickImages(e.target.files)}
            style={{ display: "none" }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span style={{ fontSize: 12, color: message?.includes("Failed") || message?.includes("Could not") ? "var(--color-rust)" : "var(--color-tan)" }}>
            {message ?? "Appears in the project team stream."}
          </span>
          <button
            type="button"
            onClick={submit}
            disabled={saving || (!body.trim() && images.length === 0) || !projectId}
            style={{
              padding: "9px 16px",
              borderRadius: 10,
              border: "none",
              background: saving || (!body.trim() && images.length === 0) ? "var(--color-line)" : "var(--color-ink)",
              color: "#FBF8F2",
              fontSize: 12,
              fontWeight: 700,
              cursor: saving || (!body.trim() && images.length === 0) ? "default" : "pointer",
            }}
          >
            {saving ? "Posting..." : "Post Update"}
          </button>
        </div>
      </div>
    </div>
  );
}
