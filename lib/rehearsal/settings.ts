import { sql } from '../db';
import { R2_PUBLIC_BASE } from '../r2-public';

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
  gearOptions: string[]; // house gear list; the public page reads it too
  publicPageEnabled: boolean; // /rehearsal is a 404 until on
  publicIntro: string;
  houseRules: string;
  photoUrls: string[];
  paymentsEnabled: boolean; // off = no prices, totals, Venmo or paid/outstanding anywhere
  publicFactsLine: string;
  reminderEmailsEnabled: boolean;
  lapsedEmailsEnabled: boolean;
  // Flexible hours (118): edited through Booking hours, not the main form.
  startStepMinutes: number;
  allowedLengths: number[]; // minutes, ascending
  minMinutes: number;
  maxMinutes: number;
  bufferMinutes: number;
  // Rate card (118): display-only, edited through Rates.
  rateHourlyCents: number;
  ratePackages: RatePackage[];
  rateRegularText: string;
  rateFlexibleText: string;
  estimatesEnabled: boolean;
  updatedAt: string;
}

export interface RatePackage {
  minutes: number;
  cents: number;
}

// Fields with their own editors (Booking hours, Rates); the main settings form
// neither sends nor writes them.
export type BookingRules = Pick<
  RehearsalSettings,
  'startStepMinutes' | 'allowedLengths' | 'minMinutes' | 'maxMinutes' | 'bufferMinutes'
>;
export type RateCard = Pick<
  RehearsalSettings,
  'rateHourlyCents' | 'ratePackages' | 'rateRegularText' | 'rateFlexibleText' | 'estimatesEnabled'
>;
type CoreSettings = Omit<RehearsalSettings, 'updatedAt' | keyof BookingRules | keyof RateCard>;

// The admin client never sees full feed URLs: they're private calendar links.
export type RehearsalSettingsForAdmin = Omit<RehearsalSettings, 'icsFeedUrls'> & {
  icsFeeds: string[]; // masked, same order as stored
};

// Feed edits from the admin form: keep a stored feed by index, or add a URL.
export type FeedEdit = { keep: number } | { url: string };

export type SettingsInput = Omit<CoreSettings, 'icsFeedUrls'> & {
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
      gear_options as "gearOptions",
      public_page_enabled as "publicPageEnabled",
      public_intro as "publicIntro",
      house_rules as "houseRules",
      photo_urls as "photoUrls",
      payments_enabled as "paymentsEnabled",
      public_facts_line as "publicFactsLine",
      reminder_emails_enabled as "reminderEmailsEnabled",
      lapsed_emails_enabled as "lapsedEmailsEnabled",
      start_step_minutes as "startStepMinutes",
      allowed_lengths as "allowedLengths",
      min_minutes as "minMinutes",
      max_minutes as "maxMinutes",
      buffer_minutes as "bufferMinutes",
      rate_hourly_cents as "rateHourlyCents",
      rate_packages as "ratePackages",
      rate_regular_text as "rateRegularText",
      rate_flexible_text as "rateFlexibleText",
      estimates_enabled as "estimatesEnabled",
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
): Result<CoreSettings> {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Expected a JSON object.' };
  const b = body as Record<string, unknown>;

  const ints: Array<[keyof CoreSettings, string, number, number]> = [
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

  const texts: Array<[keyof CoreSettings, string, number]> = [
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

  const gear = validateGearOptions(b.gearOptions);
  if (!gear.ok) return gear;

  if (typeof b.publicPageEnabled !== 'boolean') return { ok: false, error: 'publicPageEnabled must be true or false.' };
  const intro = text(b.publicIntro, 'Public page intro', 5000);
  if (typeof intro !== 'string') return { ok: false, error: intro.error };
  const rules = text(b.houseRules, 'House rules', 5000);
  if (typeof rules !== 'string') return { ok: false, error: rules.error };
  for (const k of ['paymentsEnabled', 'reminderEmailsEnabled', 'lapsedEmailsEnabled'] as const) {
    if (typeof b[k] !== 'boolean') return { ok: false, error: `${k} must be true or false.` };
  }
  const facts = text(b.publicFactsLine, 'Facts line', 300);
  if (typeof facts !== 'string') return { ok: false, error: facts.error };
  if (!Array.isArray(b.photoUrls) || b.photoUrls.length > 12) return { ok: false, error: 'Up to 12 photos.' };
  const photoUrls: string[] = [];
  for (const u of b.photoUrls as unknown[]) {
    if (typeof u !== 'string' || !u.startsWith(`${R2_PUBLIC_BASE}/`)) {
      return { ok: false, error: 'Photos must be uploaded here.' };
    }
    if (!photoUrls.includes(u)) photoUrls.push(u);
  }

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
      gearOptions: gear.value,
      publicPageEnabled: b.publicPageEnabled,
      publicIntro: intro,
      houseRules: rules,
      photoUrls,
      paymentsEnabled: b.paymentsEnabled as boolean,
      publicFactsLine: facts,
      reminderEmailsEnabled: b.reminderEmailsEnabled as boolean,
      lapsedEmailsEnabled: b.lapsedEmailsEnabled as boolean,
    },
  };
}

