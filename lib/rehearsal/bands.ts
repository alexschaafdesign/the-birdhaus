import { randomBytes } from 'node:crypto';
import { sql } from '../db';
import { SITE_URL } from '../site';

// Rehearsal bands and their private booking links (/rehearsal/book/<token>).
// No accounts: possession of the live link is the access. One live link per
// band (migration 109); replace = revoke + mint, so the old link stops working.

export interface BandForPage {
  id: number;
  name: string;
  contactName: string;
  defaultGearNeeded: string[];
  defaultGearNotes: string;
}

export interface BandListRow {
  id: number;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  notes: string;
  token: string | null; // live link token, null when revoked
  archived: boolean;
  createdAt: string;
}

// 32 random bytes, base64url: 43 characters.
function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function bookingUrl(token: string): string {
  return `${SITE_URL}/rehearsal/book/${token}`;
}

// The band a live link belongs to, or null (unknown, revoked or archived).
export async function getBandByToken(token: string): Promise<BandForPage | null> {
  if (!/^[A-Za-z0-9_-]{32,}$/.test(token)) return null;
  const [row] = await sql<BandForPage[]>`
    select b.id::int as id, b.name, b.contact_name as "contactName",
           b.default_gear_needed as "defaultGearNeeded", b.default_gear_notes as "defaultGearNotes"
    from rehearsal_band_links l
    join rehearsal_bands b on b.id = l.band_id
    where l.token = ${token} and l.revoked_at is null and b.archived_at is null
  `;
  return row ?? null;
}

export async function listBands(): Promise<BandListRow[]> {
  return sql<BandListRow[]>`
    select b.id::int as id, b.name, b.contact_name as "contactName", b.email, b.phone, b.notes,
           l.token, b.archived_at is not null as archived, b.created_at::text as "createdAt"
    from rehearsal_bands b
    left join rehearsal_band_links l on l.band_id = b.id and l.revoked_at is null
    order by b.archived_at is not null, lower(b.name)
  `;
}

export interface NewBand {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  notes: string;
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function validateNewBand(body: unknown): Result<NewBand> {
  const b = (body ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const v = {
    name: str(b.name),
    contactName: str(b.contactName),
    email: str(b.email),
    phone: str(b.phone),
    notes: str(b.notes),
  };
  if (!v.name || v.name.length > 200) return { ok: false, error: 'Band name is required (max 200).' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email) || v.email.length > 320) {
    return { ok: false, error: 'A valid email is required.' };
  }
  if (v.contactName.length > 200) return { ok: false, error: 'Contact name is too long.' };
  if (v.phone.length > 40) return { ok: false, error: 'Phone is too long.' };
  if (v.notes.length > 10000) return { ok: false, error: 'Notes are too long.' };
  return { ok: true, value: v };
}

// Creates the band and its first link together.
export async function createBand(v: NewBand): Promise<{ id: number; token: string }> {
  return sql.begin(async (tx) => {
    const [band] = await tx<{ id: number }[]>`
      insert into rehearsal_bands (name, contact_name, email, phone, notes)
      values (${v.name}, ${v.contactName}, ${v.email}, ${v.phone}, ${v.notes})
      returning id::int as id
    `;
    const token = newToken();
    await tx`insert into rehearsal_band_links (band_id, token) values (${band.id}, ${token})`;
    return { id: band.id, token };
  });
}

// Revokes the live link (if any) and mints a new one.
export async function replaceBandLink(bandId: number): Promise<string | null> {
  return sql.begin(async (tx) => {
    const [band] = await tx`select id from rehearsal_bands where id = ${bandId} for update`;
    if (!band) return null;
    await tx`update rehearsal_band_links set revoked_at = now() where band_id = ${bandId} and revoked_at is null`;
    const token = newToken();
    await tx`insert into rehearsal_band_links (band_id, token) values (${bandId}, ${token})`;
    return token;
  });
}

// Revokes the live link; the band has no working link until a new one is made.
export async function revokeBandLink(bandId: number): Promise<boolean> {
  const rows = await sql`
    update rehearsal_band_links set revoked_at = now()
    where band_id = ${bandId} and revoked_at is null
    returning id
  `;
  return rows.length > 0;
}
