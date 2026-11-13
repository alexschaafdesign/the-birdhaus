import { sql } from '../db';

// Rehearsal settings (one row, seeded by migration 109) and the standing-hours
// template. Validation mirrors the table's check constraints so a bad value
// gets a readable 400 instead of a constraint error.

export type ShowDayRule = 'whole_day' | 'from_time';

export interface RehearsalSettings {
  blockMinutes: number;
  priceCents: number;
  repeatPriceCents: number | null;
  windowMinHours: number;
  windowMaxWeeks: number;
  cancelCutoffHours: number;
  pendingExpiryDays: number;
  showDayRule: ShowDayRule;
  showDayFrom: string; // "HH:MM", Chicago wall time
  icsFeedUrls: string[]; // secret — server only, see maskFeedUrl
  venmoHandle: string;
  squareEnabled: boolean;
  cashEnabled: boolean;
  cashBoxLocation: string;
  address: string;
  arrivalNotes: string;
  cancellationPolicy: string;
  emailApprovedIntro: string;
  emailDeclinedIntro: string;
  emailReminderIntro: string;
  emailLeadAutoreply: string;
  updatedAt: string;
}

// The admin client never sees full feed URLs: they're private calendar links.
export type RehearsalSettingsForAdmin = Omit<RehearsalSettings, 'icsFeedUrls'> & {
  icsFeeds: string[]; // masked, same order as stored
};

// Feed edits from the admin form: keep a stored feed by index, or add a URL.
export type FeedEdit = { keep: number } | { url: string };

export type SettingsInput = Omit<RehearsalSettings, 'icsFeedUrls' | 'updatedAt'> & {
  icsFeeds: FeedEdit[];
};

export interface StandingHour {
  weekday: number; // 0 = Sunday … 6 = Saturday
  startTime: string; // "HH:MM"
}

const MAX_FEEDS = 10;

export async function getRehearsalSettings(): Promise<RehearsalSettings> {
  const [row] = await sql<RehearsalSettings[]>`
    select
      block_minutes as "blockMinutes",
      price_cents as "priceCents",
      repeat_price_cents as "repeatPriceCents",
      window_min_hours as "windowMinHours",
      window_max_weeks as "windowMaxWeeks",
      cancel_cutoff_hours as "cancelCutoffHours",
      pending_expiry_days as "pendingExpiryDays",
      show_day_rule as "showDayRule",
      to_char(show_day_from, 'HH24:MI') as "showDayFrom",
      ics_feed_urls as "icsFeedUrls",
      venmo_handle as "venmoHandle",
      square_enabled as "squareEnabled",
      cash_enabled as "cashEnabled",
      cash_box_location as "cashBoxLocation",
      address,
      arrival_notes as "arrivalNotes",
      cancellation_policy as "cancellationPolicy",
      email_approved_intro as "emailApprovedIntro",
      email_declined_intro as "emailDeclinedIntro",
      email_reminder_intro as "emailReminderIntro",
      email_lead_autoreply as "emailLeadAutoreply",
      updated_at::text as "updatedAt"
    from rehearsal_settings
    where id
  `;
  if (!row) throw new Error('rehearsal_settings row missing (migration 109 seeds it)');
  return row;
}

// "https://p123-caldav.icloud.com/published/2/MTIz…xyz" -> "p123-caldav.icloud.com/…xyz"
export function maskFeedUrl(url: string): string {
  try {
    const u = new URL(url.replace(/^webcal:/i, 'https:'));
    const tail = (u.pathname + u.search).slice(-4);
    return `${u.hostname}/…${tail}`;
  } catch {
    return '…';
  }
}

export function forAdmin(s: RehearsalSettings): RehearsalSettingsForAdmin {
  const { icsFeedUrls, ...rest } = s;
  return { ...rest, icsFeeds: icsFeedUrls.map(maskFeedUrl) };
}

// --- validation --------------------------------------------------------------

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function int(v: unknown, label: string, min: number, max: number): number | string {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
    return `${label} must be a whole number from ${min} to ${max}.`;
  }
  return v;
}

function text(v: unknown, label: string, max: number): string | { error: string } {
  if (typeof v !== 'string') return { error: `${label} is missing.` };
  const t = v.trim();
  if (t.length > max) return { error: `${label} is too long (max ${max} characters).` };
  return t;
}

export function isFeedUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'webcal:';
  } catch {
    return false;
  }
}

