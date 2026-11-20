// "What's left" for a show, worked out ONCE (pure, so client components can
// import it; the DB query that feeds it is in show-health-data.ts). The shows list's issue chips, a
// show's Overview checklist and the dots on its tabs all read this, so they
// can never disagree.

export interface ShowHealthFacts {
  id: number;
  slug: string;
  title: string;
  date: string;
  announced: boolean;
  flyer?: string | null;
  sound_engineer_name?: string | null;
  // Opt-in (119): only flagged shows count a missing engineer as a gap.
  needs_sound_engineer?: boolean;
  rsvp_form?: boolean;
  band_count?: number;
  target_band_count?: number;
  ignored_health_checks?: string[];
  advance_sent?: boolean;
  rsvp_count?: number;
  guest_count?: number;
  sound_paid?: boolean;
  photographer_paid?: boolean;
  photographer_name?: string | null;
  bands_paid_count?: number;
  bands_with_video_count?: number;
  bands_missing_inputs?: number;
  tickets_sold?: number;
  revenue_cents?: number;
  ticket_limit?: number | null;
  credited_extra?: number;
}

export interface Issue {
  key: string;
  label: string;
}

export type IssueCategory = 'statusRsvp' | 'preShow' | 'postShow';

export interface CategorizedIssues {
  statusRsvp: Issue[];
  preShow: Issue[];
  postShow: Issue[];
}

export const UPCOMING_CATEGORIES: IssueCategory[] = ['statusRsvp', 'preShow'];
export const PAST_CATEGORIES: IssueCategory[] = ['postShow'];

// "Close to the date" threshold for the zero-RSVPs check.
const RSVP_WARNING_WINDOW_DAYS = 7;

function daysUntil(today: string, date: string): number {
  const a = new Date(`${today}T00:00:00Z`).getTime();
  const b = new Date(`${date}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

// Every issue that currently applies to a show, grouped into three categories,
// regardless of whether it's been dismissed (see activeIssues). postShow checks
// only make sense once the show has happened (payouts, videos), so callers only
// surface that category for past shows.
export function computeIssues(show: ShowHealthFacts, today: string): CategorizedIssues {
  const statusRsvp: Issue[] = [];
  if (show.rsvp_form === false) statusRsvp.push({ key: 'rsvp-off', label: 'RSVP form disabled' });
  const days = daysUntil(today, show.date);
  if (
    show.announced &&
    show.rsvp_form !== false &&
    days >= 0 &&
    days <= RSVP_WARNING_WINDOW_DAYS &&
    !show.rsvp_count
  ) {
    statusRsvp.push({ key: 'no-rsvps', label: `No RSVPs yet (${days}d out)` });
  }

  const preShow: Issue[] = [];
  if (show.needs_sound_engineer && !show.sound_engineer_name?.trim()) preShow.push({ key: 'sound', label: 'No sound engineer' });
  if (!show.flyer?.trim()) preShow.push({ key: 'flyer', label: 'No flyer' });
  if (!show.advance_sent) preShow.push({ key: 'advance', label: 'Not advanced yet' });
  const bandsNeeded = (show.target_band_count ?? 3) - (show.band_count ?? 0);
  if (bandsNeeded > 0) {
    preShow.push({ key: 'bands', label: `Need ${bandsNeeded} band${bandsNeeded === 1 ? '' : 's'}` });
  }
  // Input lists come in via the advance, so only flag missing ones once it's been
  // sent — before that, "Not advanced yet" already covers the next step.
  const bandsMissingInputs = show.bands_missing_inputs ?? 0;
  if (show.advance_sent && bandsMissingInputs > 0) {
    preShow.push({
      key: 'inputs',
      label: `Input lists needed (${bandsMissingInputs} band${bandsMissingInputs === 1 ? '' : 's'})`,
    });
  }

  const postShow: Issue[] = [];
  const bandCount = show.band_count ?? 0;
  const bandsUnpaid = bandCount - (show.bands_paid_count ?? 0);
  if (bandCount > 0 && bandsUnpaid > 0) {
    postShow.push({ key: 'bands-unpaid', label: `${bandsUnpaid} band${bandsUnpaid === 1 ? '' : 's'} unpaid` });
  }
  if (show.sound_engineer_name?.trim() && !show.sound_paid) {
    postShow.push({ key: 'sound-unpaid', label: 'Sound engineer unpaid' });
  }
  if (show.photographer_name?.trim() && !show.photographer_paid) {
    postShow.push({ key: 'photographer-unpaid', label: 'Photographer unpaid' });
  }
  const bandsMissingVideo = bandCount - (show.bands_with_video_count ?? 0);
  if (bandCount > 0 && bandsMissingVideo > 0) {
    postShow.push({
      key: 'videos-missing',
      label: `Videos missing for ${bandsMissingVideo} band${bandsMissingVideo === 1 ? '' : 's'}`,
    });
  }

  return { statusRsvp, preShow, postShow };
}

// The issues that apply for the given categories, minus any the user dismissed.
export function activeIssues(show: ShowHealthFacts, today: string, categories: IssueCategory[]): Issue[] {
  const ignored = new Set(show.ignored_health_checks ?? []);
  const categorized = computeIssues(show, today);
  return categories.flatMap((c) => categorized[c]).filter((i) => !ignored.has(i.key));
}

// The categories that apply to a show on a given day: upcoming shows get the
// pre-show checks, past shows the post-show ones.
export function categoriesFor(show: Pick<ShowHealthFacts, 'date'>, today: string): IssueCategory[] {
  return show.date < today ? PAST_CATEGORIES : UPCOMING_CATEGORIES;
}

// Which show tab fixes each issue — drives the to-do dot on the tab bar and the
// links on the Overview checklist.
export type ShowTabKey = 'overview' | 'lineup' | 'advance' | 'public' | 'door' | 'settlement';
export const ISSUE_TAB: Record<string, ShowTabKey> = {
  sound: 'lineup',
  bands: 'lineup',
  flyer: 'overview',
  advance: 'advance',
  inputs: 'advance',
  'rsvp-off': 'public',
  'no-rsvps': 'door',
  'bands-unpaid': 'settlement',
  'sound-unpaid': 'settlement',
  'photographer-unpaid': 'settlement',
  'videos-missing': 'public',
};

// Each tab's URL in the show workspace.
const TAB_PATH: Record<ShowTabKey, string> = {
  overview: '',
  lineup: '/lineup',
  advance: '/advance',
  public: '/public',
  door: '/door',
  settlement: '/settlement',
};
export function showTabHref(showId: number, tab: ShowTabKey): string {
  return `/admin/shows/${showId}${TAB_PATH[tab]}`;
}

// Open to-dos per tab, for the dots on the tab bar.
export function todosByTab(show: ShowHealthFacts, today: string): Partial<Record<ShowTabKey, number>> {
  const out: Partial<Record<ShowTabKey, number>> = {};
  for (const i of activeIssues(show, today, categoriesFor(show, today))) {
    const tab = ISSUE_TAB[i.key];
    if (tab) out[tab] = (out[tab] ?? 0) + 1;
  }
  return out;
}
