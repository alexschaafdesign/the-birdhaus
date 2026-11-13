// Date/time/money wording for rehearsal emails and pages, always in Chicago
// time whatever the server's or viewer's zone. PURE.

const TZ = 'America/Chicago';

function parts(d: Date) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).formatToParts(d);
  const hour = p.find((x) => x.type === 'hour')?.value ?? '';
  const minute = p.find((x) => x.type === 'minute')?.value ?? '00';
  const ampm = (p.find((x) => x.type === 'dayPeriod')?.value ?? '').toLowerCase();
  return { text: minute === '00' ? hour : `${hour}:${minute}`, ampm };
}

// "6–9pm", "10pm–1am"
export function timeRange(start: Date, end: Date): string {
  const s = parts(start);
  const e = parts(end);
  return s.ampm === e.ampm ? `${s.text}–${e.text}${e.ampm}` : `${s.text}${s.ampm}–${e.text}${e.ampm}`;
}

// "Wed 18 Nov"
export function shortDay(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(d);
}

// "Wednesday 18 November"
export function longDay(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(d);
}

// "Wednesday 18 November, 6–9pm"
export function sessionLabel(start: Date, end: Date): string {
  return `${longDay(start)}, ${timeRange(start, end)}`;
}

export function money(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}
