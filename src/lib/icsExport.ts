/**
 * ICS / Google Calendar / file export utilities
 */

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** Floating (timezone-less) local DATE or DATE-TIME value. */
function toICSDate(date: Date, allDay = false) {
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  if (allDay) return day;
  return `${day}T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/** UTC DATE-TIME with the 'Z' suffix (RFC 5545 requires DTSTAMP in UTC). */
export function toICSUtcStamp(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/** RFC 5545 §3.3.11 TEXT escaping: backslash, semicolon, comma and line breaks. */
export function escapeICSText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

function utf8Length(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0;
  if (cp < 0x80) return 1;
  if (cp < 0x800) return 2;
  if (cp < 0x10000) return 3;
  return 4;
}

/**
 * RFC 5545 §3.1 line folding: content lines longer than 75 octets (UTF-8) are split with
 * CRLF + one space. Splits only between code points, so Cyrillic / emoji stay intact.
 */
export function foldICSLine(line: string): string {
  const parts: string[] = [];
  let current = '';
  let currentBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const bytes = utf8Length(ch);
    if (currentBytes + bytes > limit) {
      parts.push(current);
      current = '';
      currentBytes = 0;
      limit = 74; // continuation lines start with a space, which counts toward the 75
    }
    current += ch;
    currentBytes += bytes;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/** Parses 'yyyy-MM-dd' (an optional time suffix is ignored); null for anything invalid. */
export function parseDateOnly(value: string | null | undefined): { year: number; month: number; day: number } | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return { year, month, day };
}

export interface ICSEvent {
  uid: string;
  title: string;
  description?: string;
  date?: string; // yyyy-MM-dd
  allDay?: boolean;
}

const DEFAULT_TITLE = 'Задача';

export function generateICS(event: ICSEvent, now: Date = new Date()): string {
  const parsed = parseDateOnly(event.date);
  if (!parsed) return '';
  const { year, month, day } = parsed;
  const allDay = event.allDay !== false;

  // All-day: DTEND is exclusive (RFC 5545 §3.6.1), so a one-day event ends the next day.
  const startDate = allDay ? new Date(year, month - 1, day) : new Date(year, month - 1, day, 10, 0, 0);
  const endDate = allDay ? new Date(year, month - 1, day + 1) : new Date(year, month - 1, day, 10, 30, 0);
  const title = event.title.trim() || DEFAULT_TITLE;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ProductivityApp//Tasks//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeICSText(event.uid)}@productivityapp`,
    `DTSTAMP:${toICSUtcStamp(now)}`,
    allDay ? `DTSTART;VALUE=DATE:${toICSDate(startDate, true)}` : `DTSTART:${toICSDate(startDate)}`,
    allDay ? `DTEND;VALUE=DATE:${toICSDate(endDate, true)}` : `DTEND:${toICSDate(endDate)}`,
    `SUMMARY:${escapeICSText(title)}`,
    ...(event.description ? [`DESCRIPTION:${escapeICSText(event.description)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  // Every content line, including the last one, ends with CRLF.
  return lines.map(foldICSLine).join('\r\n') + '\r\n';
}

const FORBIDDEN_FILENAME_CHARS = new Set(['\\', '/', ':', '*', '?', '"', '<', '>', '|']);

/** Safe download file name: no path / reserved characters, no control chars, bounded length. */
export function sanitizeFileName(name: string, fallback = 'file'): string {
  const cleaned = Array.from(name)
    .filter(ch => ch.charCodeAt(0) >= 32 && !FORBIDDEN_FILENAME_CHARS.has(ch))
    .join('')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/^\.+/, '');
  return Array.from(cleaned).slice(0, 80).join('') || fallback;
}

/** Triggers a browser download of a text file. */
export function downloadTextFile(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  // Firefox ignores click() on detached anchors.
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking synchronously can cancel the download in Safari / Firefox.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadICS(event: ICSEvent) {
  const content = generateICS(event);
  if (!content) return;
  downloadTextFile(content, `${sanitizeFileName(event.title, 'task')}.ics`, 'text/calendar;charset=utf-8');
}

export function buildGoogleCalendarUrl(event: ICSEvent): string | null {
  const parsed = parseDateOnly(event.date);
  if (!parsed) return null;
  const { year, month, day } = parsed;
  const startDate = new Date(year, month - 1, day, 10, 0);
  const endDate = new Date(year, month - 1, day, 10, 30);

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title.trim() || DEFAULT_TITLE,
    dates: `${toICSDate(startDate)}/${toICSDate(endDate)}`,
    ...(event.description ? { details: event.description } : {}),
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function openGoogleCalendar(event: ICSEvent) {
  const url = buildGoogleCalendarUrl(event);
  if (!url) return;
  // Detach the opener without a features string (which some browsers treat as "open a popup").
  const win = window.open(url, '_blank');
  if (win) win.opener = null;
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

/**
 * RFC 4180 cell: quoted when it contains a delimiter, quote or line break (quotes doubled).
 * Cells starting with = + - @ (or tab / CR) are prefixed with ' so spreadsheet apps do not
 * evaluate user text as a formula (CSV injection).
 */
export function escapeCSVCell(value: string | null | undefined): string {
  let v = value ?? '';
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  if (/[",;\r\n]/.test(v)) v = `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function buildCSV(rows: (string | null | undefined)[][]): string {
  return rows.map(r => r.map(escapeCSVCell).join(',')).join('\r\n');
}
