import { sql } from './db';

// The editable copy for the Fresh Cuts page. `body` renders as stacked
// paragraphs and `values` as a bulleted list, so both are string arrays — the
// admin editor splits a textarea on blank lines / newlines into these.
export interface FreshCutsContent {
  eyebrow: string;
  title: string;
  tagline: string;
  body: string[];
  valuesHeading: string;
  values: string[];
}

// Fallback copy shipped in code. A page_content row (or individual fields) can
// override any of this; anything the row omits falls back to here.
export const FRESH_CUTS_DEFAULT: FreshCutsContent = {
  eyebrow: 'A Birdhaus Event Series',
  title: 'FRESH CUTS',
  tagline:
    "A recurring night built for first listens — new bands, new songs, and material that hasn't left the practice space until now.",
  body: [
    "Fresh Cuts is a showcase for what's next. Every installment stacks the bill with emerging Twin Cities artists and asks each of them to bring something new — a debut set, an unreleased song, a side project's first-ever show. It's a low-stakes, high-energy room where trying something out in front of a crowd is the whole point.",
    "The series runs a few times a year, and the numbers keep climbing (we're well past v1). Each night we record every set, so a band's first pass at a new tune lives on in the archive.",
  ],
  valuesHeading: 'What it adds to the scene',
  values: [
    "A first stage for newer bands who haven't played out much yet.",
    'Room to road-test unreleased material with a live audience.',
    'Cross-pollination — mixed bills that introduce scenes to each other.',
    'A recorded set for every band, free and forever, in the Birdhaus archive.',
  ],
};

function cleanStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter(Boolean);
  return items.length ? items : undefined;
}

// Merges a stored blob over the code defaults, field by field, ignoring the
// wrong type or empty values so a partial/garbled row can never blank the page.
export function mergeFreshCuts(stored: unknown): FreshCutsContent {
  const row = (stored ?? {}) as Record<string, unknown>;
  const str = (key: keyof FreshCutsContent) =>
    typeof row[key] === 'string' && (row[key] as string).trim() ? (row[key] as string) : undefined;

  return {
    eyebrow: str('eyebrow') ?? FRESH_CUTS_DEFAULT.eyebrow,
    title: str('title') ?? FRESH_CUTS_DEFAULT.title,
    tagline: str('tagline') ?? FRESH_CUTS_DEFAULT.tagline,
    body: cleanStringArray(row.body) ?? FRESH_CUTS_DEFAULT.body,
    valuesHeading: str('valuesHeading') ?? FRESH_CUTS_DEFAULT.valuesHeading,
    values: cleanStringArray(row.values) ?? FRESH_CUTS_DEFAULT.values,
  };
}

export async function getFreshCutsContent(): Promise<FreshCutsContent> {
  const rows = await sql<{ content: unknown }[]>`
    select content from page_content where key = 'fresh-cuts'
  `;
  return mergeFreshCuts(rows[0]?.content);
}

// Persists the Fresh Cuts copy. Runs the input back through mergeFreshCuts so
// what we store is always a complete, validated object.
export async function saveFreshCutsContent(input: unknown): Promise<FreshCutsContent> {
  const content = mergeFreshCuts(input);
  await sql`
    insert into page_content (key, content, updated_at)
    values ('fresh-cuts', ${sql.json(JSON.parse(JSON.stringify(content)))}, now())
    on conflict (key) do update set content = excluded.content, updated_at = now()
  `;
  return content;
}