// --- gear --------------------------------------------------------------------

const MAX_GEAR = 30;
const MAX_GEAR_LABEL = 60;
const MAX_GEAR_NOTES = 500;

// The house gear list: trimmed, non-empty, de-duplicated (case-insensitively,
// first spelling wins), order kept.
export function validateGearOptions(raw: unknown): Result<string[]> {
  if (!Array.isArray(raw)) return { ok: false, error: 'Gear list must be a list.' };
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string') return { ok: false, error: 'Gear items must be text.' };
    const label = item.trim().replace(/\s+/g, ' ');
    if (!label) continue;
    if (label.length > MAX_GEAR_LABEL) {
      return { ok: false, error: `Gear item "${label.slice(0, 20)}…" is too long (max ${MAX_GEAR_LABEL}).` };
    }
    const k = label.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(label);
  }
  if (out.length > MAX_GEAR) return { ok: false, error: `At most ${MAX_GEAR} gear items.` };
  return { ok: true, value: out };
}

// A gear pick on a request or an edit. Labels must be on the current house
// list (stored in the list's spelling) or already on the booking being edited
// (`existing`), so an option removed from settings survives on old bookings.
export function validateGearNeeded(
  raw: unknown,
  notesRaw: unknown,
  options: string[],
  existing: string[] = [],
): Result<{ gearNeeded: string[]; gearNotes: string }> {
  const picked = raw === undefined || raw === null ? [] : raw;
  if (!Array.isArray(picked)) return { ok: false, error: 'Gear needed must be a list.' };
  const byKey = new Map([...existing, ...options].map((o) => [o.toLowerCase(), o]));
  const gearNeeded: string[] = [];
  for (const item of picked) {
    const label = typeof item === 'string' ? byKey.get(item.trim().toLowerCase()) : undefined;
    if (!label) return { ok: false, error: 'That gear option isn’t on the list any more — refresh and try again.' };
    if (!gearNeeded.includes(label)) gearNeeded.push(label);
  }
  const notes = notesRaw === undefined || notesRaw === null ? '' : notesRaw;
  if (typeof notes !== 'string') return { ok: false, error: 'Gear notes must be text.' };
  const gearNotes = notes.trim();
  if (gearNotes.length > MAX_GEAR_NOTES) {
    return { ok: false, error: `Gear notes are too long (max ${MAX_GEAR_NOTES} characters).` };
  }
  return { ok: true, value: { gearNeeded, gearNotes } };
}

