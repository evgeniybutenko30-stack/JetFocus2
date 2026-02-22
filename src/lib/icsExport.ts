/**
 * ICS / Google Calendar export utilities
 */

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function toICSDate(date: Date, allDay = false) {
  if (allDay) {
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  }
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
}

export interface ICSEvent {
  uid: string;
  title: string;
  description?: string;
  date?: string; // yyyy-MM-dd
  allDay?: boolean;
}

export function generateICS(event: ICSEvent): string {
  if (!event.date) return '';

  const [year, month, day] = event.date.split('-').map(Number);
  const startDate = new Date(year, month - 1, day, 10, 0, 0);
  const endDate = new Date(year, month - 1, day, 10, 30, 0);

  const now = new Date();
  const stamp = toICSDate(now) + 'Z';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ProductivityApp//Tasks//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.uid}@productivityapp`,
    `DTSTAMP:${stamp}`,
    event.allDay !== false
      ? `DTSTART;VALUE=DATE:${toICSDate(startDate, true)}`
      : `DTSTART:${toICSDate(startDate)}`,
    event.allDay !== false
      ? `DTEND;VALUE=DATE:${toICSDate(endDate, true)}`
      : `DTEND:${toICSDate(endDate)}`,
    `SUMMARY:${event.title}`,
    ...(event.description ? [`DESCRIPTION:${event.description.replace(/\n/g, '\\n')}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return lines.join('\r\n');
}

export function downloadICS(event: ICSEvent) {
  const content = generateICS(event);
  if (!content) return;
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${event.title.replace(/\s+/g, '_')}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

export function openGoogleCalendar(event: ICSEvent) {
  if (!event.date) return;
  const [year, month, day] = event.date.split('-').map(Number);
  const startDate = new Date(year, month - 1, day, 10, 0);
  const endDate = new Date(year, month - 1, day, 10, 30);

  const fmt = (d: Date) =>
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${fmt(startDate)}/${fmt(endDate)}`,
    ...(event.description ? { details: event.description } : {}),
  });

  window.open(`https://calendar.google.com/calendar/render?${params.toString()}`, '_blank');
}