// Validates the admin form body and resolves feed edits against the stored
// URLs. Returns the full row to write.
export function validateSettingsInput(
  body: unknown,
  storedFeeds: string[],
): Result<Omit<RehearsalSettings, 'updatedAt'>> {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Expected a JSON object.' };
  const b = body as Record<string, unknown>;

  const ints: Array<[keyof RehearsalSettings, string, number, number]> = [
    ['blockMinutes', 'Block length', 30, 720],
    ['priceCents', 'Price', 0, 1_000_000],
    ['windowMinHours', 'Earliest booking (hours ahead)', 0, 720],
    ['windowMaxWeeks', 'Latest booking (weeks ahead)', 1, 52],
    ['cancelCutoffHours', 'Cancellation cutoff', 0, 720],
    ['pendingExpiryDays', 'Request expiry', 1, 60],
  ];
  const nums: Record<string, number> = {};
  for (const [key, label, min, max] of ints) {
    const r = int(b[key], label, min, max);
    if (typeof r === 'string') return { ok: false, error: r };
    nums[key] = r;
  }

  let repeatPriceCents: number | null = null;
  if (b.repeatPriceCents !== null && b.repeatPriceCents !== undefined) {
    const r = int(b.repeatPriceCents, 'Repeat price', 0, 1_000_000);
    if (typeof r === 'string') return { ok: false, error: r };
    repeatPriceCents = r;
  }

  if (b.showDayRule !== 'whole_day' && b.showDayRule !== 'from_time') {
    return { ok: false, error: 'Show-day rule must be whole_day or from_time.' };
  }
  if (typeof b.showDayFrom !== 'string' || !HHMM.test(b.showDayFrom)) {
    return { ok: false, error: 'Show-day start time must be HH:MM (24-hour).' };
  }

  if (typeof b.venmoHandle !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(b.venmoHandle.trim().replace(/^@/, ''))) {
    return { ok: false, error: 'Venmo handle: letters, numbers, - and _ only.' };
  }

  for (const key of ['squareEnabled', 'cashEnabled'] as const) {
    if (typeof b[key] !== 'boolean') return { ok: false, error: `${key} must be true or false.` };
  }

  const texts: Array<[keyof RehearsalSettings, string, number]> = [
    ['cashBoxLocation', 'Cash box location', 200],
    ['address', 'Address', 500],
    ['arrivalNotes', 'Arrival notes', 5000],
    ['cancellationPolicy', 'Cancellation policy', 5000],
    ['emailApprovedIntro', 'Approval email intro', 5000],
    ['emailDeclinedIntro', 'Decline email intro', 5000],
    ['emailReminderIntro', 'Reminder email intro', 5000],
    ['emailLeadAutoreply', 'Interest auto-reply', 5000],
  ];
  const strs: Record<string, string> = {};
  for (const [key, label, max] of texts) {
    const r = text(b[key], label, max);
    if (typeof r !== 'string') return { ok: false, error: r.error };
    strs[key] = r;
  }
  if (b.cashEnabled === true && !strs.cashBoxLocation) {
    return { ok: false, error: 'Set a cash box location before turning cash on.' };
  }

  if (!Array.isArray(b.icsFeeds)) return { ok: false, error: 'icsFeeds must be a list.' };
  const feeds: string[] = [];
  for (const edit of b.icsFeeds as unknown[]) {
    const e = edit as Record<string, unknown> | null;
    if (e && typeof e.keep === 'number' && Number.isInteger(e.keep) && storedFeeds[e.keep] !== undefined) {
      feeds.push(storedFeeds[e.keep]);
    } else if (e && typeof e.url === 'string' && isFeedUrl(e.url.trim())) {
      feeds.push(e.url.trim());
    } else {
      return { ok: false, error: 'Each calendar feed must be an https:// or webcal:// URL.' };
    }
  }
  if (feeds.length > MAX_FEEDS) return { ok: false, error: `At most ${MAX_FEEDS} calendar feeds.` };

  return {
    ok: true,
    value: {
      blockMinutes: nums.blockMinutes,
      priceCents: nums.priceCents,
      repeatPriceCents,
      windowMinHours: nums.windowMinHours,
      windowMaxWeeks: nums.windowMaxWeeks,
      cancelCutoffHours: nums.cancelCutoffHours,
      pendingExpiryDays: nums.pendingExpiryDays,
      showDayRule: b.showDayRule,
      showDayFrom: b.showDayFrom,
      icsFeedUrls: [...new Set(feeds)],
      venmoHandle: (b.venmoHandle as string).trim().replace(/^@/, ''),
      squareEnabled: b.squareEnabled as boolean,
      cashEnabled: b.cashEnabled as boolean,
      cashBoxLocation: strs.cashBoxLocation,
      address: strs.address,
      arrivalNotes: strs.arrivalNotes,
      cancellationPolicy: strs.cancellationPolicy,
      emailApprovedIntro: strs.emailApprovedIntro,
      emailDeclinedIntro: strs.emailDeclinedIntro,
      emailReminderIntro: strs.emailReminderIntro,
      emailLeadAutoreply: strs.emailLeadAutoreply,
    },
  };
}

