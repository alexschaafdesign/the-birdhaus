'use client';

import { useState } from 'react';
import { FORM } from '@/components/night/form';
import { buttonClassName } from './ui';
import { ADVANCE_PLACEHOLDERS } from '@/lib/advance-email';

interface Template {
  subject: string;
  body: string;
  updatedAt: string;
}

export default function AdvanceTemplateEditor({
  initial,
}: {
  initial: Template;
}) {
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const dirty = subject !== initial.subject || body !== initial.body;

  async function save() {
    setSaving(true);
    setError(null);
    setSavedAt(null);
    try {
      const res = await fetch('/api/admin/advance-template', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, body }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Save failed (${res.status})`);
      }
      const data = (await res.json()) as Template;
      // Rebase "initial" so the dirty check resets without a full reload.
      initial.subject = data.subject;
      initial.body = data.body;
      setSubject(data.subject);
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
          Subject
        </label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className={FORM.field}
        />
      </div>

      <div className="space-y-1.5">
        <label className={FORM.label}>
          Body <span className="font-normal normal-case tracking-normal text-surface-ink/60">(Markdown — lists, **bold**, [links](url) all render in the email)</span>
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          spellCheck
          className="w-full min-h-[28rem] border border-surface-ink bg-surface-paper px-3 py-2 text-data-caption-13 leading-relaxed focus-visible:outline-accent-red focus-visible:outline-2 focus-visible:outline-offset-2"
        />
      </div>

      <div className="bg-surface-paper-shade p-4 space-y-2">
        <p className="text-data-overline-11 font-bold leading-[1.3] tracking-[--spacing(0.625)] uppercase">
          Placeholders — filled in per show
        </p>
        <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2 text-body-3">
          {ADVANCE_PLACEHOLDERS.map((p) => (
            <li key={p.key} className="flex gap-2">
              <code className="text-surface-ink shrink-0">{`{{${p.key}}}`}</code>
              <span className="text-surface-ink/60">{p.label}</span>
            </li>
          ))}
        </ul>
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
          {saving ? 'Saving…' : 'Save template'}
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
