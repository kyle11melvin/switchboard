import type { Shown } from "./providers";

// Up to five attached photos, each a small JPEG, PNG or WebP data URL.
export function readPhotos(raw: unknown): Shown[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p) => typeof p === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(p) && p.length < 1_500_000)
    .slice(0, 5)
    .map((p, i) => ({ label: `Attached photo ${i + 1}:`, dataUrl: p as string }));
}