export async function updateRehearsalSettings(v: Omit<RehearsalSettings, 'updatedAt'>): Promise<RehearsalSettings> {
  await sql`
    update rehearsal_settings set
      block_minutes = ${v.blockMinutes},
      price_cents = ${v.priceCents},
      repeat_price_cents = ${v.repeatPriceCents},
      window_min_hours = ${v.windowMinHours},
      window_max_weeks = ${v.windowMaxWeeks},
      cancel_cutoff_hours = ${v.cancelCutoffHours},
      pending_expiry_days = ${v.pendingExpiryDays},
      show_day_rule = ${v.showDayRule},
      show_day_from = ${v.showDayFrom}::time,
      ics_feed_urls = ${v.icsFeedUrls}::text[],
      venmo_handle = ${v.venmoHandle},
      square_enabled = ${v.squareEnabled},
      cash_enabled = ${v.cashEnabled},
      cash_box_location = ${v.cashBoxLocation},
      address = ${v.address},
      arrival_notes = ${v.arrivalNotes},
      cancellation_policy = ${v.cancellationPolicy},
      email_approved_intro = ${v.emailApprovedIntro},
      email_declined_intro = ${v.emailDeclinedIntro},
      email_reminder_intro = ${v.emailReminderIntro},
      email_lead_autoreply = ${v.emailLeadAutoreply},
      updated_at = now()
    where id
  `;
  return getRehearsalSettings();
}

// --- standing hours ----------------------------------------------------------

export async function getStandingHours(): Promise<StandingHour[]> {
  return sql<StandingHour[]>`
    select weekday::int as weekday, to_char(start_time, 'HH24:MI') as "startTime"
    from rehearsal_hours
    order by weekday, start_time
  `;
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Validates a full standing-hours list. Blocks on the same weekday may not
// overlap at the current block length (a block may run past midnight; the
// engine handles that, but two starts on one day must be a block apart).
export function validateStandingHours(body: unknown, blockMinutes: number): Result<StandingHour[]> {
  if (!Array.isArray(body)) return { ok: false, error: 'Expected a list of { weekday, startTime }.' };
  if (body.length > 7 * 24) return { ok: false, error: 'Too many standing hours.' };
  const out: StandingHour[] = [];
  const seen = new Set<string>();
  for (const item of body) {
    const r = item as Record<string, unknown> | null;
    const weekday = r?.weekday;
    const startTime = r?.startTime;
    if (typeof weekday !== 'number' || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      return { ok: false, error: 'Weekday must be 0 (Sunday) to 6 (Saturday).' };
    }
    if (typeof startTime !== 'string' || !HHMM.test(startTime)) {
      return { ok: false, error: 'Start times must be HH:MM (24-hour).' };
    }
    const key = `${weekday} ${startTime}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ weekday, startTime });
  }
  out.sort((a, b) => a.weekday - b.weekday || minutesOf(a.startTime) - minutesOf(b.startTime));
  for (let i = 1; i < out.length; i++) {
    const prev = out[i - 1];
    const cur = out[i];
    if (prev.weekday === cur.weekday && minutesOf(cur.startTime) - minutesOf(prev.startTime) < blockMinutes) {
      return {
        ok: false,
        error: `${WEEKDAY_NAMES[cur.weekday]} ${prev.startTime} and ${cur.startTime} overlap at a ${blockMinutes}-minute block.`,
      };
    }
  }
  return { ok: true, value: out };
}

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export async function replaceStandingHours(hours: StandingHour[]): Promise<StandingHour[]> {
  await sql.begin(async (tx) => {
    await tx`delete from rehearsal_hours`;
    if (hours.length > 0) {
      await tx`
        insert into rehearsal_hours ${tx(
          hours.map((h) => ({ weekday: h.weekday, start_time: h.startTime })),
          'weekday',
          'start_time',
        )}
      `;
    }
  });
  return getStandingHours();
}
