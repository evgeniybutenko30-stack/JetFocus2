import { describe, it, expect } from 'vitest';
import {
  MAX_AVATAR_BYTES,
  PROFILE_LIMITS,
  buildPublicProfileUrl,
  imageExtension,
  normalizeDisplayName,
  safeImageSrc,
  validateImageFile,
} from './profile-utils';

describe('normalizeDisplayName', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeDisplayName('  Иван   Петров \n')).toBe('Иван Петров');
  });

  it('strips control characters', () => {
    expect(normalizeDisplayName('An\u0000na\u0007')).toBe('Anna');
  });

  it('caps length without splitting emoji', () => {
    const long = '😀'.repeat(PROFILE_LIMITS.displayName + 10);
    const result = normalizeDisplayName(long);
    expect(Array.from(result)).toHaveLength(PROFILE_LIMITS.displayName);
    expect(result).toBe('😀'.repeat(PROFILE_LIMITS.displayName));
  });

  it('falls back when empty', () => {
    expect(normalizeDisplayName('   ', 'Гость')).toBe('Гость');
    expect(normalizeDisplayName(null)).toBe('Пользователь');
  });
});

describe('validateImageFile', () => {
  it('accepts common raster formats within the limit', () => {
    expect(validateImageFile({ type: 'image/jpeg', size: 1024 }, MAX_AVATAR_BYTES)).toBeNull();
    expect(validateImageFile({ type: 'image/png', size: MAX_AVATAR_BYTES }, MAX_AVATAR_BYTES)).toBeNull();
    expect(validateImageFile({ type: 'image/webp', size: 10 }, MAX_AVATAR_BYTES)).toBeNull();
  });

  it('rejects SVG, HTML and unknown types', () => {
    expect(validateImageFile({ type: 'image/svg+xml', size: 100 }, MAX_AVATAR_BYTES)).toMatch(/JPG/);
    expect(validateImageFile({ type: 'text/html', size: 100 }, MAX_AVATAR_BYTES)).toMatch(/JPG/);
    expect(validateImageFile({ type: '', size: 100 }, MAX_AVATAR_BYTES)).toMatch(/JPG/);
  });

  it('rejects empty and oversized files', () => {
    expect(validateImageFile({ type: 'image/png', size: 0 }, MAX_AVATAR_BYTES)).toMatch(/пустой/);
    expect(validateImageFile({ type: 'image/png', size: MAX_AVATAR_BYTES + 1 }, MAX_AVATAR_BYTES)).toMatch(/5 МБ/);
  });

  it('rejects a missing file', () => {
    expect(validateImageFile(null, MAX_AVATAR_BYTES)).toBeTruthy();
  });
});

describe('imageExtension', () => {
  it('derives the extension from the MIME type, not the file name', () => {
    expect(imageExtension('image/jpeg')).toBe('jpg');
    expect(imageExtension('image/PNG')).toBe('png');
    expect(imageExtension('image/webp')).toBe('webp');
    expect(imageExtension('application/x-php')).toBe('jpg');
  });
});

describe('safeImageSrc', () => {
  it('allows http(s), blob and raster data URLs', () => {
    expect(safeImageSrc('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
    expect(safeImageSrc('http://example.com/a.png')).toBe('http://example.com/a.png');
    expect(safeImageSrc('blob:https://app/123')).toBe('blob:https://app/123');
    expect(safeImageSrc('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
  });

  it('blocks script-capable or unknown schemes', () => {
    expect(safeImageSrc('javascript:alert(1)')).toBeUndefined();
    expect(safeImageSrc(' JaVaScRiPt:alert(1)')).toBeUndefined();
    expect(safeImageSrc('data:image/svg+xml;base64,PHN2Zz4=')).toBeUndefined();
    expect(safeImageSrc('data:text/html,<script>alert(1)</script>')).toBeUndefined();
    expect(safeImageSrc('')).toBeUndefined();
    expect(safeImageSrc(null)).toBeUndefined();
  });
});

describe('buildPublicProfileUrl', () => {
  it('respects the GitHub Pages base path', () => {
    expect(buildPublicProfileUrl('https://user.github.io', '/JetFocus2/', 'abc-123'))
      .toBe('https://user.github.io/JetFocus2/profile/abc-123');
  });

  it('works for root deployments and missing slashes', () => {
    expect(buildPublicProfileUrl('http://localhost:8080/', '/', 'u1')).toBe('http://localhost:8080/profile/u1');
    expect(buildPublicProfileUrl('https://x.dev', 'app', 'u1')).toBe('https://x.dev/app/profile/u1');
  });

  it('encodes the id', () => {
    expect(buildPublicProfileUrl('https://x.dev', '/', 'a/b')).toBe('https://x.dev/profile/a%2Fb');
  });
});
