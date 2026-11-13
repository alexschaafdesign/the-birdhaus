// The public "I'm interested" form: validation. PURE: tested.
//
// The honeypot is a field humans never see (`website`). A bot that fills it
// gets the normal "thanks" response and nothing is saved or sent.

export type Frequency = 'one_time' | 'weekly' | 'biweekly' | 'now_and_then';

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  one_time: 'One time',
  weekly: 'Weekly',
  biweekly: 'Every other week',
  now_and_then: 'Now and then',
};

export interface LeadInput {
  name: string;
  project: string;
  email: string;
  phone: string;
  people: number | null;
  genreLinks: string;
  frequency: Frequency;
  preferredTimes: string;
  notes: string;
}

type Result<T> = { ok: true; value: T } | { ok: true; spam: true } | { ok: false; error: string; field?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function parseLead(body: unknown): Result<LeadInput> {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.website === 'string' && b.website.trim() !== '') return { ok: true, spam: true };

  const str = (k: string) => (typeof b[k] === 'string' ? (b[k] as string).trim() : '');
  const v: LeadInput = {
    name: str('name'),
    project: str('project'),
    email: str('email'),
    phone: str('phone'),
    people: null,
    genreLinks: str('genreLinks'),
    frequency: 'one_time',
    preferredTimes: str('preferredTimes'),
    notes: str('notes'),
  };
  if (!v.name) return { ok: false, field: 'name', error: 'Tell us your name.' };
  if (v.name.length > 200) return { ok: false, field: 'name', error: 'That name is too long.' };
  if (v.project.length > 200) return { ok: false, field: 'project', error: 'That band name is too long.' };
  if (!EMAIL.test(v.email) || v.email.length > 320) return { ok: false, field: 'email', error: 'Enter an email we can reach you at.' };
  if (v.phone.length > 40) return { ok: false, field: 'phone', error: 'That phone number is too long.' };
  if (b.people !== undefined && b.people !== null && b.people !== '') {
    const n = Number(b.people);
    if (!Number.isInteger(n) || n < 1 || n > 50) return { ok: false, field: 'people', error: 'How many people, 1 to 50?' };
    v.people = n;
  }
  if (typeof b.frequency !== 'string' || !(b.frequency in FREQUENCY_LABEL)) {
    return { ok: false, field: 'frequency', error: 'How often would you want the space?' };
  }
  v.frequency = b.frequency as Frequency;
  if (v.genreLinks.length > 2000) return { ok: false, field: 'genreLinks', error: 'That’s too long (max 2000 characters).' };
  if (v.preferredTimes.length > 2000) return { ok: false, field: 'preferredTimes', error: 'That’s too long (max 2000 characters).' };
  if (v.notes.length > 5000) return { ok: false, field: 'notes', error: 'That’s too long (max 5000 characters).' };
  return { ok: true, value: v };
}