export async function updateRehearsalSettings(v: CoreSettings): Promise<RehearsalSettings> {
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
      gear_options = ${v.gearOptions}::text[],
      public_page_enabled = ${v.publicPageEnabled},
      public_intro = ${v.publicIntro},
      house_rules = ${v.houseRules},
      photo_urls = ${v.photoUrls}::text[],
      payments_enabled = ${v.paymentsEnabled},
      public_facts_line = ${v.publicFactsLine},
      reminder_emails_enabled = ${v.reminderEmailsEnabled},
      lapsed_emails_enabled = ${v.lapsedEmailsEnabled},
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

// --- flexible hours (118) ----------------------------------------------------

export interface DayWindow {
  weekday: number; // 0 = Sunday … 6 = Saturday
  opens: string; // "HH:MM"
  closes: string; // "HH:MM", "24:00" = end of day
  closed: boolean;
}

export async function getDayWindows(): Promise<DayWindow[]> {
  return sql<DayWindow[]>`
    select weekday::int as weekday,
           to_char(opens, 'HH24:MI') as opens,
           case when closes = '24:00'::time then '24:00' else to_char(closes, 'HH24:MI') end as closes,
           closed
    from rehearsal_day_windows
    order by weekday
  `;
}

const HHMM_24 = /^(([01]\d|2[0-3]):([0-5]\d)|24:00)$/;

export function validateDayWindows(body: unknown): Result<DayWindow[]> {
  if (!Array.isArray(body) || body.length !== 7) return { ok: false, error: 'Expected all seven days.' };
  const out: DayWindow[] = [];
  for (const item of body) {
    const r = item as Record<string, unknown> | null;
    const weekday = r?.weekday;
    if (typeof weekday !== 'number' || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      return { ok: false, error: 'Weekday must be 0 (Sunday) to 6 (Saturday).' };
    }
    if (out.some((w) => w.weekday === weekday)) return { ok: false, error: 'Each day once.' };
    if (typeof r?.opens !== 'string' || !HHMM.test(r.opens)) return { ok: false, error: 'Opening times must be HH:MM.' };
    if (typeof r?.closes !== 'string' || !HHMM_24.test(r.closes)) {
      return { ok: false, error: 'Closing times must be HH:MM (24:00 = midnight).' };
    }
    if (minutesOf(r.closes) <= minutesOf(r.opens)) {
      return { ok: false, error: `${WEEKDAY_NAMES[weekday]}: closing time must be after opening time.` };
    }
    if (typeof r?.closed !== 'boolean') return { ok: false, error: 'closed must be true or false.' };
    out.push({ weekday, opens: r.opens, closes: r.closes, closed: r.closed });
  }
  return { ok: true, value: out.sort((a, b) => a.weekday - b.weekday) };
}

export async function replaceDayWindows(windows: DayWindow[]): Promise<DayWindow[]> {
  await sql.begin(async (tx) => {
    for (const w of windows) {
      await tx`
        update rehearsal_day_windows
        set opens = ${w.opens}::time, closes = ${w.closes}::time, closed = ${w.closed}
        where weekday = ${w.weekday}
      `;
    }
  });
  return getDayWindows();
}

export function validateBookingRules(body: unknown): Result<BookingRules> {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Expected a JSON object.' };
  const b = body as Record<string, unknown>;
  if (![15, 30, 60].includes(b.startStepMinutes as number)) {
    return { ok: false, error: 'Start times every 15, 30 or 60 minutes.' };
  }
  const min = int(b.minMinutes, 'Shortest booking', 30, 720);
  if (typeof min === 'string') return { ok: false, error: min };
  const max = int(b.maxMinutes, 'Longest booking', 30, 720);
  if (typeof max === 'string') return { ok: false, error: max };
  if (max < min) return { ok: false, error: 'Longest booking must be at least the shortest.' };
  const buffer = int(b.bufferMinutes, 'Turnover buffer', 0, 240);
  if (typeof buffer === 'string') return { ok: false, error: buffer };
  if (!Array.isArray(b.allowedLengths) || b.allowedLengths.length === 0 || b.allowedLengths.length > 24) {
    return { ok: false, error: 'Pick at least one length.' };
  }
  const lengths = new Set<number>();
  for (const l of b.allowedLengths as unknown[]) {
    if (typeof l !== 'number' || !Number.isInteger(l) || l % 30 !== 0 || l < min || l > max) {
      return { ok: false, error: 'Lengths must be whole half-hours between the shortest and longest booking.' };
    }
    lengths.add(l);
  }
  return {
    ok: true,
    value: {
      startStepMinutes: b.startStepMinutes as number,
      allowedLengths: [...lengths].sort((x, y) => x - y),
      minMinutes: min,
      maxMinutes: max,
      bufferMinutes: buffer,
    },
  };
}

export async function updateBookingRules(v: BookingRules): Promise<void> {
  await sql`
    update rehearsal_settings set
      start_step_minutes = ${v.startStepMinutes},
      allowed_lengths = ${v.allowedLengths}::int[],
      min_minutes = ${v.minMinutes},
      max_minutes = ${v.maxMinutes},
      buffer_minutes = ${v.bufferMinutes},
      updated_at = now()
    where id
  `;
}

export function validateRateCard(body: unknown): Result<RateCard> {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Expected a JSON object.' };
  const b = body as Record<string, unknown>;
  const hourly = int(b.rateHourlyCents, 'Hourly rate', 0, 100_000);
  if (typeof hourly === 'string') return { ok: false, error: hourly };
  if (!Array.isArray(b.ratePackages) || b.ratePackages.length > 8) return { ok: false, error: 'Up to 8 packages.' };
  const packages: RatePackage[] = [];
  for (const p of b.ratePackages as unknown[]) {
    const r = p as Record<string, unknown> | null;
    const minutes = int(r?.minutes, 'Package length', 30, 720);
    if (typeof minutes === 'string') return { ok: false, error: minutes };
    if (minutes % 30 !== 0) return { ok: false, error: 'Package lengths must be whole half-hours.' };
    const cents = int(r?.cents, 'Package price', 0, 1_000_000);
    if (typeof cents === 'string') return { ok: false, error: cents };
    if (packages.some((x) => x.minutes === minutes)) return { ok: false, error: 'One price per package length.' };
    packages.push({ minutes, cents });
  }
  const regular = text(b.rateRegularText, 'Regular deal', 500);
  if (typeof regular !== 'string') return { ok: false, error: regular.error };
  const flexible = text(b.rateFlexibleText, 'Flexible line', 1000);
  if (typeof flexible !== 'string') return { ok: false, error: flexible.error };
  if (typeof b.estimatesEnabled !== 'boolean') return { ok: false, error: 'estimatesEnabled must be true or false.' };
  return {
    ok: true,
    value: {
      rateHourlyCents: hourly,
      ratePackages: packages.sort((x, y) => x.minutes - y.minutes),
      rateRegularText: regular,
      rateFlexibleText: flexible,
      estimatesEnabled: b.estimatesEnabled,
    },
  };
}

export async function updateRateCard(v: RateCard): Promise<void> {
  await sql`
    update rehearsal_settings set
      rate_hourly_cents = ${v.rateHourlyCents},
      rate_packages = ${sql.json(v.ratePackages as unknown as Parameters<typeof sql.json>[0])},
      rate_regular_text = ${v.rateRegularText},
      rate_flexible_text = ${v.rateFlexibleText},
      estimates_enabled = ${v.estimatesEnabled},
      updated_at = now()
    where id
  `;
}
