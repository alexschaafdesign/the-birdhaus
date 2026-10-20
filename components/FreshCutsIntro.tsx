'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FreshCutsContent } from '@/lib/page-content';
import { hasFreshCutsCopy, isPlaceholderCopy } from '@/lib/placeholder-copy';

// A draft mirrors FreshCutsContent but keeps the multi-line fields as raw
// textarea strings while editing; we split them back into arrays on save.
type Draft = {
  eyebrow: string;
  title: string;
  tagline: string;
  body: string;
  valuesHeading: string;
  values: string;
};

function toDraft(c: FreshCutsContent): Draft {
  return {
    eyebrow: c.eyebrow,
    title: c.title,
    tagline: c.tagline,
    body: c.body.join('\n\n'),
    valuesHeading: c.valuesHeading,
    values: c.values.join('\n'),
  };
}

function fromDraft(d: Draft): FreshCutsContent {
  return {
    eyebrow: d.eyebrow.trim(),
    title: d.title.trim(),
    tagline: d.tagline.trim(),
    body: d.body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean),
    valuesHeading: d.valuesHeading.trim(),
    values: d.values.split('\n').map((v) => v.trim()).filter(Boolean),
  };
}

const inputClass =
  'w-full border-2 border-ink/40 bg-paper px-3 py-2 text-ink focus:border-ink focus:outline-none';

export default function FreshCutsIntro({
  content,
  isAdmin,
}: {
  content: FreshCutsContent;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(content);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => toDraft(content));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setDraft(toDraft(current));
    setError(null);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const next = fromDraft(draft);
    try {
      const res = await fetch('/api/admin/page-content/fresh-cuts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      const data = (await res.json()) as { content: FreshCutsContent };
      setCurrent(data.content);
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="mb-16 border-2 border-ink bg-paper-deep p-5">
        <div className="mb-4 flex items-center justify-between">
          <span className="bg-ink px-2 py-0.5 font-mono text-xs uppercase tracking-widest text-paper">
            Editing Fresh Cuts copy
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
              className="border-2 border-ink px-3 py-1.5 text-sm hover:bg-ink hover:text-paper disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="bg-ink px-3 py-1.5 text-sm font-bold text-paper hover:bg-ink/85 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        {error && <p className="mb-4 text-sm text-vhs-red">{error}</p>}

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block font-mono text-xs uppercase tracking-widest text-ink/50">Eyebrow</span>
            <input className={inputClass} value={draft.eyebrow} onChange={(e) => setDraft({ ...draft, eyebrow: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1 block font-mono text-xs uppercase tracking-widest text-ink/50">Title</span>
            <input className={inputClass} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1 block font-mono text-xs uppercase tracking-widest text-ink/50">Tagline</span>
            <textarea className={inputClass} rows={2} value={draft.tagline} onChange={(e) => setDraft({ ...draft, tagline: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1 block font-mono text-xs uppercase tracking-widest text-ink/50">
              Body — blank line between paragraphs
            </span>
            <textarea className={inputClass} rows={8} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1 block font-mono text-xs uppercase tracking-widest text-ink/50">Values heading</span>
            <input className={inputClass} value={draft.valuesHeading} onChange={(e) => setDraft({ ...draft, valuesHeading: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1 block font-mono text-xs uppercase tracking-widest text-ink/50">
              Values — one bullet per line
            </span>
            <textarea className={inputClass} rows={5} value={draft.values} onChange={(e) => setDraft({ ...draft, values: e.target.value })} />
          </label>
        </div>
      </div>
    );
  }

  const editButton = isAdmin && (
    <button
      type="button"
      onClick={startEditing}
      className="text-data-overline-11 border-surface-ink hover:bg-surface-ink hover:text-surface-paper focus-visible:outline-accent-red shrink-0 cursor-pointer border px-2 py-1 font-bold tracking-[--spacing(0.625)] uppercase focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      Edit copy
    </button>
  );

  // Until the copy has real words (not blank, not "tbd"), the view gets a plain
  // heading over the filtered list; staff still get the edit button.
  if (!hasFreshCutsCopy(current)) {
    return (
      <section aria-labelledby="fresh-cuts-title" className="flex max-w-3xl items-start justify-between gap-4">
        <h1
          id="fresh-cuts-title"
          className="text-data-overline-11 text-accent-red font-bold leading-[1.3] tracking-[--spacing(0.625)] uppercase"
        >
          Fresh Cuts
        </h1>
        {editButton}
      </section>
    );
  }

  // The Fresh Cuts view of the archive (/archive?series=fc) opens with this:
  // what the series is, from the editable copy. The values list is edit-only
  // for now; the old /fresh-cuts page was its only reader. A placeholder
  // tagline or paragraph is left out.
  return (
    <section aria-labelledby="fresh-cuts-title" className="flex max-w-3xl flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <p className="text-data-overline-11 text-accent-red font-bold leading-[1.3] tracking-[--spacing(0.625)] uppercase">
          {current.eyebrow}
        </p>
        {editButton}
      </div>
      <h1 id="fresh-cuts-title" className="text-display-2 font-bold leading-none uppercase">
        {current.title}
      </h1>
      {!isPlaceholderCopy(current.tagline) && <p className="text-body-1 leading-normal">{current.tagline}</p>}
      {current.body.filter((p) => !isPlaceholderCopy(p)).map((paragraph, i) => (
        <p key={i} className="text-body-3 leading-normal">
          {paragraph}
        </p>
      ))}
    </section>
  );
}
