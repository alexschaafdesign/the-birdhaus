'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FreshCutsContent } from '@/lib/page-content';

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

  return (
    <div className="relative">
      {isAdmin && (
        <button
          type="button"
          onClick={startEditing}
          className="absolute right-0 top-0 z-10 border-2 border-ink px-3 py-1.5 text-xs font-bold uppercase tracking-widest hover:bg-ink hover:text-paper"
        >
          Edit copy
        </button>
      )}

      {/* Hero / program description */}
      <header className="mb-16">
        <div className="vhs-stripes h-1.5 w-24 mb-3" aria-hidden="true" />
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-vhs-red mb-4">
          {current.eyebrow}
        </p>
        <h1 className="text-5xl md:text-6xl font-bold mb-6 uppercase tracking-tight">{current.title}</h1>
        <p className="text-lg md:text-xl text-ink/80 leading-relaxed max-w-2xl">
          {current.tagline}
        </p>
      </header>

      {/* What it is */}
      <section className="mb-16 grid gap-10 md:grid-cols-2">
        <div className="space-y-4 text-ink/70 leading-relaxed">
          {current.body.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>

        <div>
          <h3 className="font-mono text-xs uppercase tracking-widest text-vhs-red mb-2">
            {current.valuesHeading}
          </h3>
          <ul className="space-y-3 text-ink/70 leading-relaxed">
            {current.values.map((value, i) => (
              <li key={i} className="flex gap-3">
                <span className="text-vhs-red">→</span>
                <span>{value}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
