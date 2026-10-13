import { describe, expect, it } from 'vitest';
import {
  buildCSV,
  buildGoogleCalendarUrl,
  escapeCSVCell,
  escapeICSText,
  foldICSLine,
  generateICS,
  parseDateOnly,
  sanitizeFileName,
  toICSUtcStamp,
} from './icsExport';

function utf8Bytes(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** RFC 5545 unfolding: remove every CRLF followed by a single space. */
function unfold(s: string): string {
  return s.replace(/\r\n /g, '');
}

describe('escapeICSText', () => {
  it('escapes backslash, semicolon, comma and line breaks (RFC 5545 §3.3.11)', () => {
    expect(escapeICSText('a,b;c\\d')).toBe('a\\,b\\;c\\\\d');
    expect(escapeICSText('line1\nline2\r\nline3\rline4')).toBe('line1\\nline2\\nline3\\nline4');
  });
});

describe('foldICSLine', () => {
  it('leaves short lines alone', () => {
    expect(foldICSLine('SUMMARY:short')).toBe('SUMMARY:short');
  });

  it('folds at 75 octets and unfolds back to the original', () => {
    const line = 'DESCRIPTION:' + 'x'.repeat(200);
    const folded = foldICSLine(line);
    const physical = folded.split('\r\n');
    expect(physical.length).toBeGreaterThan(1);
    physical.forEach(l => expect(utf8Bytes(l)).toBeLessThanOrEqual(75));
    physical.slice(1).forEach(l => expect(l.startsWith(' ')).toBe(true));
    expect(unfold(folded)).toBe(line);
  });

  it('never splits a multi-byte character (Cyrillic / emoji)', () => {
    const line = 'SUMMARY:' + 'Подготовить отчёт 🎯 '.repeat(10);
    const folded = foldICSLine(line);
    folded.split('\r\n').forEach(l => {
      expect(utf8Bytes(l)).toBeLessThanOrEqual(75);
      expect(l).not.toContain('�');
    });
    expect(unfold(folded)).toBe(line);
  });
});

describe('parseDateOnly', () => {
  it('accepts yyyy-MM-dd and ignores a time suffix', () => {
    expect(parseDateOnly('2026-10-13')).toEqual({ year: 2026, month: 10, day: 13 });
    expect(parseDateOnly('2026-10-13T00:00:00Z')).toEqual({ year: 2026, month: 10, day: 13 });
  });
  it('rejects invalid input', () => {
    expect(parseDateOnly(undefined)).toBeNull();
    expect(parseDateOnly('')).toBeNull();
    expect(parseDateOnly('13.10.2026')).toBeNull();
    expect(parseDateOnly('2026-02-30')).toBeNull();
  });
});

describe('toICSUtcStamp', () => {
  it('formats in UTC with a Z suffix', () => {
    expect(toICSUtcStamp(new Date(Date.UTC(2026, 9, 13, 7, 5, 9)))).toBe('20261013T070509Z');
  });
});

describe('generateICS', () => {
  const now = new Date(Date.UTC(2026, 9, 13, 7, 5, 9));

  it('returns empty string without a valid date', () => {
    expect(generateICS({ uid: 'u', title: 't' }, now)).toBe('');
    expect(generateICS({ uid: 'u', title: 't', date: 'garbage' }, now)).toBe('');
  });

  it('produces an all-day event with an exclusive DTEND on the next day', () => {
    const ics = generateICS({ uid: 'abc', title: 'Отчёт', date: '2026-12-31', allDay: true }, now);
    const lines = ics.split('\r\n');
    expect(lines).toContain('DTSTART;VALUE=DATE:20261231');
    expect(lines).toContain('DTEND;VALUE=DATE:20270101');
    expect(lines).toContain('DTSTAMP:20261013T070509Z');
    expect(lines).toContain('UID:abc@productivityapp');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('produces a timed 30-minute event when allDay is false', () => {
    const lines = generateICS({ uid: 'abc', title: 'x', date: '2026-10-13', allDay: false }, now).split('\r\n');
    expect(lines).toContain('DTSTART:20261013T100000');
    expect(lines).toContain('DTEND:20261013T103000');
  });

  it('escapes and folds user text', () => {
    const description = 'Купить: молоко, хлеб; сыр\nи ещё ' + 'очень длинное описание '.repeat(10);
    const ics = generateICS({ uid: 'abc', title: 'Встреча, важно; срочно', description, date: '2026-10-13' }, now);
    ics.split('\r\n').forEach(l => expect(utf8Bytes(l)).toBeLessThanOrEqual(75));
    const unfolded = unfold(ics).split('\r\n');
    expect(unfolded).toContain('SUMMARY:Встреча\\, важно\\; срочно');
    expect(unfolded).toContain('DESCRIPTION:' + escapeICSText(description));
    // No raw newline from the description leaks into the calendar structure.
    expect(unfolded.filter(l => l.startsWith('BEGIN:') || l.startsWith('END:'))).toHaveLength(4);
  });

  it('falls back to a default title when it is blank', () => {
    expect(unfold(generateICS({ uid: 'a', title: '   ', date: '2026-10-13' }, now))).toContain('SUMMARY:Задача');
  });
});

describe('buildGoogleCalendarUrl', () => {
  it('builds a template URL for a valid date and null otherwise', () => {
    const url = buildGoogleCalendarUrl({ uid: 'a', title: 'A & B', date: '2026-10-13', description: 'x' });
    expect(url).not.toBeNull();
    const parsed = new URL(url as string);
    expect(parsed.origin).toBe('https://calendar.google.com');
    expect(parsed.searchParams.get('text')).toBe('A & B');
    expect(parsed.searchParams.get('dates')).toBe('20261013T100000/20261013T103000');
    expect(parsed.searchParams.get('details')).toBe('x');
    expect(buildGoogleCalendarUrl({ uid: 'a', title: 't' })).toBeNull();
  });
});

describe('sanitizeFileName', () => {
  it('removes path and reserved characters', () => {
    expect(sanitizeFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('abcdefghij');
    expect(sanitizeFileName('  Мой   отчёт ')).toBe('Мой_отчёт');
    expect(sanitizeFileName('..hidden')).toBe('hidden');
    expect(sanitizeFileName('a\u0000b\nc')).toBe('abc');
  });
  it('uses the fallback for empty names and caps the length', () => {
    expect(sanitizeFileName('///', 'task')).toBe('task');
    expect(Array.from(sanitizeFileName('я'.repeat(200)))).toHaveLength(80);
  });
});

describe('CSV', () => {
  it('quotes cells with delimiters, quotes and line breaks (RFC 4180)', () => {
    expect(escapeCSVCell('plain')).toBe('plain');
    expect(escapeCSVCell('a,b')).toBe('"a,b"');
    expect(escapeCSVCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCSVCell('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCSVCell(null)).toBe('');
  });

  it('neutralises spreadsheet formulas (CSV injection)', () => {
    expect(escapeCSVCell('=HYPERLINK("http://evil")')).toBe('"\'=HYPERLINK(""http://evil"")"');
    expect(escapeCSVCell('+1')).toBe("'+1");
    expect(escapeCSVCell('@cmd')).toBe("'@cmd");
  });

  it('keeps one record per row even when cells contain commas and newlines', () => {
    const csv = buildCSV([
      ['Название', 'Описание'],
      ['Задача, первая', 'строка 1\nстрока 2'],
    ]);
    expect(csv).toBe('Название,Описание\r\n"Задача, первая","строка 1\nстрока 2"');
  });
});
