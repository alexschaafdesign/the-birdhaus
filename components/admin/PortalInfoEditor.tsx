'use client';

import { useState } from 'react';

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
        <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/60">
          Body{' '}
          <span className="normal-case tracking-normal text-[#E8E0D0]/40">
            (Markdown — ## section headings, ### sub-headings, **bold**, lists, and [links](url) all render on the portal)
          </span>
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          spellCheck
          className="w-full min-h-[32rem] rounded border border-[#E8E0D0]/30 bg-[#171412] px-3 py-2 font-mono text-[13px] leading-relaxed focus:outline-none focus:border-[#E8E0D0]/60"
        />
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
          {saving ? 'Saving…' : 'Save portal info'}
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
