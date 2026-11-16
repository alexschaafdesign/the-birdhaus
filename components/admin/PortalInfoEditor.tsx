'use client';

import { useState } from 'react';
import { FORM } from '@/components/night/form';
import { buttonClassName } from './ui';

interface PortalInfo {
  body: string;
  updatedAt: string;
}

// Editor for the band /hub portal's venue/logistics rundown (Markdown). Mirrors
// AdvanceTemplateEditor but with just a body — no subject, no per-show
// placeholders, since the portal info is fully static.
export default function PortalInfoEditor({ initial }: { initial: PortalInfo }) {
  const [body, setBody] = useState(initial.body);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const dirty = body !== initial.body;

  async function save() {
    setSaving(true);
    setError(null);
    setSavedAt(null);
    try {
      const res = await fetch('/api/admin/portal-info', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Save failed (${res.status})`);
      }
      const data = (await res.json()) as PortalInfo;
      // Rebase "initial" so the dirty check resets without a full reload.
      initial.body = data.body;
      setBody(data.body);
      setSavedAt(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label className={FORM.label}>
          Body{' '}
          <span className="font-normal normal-case tracking-normal text-surface-ink/60">
            (Markdown — ## section headings, ### sub-headings, **bold**, lists, and [links](url) all render on the portal)
          </span>
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          spellCheck
          className="w-full min-h-[32rem] border border-surface-ink bg-surface-paper px-3 py-2 text-data-caption-13 leading-relaxed focus-visible:outline-accent-red focus-visible:outline-2 focus-visible:outline-offset-2"
        />
      </div>

      {error && (
        <div role="alert" className={`${FORM.error} border-accent-red border-2 p-3`}>
          {error}
        </div>
      )}

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className={`${buttonClassName('primary', 'm')} disabled:opacity-50`}
        >
          {saving ? 'Saving…' : 'Save portal info'}
        </button>
        {savedAt && !dirty && (
          <span className="text-body-3 text-surface-ink/60">Saved at {savedAt}</span>
        )}
        {dirty && !saving && (
          <span className="text-body-3 text-surface-ink/60">Unsaved changes</span>
        )}
      </div>
    </div>
  );
}
