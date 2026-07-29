'use client';

import { useState } from 'react';
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
        <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/60">
          Subject
        </label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full rounded border border-[#E8E0D0]/30 bg-[#171412] px-3 py-2 text-sm focus:outline-none focus:border-[#E8E0D0]/60"
        />
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/60">
          Body <span className="normal-case tracking-normal text-[#E8E0D0]/40">(Markdown — lists, **bold**, [links](url) all render in the email)</span>
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          spellCheck
          className="w-full min-h-[28rem] rounded border border-[#E8E0D0]/30 bg-[#171412] px-3 py-2 font-mono text-[13px] leading-relaxed focus:outline-none focus:border-[#E8E0D0]/60"
        />
      </div>

      <div className="border border-[#E8E0D0]/15 rounded-lg p-4 space-y-2">
        <p className="text-xs uppercase tracking-wide text-[#E8E0D0]/60">
          Placeholders — filled in per show
        </p>
        <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2 text-sm">
          {ADVANCE_PLACEHOLDERS.map((p) => (
            <li key={p.key} className="flex gap-2">
              <code className="text-[#E8E0D0] shrink-0">{`{{${p.key}}}`}</code>
              <span className="text-[#E8E0D0]/55">{p.label}</span>
            </li>
          ))}
        </ul>
      </div>

      {error && (
        <div className="border border-red-400/40 bg-red-400/10 text-red-300 text-sm rounded px-4 py-2">
          {error}
        </div>
      )}

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="bg-[#E8E0D0] text-[#2A2420] border border-[#E8E0D0] rounded px-6 py-2 text-sm font-medium hover:bg-[#E8E0D0]/90 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save template'}
        </button>
        {savedAt && !dirty && (
          <span className="text-sm text-[#E8E0D0]/50">Saved at {savedAt}</span>
        )}
        {dirty && !saving && (
          <span className="text-sm text-[#E8E0D0]/40">Unsaved changes</span>
        )}
      </div>
    </div>
  );
}
