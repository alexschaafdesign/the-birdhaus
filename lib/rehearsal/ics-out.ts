// Write an iCalendar file: the .ics attached to a band's confirmation, and
// (Phase 5) Alex's feed of confirmed rehearsals. PURE: tested. RFC 5545:
// CRLF line endings, text escaping, lines folded at 75 octets, UTC times.

export interface IcsEvent {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  location?: string;
  description?: string;
  url?: string;
  status?: 'CONFIRMED' | 'CANCELLED';
}

function utc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function escapeIcsText(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// Fold to 75 octets per line (continuation lines start with a space), never
// splitting a multi-byte character.
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  let curLen = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // continuation lines carry a leading space
    if (curLen + n > limit) {
      out.push(cur);
      cur = '';
      curLen = 0;
    }
    cur += ch;
    curLen += n;
  }
  out.push(cur);
  return out.map((l, i) => (i === 0 ? l : ` ${l}`)).join('\r\n');
}

export function buildIcs(events: IcsEvent[], opts: { name?: string; now?: Date; method?: 'PUBLISH' } = {}): string {
  const stamp = utc(opts.now ?? new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//the BIRDHAUS//Rehearsal//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${opts.method ?? 'PUBLISH'}`,
    ...(opts.name ? [`X-WR-CALNAME:${escapeIcsText(opts.name)}`] : []),
  ];
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${utc(e.start)}`,
      `DTEND:${utc(e.end)}`,
      `SUMMARY:${escapeIcsText(e.summary)}`,
      ...(e.location ? [`LOCATION:${escapeIcsText(e.location)}`] : []),
      ...(e.description ? [`DESCRIPTION:${escapeIcsText(e.description)}`] : []),
      ...(e.url ? [`URL:${e.url}`] : []),
      `STATUS:${e.status ?? 'CONFIRMED'}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
