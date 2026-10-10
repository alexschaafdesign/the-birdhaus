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
  'w-full rounded border border-[#E8E0D0]/30 bg-[#E8E0D0]/5 px-3 py-2 text-[#E8E0D0] focus:border-[#E8E0D0]/60 focus:outline-none';

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
      <div className="mb-16 rounded-lg border border-yellow-500/40 bg-yellow-500/5 p-5">
        <div className="mb-4 flex items-center justify-between">
          <span className="font-mono text-xs uppercase tracking-widest text-yellow-500/80">
            Editing Fresh Cuts copy
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
              className="rounded border border-[#E8E0D0]/30 px-3 py-1.5 text-sm hover:border-[#E8E0D0]/60 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded bg-yellow-500 px-3 py-1.5 text-sm font-bold text-black hover:bg-yellow-400 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block font-mono text-xs uppercase tracking-widest text-[#E8E0D0]/50">Eyebrow</span>
            <input className={inputClass} value={draft.eyebrow} onChange={(e) => setDraft({ ...draft, eyebrow: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1 block font-mono text-xs uppercase tracking-widest text-[#E8E0D0]/50">Title</span>
            <input className={inputClass} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1 block font-mono text-xs uppercase tracking-widest text-[#E8E0D0]/50">Tagline</span>
            <textarea className={inputClass} rows={2} value={draft.tagline} onChange={(e) => setDraft({ ...draft, tagline: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1 block font-mono text-xs uppercase tracking-widest text-[#E8E0D0]/50">
              Body — blank line between paragraphs
            </span>
            <textarea className={inputClass} rows={8} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1 block font-mono text-xs uppercase tracking-widest text-[#E8E0D0]/50">Values heading</span>
            <input className={inputClass} value={draft.valuesHeading} onChange={(e) => setDraft({ ...draft, valuesHeading: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1 block font-mono text-xs uppercase tracking-widest text-[#E8E0D0]/50">
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
          className="absolute right-0 top-0 z-10 rounded border border-yellow-500/50 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-yellow-400 hover:border-yellow-400 hover:bg-yellow-500/10"
        >
          Edit copy
        </button>
      )}

      {/* Hero / program description */}
      <header className="mb-16">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-yellow-500/70 mb-4">
          {current.eyebrow}
        </p>
        <h1 className="text-5xl md:text-6xl font-bold mb-6">{current.title}</h1>
        <p className="text-xl md:text-2xl text-[#E8E0D0]/80 leading-relaxed max-w-2xl">
          {current.tagline}
        </p>
      </header>

      {/* What it is */}
      <section className="mb-16 grid gap-10 md:grid-cols-2">
        <div className="space-y-4 text-[#E8E0D0]/70 leading-relaxed">
          {current.body.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>

        <div>
          <h3 className="font-mono text-xs uppercase tracking-widest text-yellow-500/70 mb-2">
            {current.valuesHeading}
          </h3>
          <ul className="space-y-3 text-[#E8E0D0]/70 leading-relaxed">
            {current.values.map((value, i) => (
              <li key={i} className="flex gap-3">
                <span className="text-yellow-500/70">→</span>
                <span>{value}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
