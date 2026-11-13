import { randomBytes } from 'node:crypto';
import { sql } from '../db';
import { FREQUENCY_LABEL, type Frequency, type LeadInput } from './lead-rules.ts';

// "I'm interested" leads from the public page, and turning one into a band
// with a private booking link (Invite).

export interface Lead extends LeadInput {
  id: number;
  status: 'new' | 'invited' | 'archived';
  bandId: number | null;
  createdAt: Date;
}

export async function createLead(v: LeadInput): Promise<number> {
  const [row] = await sql<{ id: number }[]>`
    insert into rehearsal_leads
      (name, project, email, phone, people, genre_links, frequency, preferred_times, notes)
    values
      (${v.name}, ${v.project}, ${v.email}, ${v.phone}, ${v.people}, ${v.genreLinks}, ${v.frequency},
       ${v.preferredTimes}, ${v.notes})
    returning id::int as id
  `;
  return row.id;
}

function select() {
  return sql`
    select id::int as id, name, project, email, phone, people, genre_links as "genreLinks", frequency,
           preferred_times as "preferredTimes", notes, status, band_id::int as "bandId", created_at as "createdAt"
    from rehearsal_leads
  `;
}

export async function getLead(id: number): Promise<Lead | null> {
  const [row] = await sql<Lead[]>`${select()} where id = ${id}`;
  return row ?? null;
}

export async function listLeads(): Promise<Lead[]> {
  return sql<Lead[]>`
    ${select()}
    order by case status when 'new' then 0 when 'invited' then 1 else 2 end, created_at desc
    limit 300
  `;
}

export function leadSummary(l: Pick<Lead, 'people' | 'genreLinks' | 'frequency' | 'preferredTimes' | 'notes'>): string {
  return [
    l.people ? `${l.people} people` : '',
    `Frequency: ${FREQUENCY_LABEL[l.frequency as Frequency] ?? l.frequency}`,
    l.preferredTimes ? `Prefers: ${l.preferredTimes}` : '',
    l.genreLinks ? `Genre/links: ${l.genreLinks}` : '',
    l.notes ? `Notes: ${l.notes}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

// Creates the band (named after the project, else the person) with its first
// private link, and marks the lead invited. Re-inviting an already-invited
// lead returns its band.
export async function inviteLead(id: number): Promise<{ bandId: number } | null> {
  return sql.begin(async (tx) => {
    const [lead] = await tx<Lead[]>`
      select id::int as id, name, project, email, phone, people, genre_links as "genreLinks", frequency,
             preferred_times as "preferredTimes", notes, status, band_id::int as "bandId", created_at as "createdAt"
      from rehearsal_leads where id = ${id} for update
    `;
    if (!lead) return null;
    if (lead.bandId) return { bandId: lead.bandId };
    const [band] = await tx<{ id: number }[]>`
      insert into rehearsal_bands (name, contact_name, email, phone, notes)
      values (${lead.project || lead.name}, ${lead.name}, ${lead.email}, ${lead.phone},
              ${`From the interest form:\n${leadSummary(lead)}`.slice(0, 10000)})
      returning id::int as id
    `;
    await tx`insert into rehearsal_band_links (band_id, token) values (${band.id}, ${randomBytes(32).toString('base64url')})`;
    await tx`update rehearsal_leads set status = 'invited', band_id = ${band.id}, updated_at = now() where id = ${id}`;
    return { bandId: band.id };
  });
}

export async function setLeadStatus(id: number, status: 'new' | 'archived'): Promise<boolean> {
  const rows = await sql`update rehearsal_leads set status = ${status}, updated_at = now() where id = ${id} and status <> 'invited' returning id`;
  return rows.length > 0;
}
