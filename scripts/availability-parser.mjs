// Parses the free-text DATES column from the submissions spreadsheet into
// structured availability entries: { type: 'date', value } or
// { type: 'range', from, to }. Exported separately from import-submissions.mjs
// so it can be exercised directly (e.g. via --dry-run) without touching the DB.

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PAST_ROLLOVER_DAYS = 60;

function pad(n) {
  return String(n).padStart(2, '0');
}

// The sheet's dates have no year. Assume 2026; if that assumed date would be
// more than PAST_ROLLOVER_DAYS in the past relative to "now", assume 2027 instead
// — handles submissions clearly meaning next year (e.g. "1/5" submitted in November).
function resolveYear(month, day, now) {
  const candidate2026 = new Date(2026, month - 1, day);
  const daysAgo = (now - candidate2026) / MS_PER_DAY;
  return daysAgo > PAST_ROLLOVER_DAYS ? 2027 : 2026;
}

// Parses a single "M/D" or "MM/DD" token (no year) into an ISO date string,
// or null if it isn't a valid calendar date in the resolved year.
export function parseMonthDay(token, now = new Date()) {
  const match = token.trim().match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!match) return null;

  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const year = resolveYear(month, day, now);
  const candidate = new Date(year, month - 1, day);
  if (candidate.getMonth() !== month - 1 || candidate.getDate() !== day) {
    return null; // e.g. 2/30, or 2/29 when the resolved year isn't a leap year
  }

  return `${year}-${pad(month)}-${pad(day)}`;
}

// Parses one comma-separated token into an availability entry.
export function parseToken(token, now = new Date()) {
  const trimmed = token.trim();
  if (!trimmed) return { ok: false, reason: 'empty token' };

  if (trimmed.includes('-')) {
    const parts = trimmed.split('-').map((p) => p.trim());
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return { ok: false, reason: `unexpected range format: "${trimmed}"` };
    }
    const from = parseMonthDay(parts[0], now);
    const to = parseMonthDay(parts[1], now);
    if (!from || !to) {
      return { ok: false, reason: `unparseable range: "${trimmed}"` };
    }
    if (from > to) {
      return { ok: false, reason: `range end before start: "${trimmed}" (resolved ${from} to ${to})` };
    }
    return { ok: true, entry: { type: 'range', from, to } };
  }

  const value = parseMonthDay(trimmed, now);
  if (!value) {
    return { ok: false, reason: `unparseable date: "${trimmed}"` };
  }
  return { ok: true, entry: { type: 'date', value } };
}

// Parses a full DATES cell (comma-separated tokens, possibly mixing single
// dates and ranges) into availability entries. Tokens that don't parse cleanly
// are returned in `issues` rather than silently dropped.
export function parseAvailabilityText(text, now = new Date()) {
  if (!text || !text.trim()) return { entries: [], issues: [] };

  const tokens = text.split(',').map((t) => t.trim()).filter(Boolean);
  const entries = [];
  const issues = [];

  for (const token of tokens) {
    const result = parseToken(token, now);
    if (result.ok) entries.push(result.entry);
    else issues.push(result.reason);
  }

  return { entries, issues };
}
