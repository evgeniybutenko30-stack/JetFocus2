/** Limits for user-editable public profile fields. */
export const PROFILE_LIMITS = {
  displayName: 40,
  bio: 300,
  city: 60,
  expertise: 200,
  canHelp: 200,
  telegram: 64,
  post: 600,
} as const;

/** Max upload sizes (bytes). */
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
export const MAX_POST_IMAGE_BYTES = 5 * 1024 * 1024;

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** Accept attribute for <input type="file"> matching the allowed upload formats. */
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';

/**
 * Trims, collapses whitespace, strips control characters and caps the length
 * (by code points, so emoji are never split). Falls back when the result is empty.
 */
export function normalizeDisplayName(raw: string | null | undefined, fallback = 'Пользователь'): string {
  const cleaned = Array.from(raw ?? '')
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code >= 0x20 && code !== 0x7f;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  const capped = Array.from(cleaned).slice(0, PROFILE_LIMITS.displayName).join('').trim();
  return capped || fallback;
}

/**
 * Validates a user-selected image. Returns a Russian error message, or null
 * when the file is acceptable. Only formats every browser can render are
 * allowed (no SVG: it can carry scripts and is served from a public bucket).
 */
export function validateImageFile(file: { type: string; size: number } | null | undefined, maxBytes: number): string | null {
  if (!file) return 'Файл не выбран';
  if (!IMAGE_EXTENSIONS[file.type?.toLowerCase()]) return 'Поддерживаются только JPG, PNG, WEBP и GIF';
  if (!Number.isFinite(file.size) || file.size <= 0) return 'Файл пустой или повреждён';
  if (file.size > maxBytes) return `Файл слишком большой (максимум ${Math.round(maxBytes / (1024 * 1024))} МБ)`;
  return null;
}

/** File extension derived from the MIME type (never from the user-controlled file name). */
export function imageExtension(mimeType: string): string {
  return IMAGE_EXTENSIONS[mimeType?.toLowerCase()] ?? 'jpg';
}

/**
 * Returns the URL if it is safe to use as an <img src> (http(s), blob: or an
 * inline raster data URL); otherwise undefined.
 */
export function safeImageSrc(url: string | null | undefined): string | undefined {
  if (!url || typeof url !== 'string') return undefined;
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^blob:/i.test(trimmed)) return trimmed;
  if (/^data:image\/(png|jpe?g|gif|webp);/i.test(trimmed)) return trimmed;
  return undefined;
}

/** Absolute link to a user's public profile inside this SPA (respects the deploy base path). */
export function buildPublicProfileUrl(origin: string, baseUrl: string, userId: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const normalizedBase = base.startsWith('/') ? base : `/${base}`;
  return `${origin.replace(/\/$/, '')}${normalizedBase}profile/${encodeURIComponent(userId)}`;
}
