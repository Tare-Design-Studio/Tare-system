// Client-side image compression for update photos.
//
// Site photos come off phones at 4–12 MB, which is slow on site data and pushes
// against the 10 MB cap in /api/projects/[id]/updates/images. Downscaling and
// re-encoding to WebP in the browser cuts that by roughly an order of magnitude
// while staying legible for drawings and site detail — the point of these
// photos is that someone can read them.

export const MAX_UPDATE_IMAGES = 3;

// 2048px long edge and quality 0.9: high enough that pinch-zooming a drawing or
// a site detail still reads. Lower settings blur exactly the fine lines these
// photos exist to show.
const MAX_EDGE = 2048;
const QUALITY = 0.9;

// Formats the browser can reliably decode into a canvas. HEIC is deliberately
// absent — Safari decodes it, Chrome and Android do not, so those files are
// passed through untouched and the server handles them (it accepts HEIC).
const COMPRESSIBLE = new Set(["image/jpeg", "image/png", "image/webp"]);

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode image"));
    };
    img.src = url;
  });
}

/**
 * Downscale to MAX_EDGE and re-encode as WebP. Returns the ORIGINAL file
 * unchanged when the browser cannot decode the format (HEIC outside Safari),
 * when WebP encoding is unavailable, or when the result would be no smaller —
 * an upload that works beats one that is marginally lighter.
 */
export async function compressToWebp(file: File): Promise<File> {
  if (!COMPRESSIBLE.has(file.type)) return file;

  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch {
    return file;
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", QUALITY)
  );
  if (!blob || blob.size >= file.size) return file;

  const name = file.name.replace(/\.[^.]+$/, "") + ".webp";
  return new File([blob], name, { type: "image/webp", lastModified: Date.now() });
}
