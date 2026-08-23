'use client';

import { useState } from 'react';

const inputClass =
  'bg-transparent border border-[#E8E0D0]/30 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#E8E0D0] placeholder:text-[#E8E0D0]/30';

// Edits the advance watcher list — who is CC'd on every outbound advance /
// thread message and notified of portal activity. Saved as a whole via
// PUT /api/admin/advance-watchers.
export default function AdvanceWatchersEditor({ initial }: { initial: string[] }) {
  const [emails, setEmails] = useState<string[]>(initial);
  const [saved, setSaved] = useState<string[]>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const dirty = JSON.stringify(emails) !== JSON.stringify(saved);

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/advance-watchers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error ?? `Save failed (${res.status})`);
      setEmails(d.emails as string[]);
      setSaved(d.emails as string[]);
      setNotice('Watchers saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {emails.length > 0 ? (
        <ul className="space-y-2">
          {emails.map((email, i) => (
            <li key={i} className="flex items-center gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) =>
                  setEmails((list) => list.map((v, j) => (j === i ? e.target.value : v)))
                }
                placeholder="name@example.com"
                className={`${inputClass} flex-1 min-w-[14rem]`}
                aria-label={`Watcher ${i + 1}`}
              />
              <button
                type="button"
                onClick={() => setEmails((list) => list.filter((_, j) => j !== i))}
                className="border border-[#E8E0D0]/40 rounded px-3 py-1.5 text-sm hover:bg-[#E8E0D0]/10 transition-colors"
                aria-label={`Remove watcher ${i + 1}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-amber-300/80">
          No watchers — nobody is CC&apos;d on advance emails or notified of band replies and
          portal activity.
        </p>
      )}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => setEmails((list) => [...list, ''])}
          className="border border-[#E8E0D0]/40 rounded px-4 py-1.5 text-sm hover:bg-[#E8E0D0]/10 transition-colors"
        >
          + Add email
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="border border-[#E8E0D0]/40 rounded px-4 py-1.5 text-sm hover:bg-[#E8E0D0]/10 transition-colors disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save watchers'}
        </button>
      </div>
      {error && <p className="text-xs text-red-300">{error}</p>}
      {notice && <p className="text-xs text-green-300">{notice}</p>}
    </div>
  );
}
