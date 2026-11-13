'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Band {
  id: number;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  notes: string;
  archived: boolean;
  url: string | null;
  gear: string;
}

const label = 'block text-xs uppercase tracking-wide text-[#E8E0D0]/60';
const input =
  'w-full rounded border border-[#E8E0D0]/30 bg-[#171412] px-3 py-2 text-sm focus:outline-none focus:border-[#E8E0D0]/60';
const small = 'text-xs text-[#E8E0D0]/60 underline hover:text-[#E8E0D0] disabled:opacity-40';

export default function RehearsalBandEditor({ band }: { band: Band }) {
  const router = useRouter();
  const [form, setForm] = useState(band);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function call(key: string, url: string, init: RequestInit, ok: string) {
    setBusy(key);
    setMessage(null);
    try {
      const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init });
      const data = await res.json().catch(() => null);
      setMessage(res.ok ? { ok: true, text: ok } : { ok: false, text: data?.error ?? `Failed (${res.status})` });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    call('save', `/api/admin/rehearsal/bands/${band.id}`, { method: 'PATCH', body: JSON.stringify(form) }, 'Saved.');
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <h2 className="text-xl font-bold">{band.name}</h2>
        {band.url ? (
          <>
            <a href={band.url} target="_blank" rel="noreferrer" className={small}>
              Open booking link
            </a>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(band.url!);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className={small}
            >
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </>
        ) : (
          <span className="text-xs text-amber-300">No active link</span>
        )}
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => {
            if (!band.url || confirm(`Replace ${band.name}'s link? The old one will stop working.`)) {
              call('link', `/api/admin/rehearsal/bands/${band.id}/link`, { method: 'POST' }, 'New link made.');
            }
          }}
          className={small}
        >
          {band.url ? 'Replace link' : 'Make a new link'}
        </button>
        {band.url && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => {
              if (confirm(`Revoke ${band.name}'s link?`)) {
                call('revoke', `/api/admin/rehearsal/bands/${band.id}/link`, { method: 'DELETE' }, 'Link revoked.');
              }
            }}
            className="text-xs text-red-300/80 underline hover:text-red-300 disabled:opacity-40"
          >
            Revoke
          </button>
        )}
      </div>
      {band.gear && <p className="text-sm text-[#E8E0D0]/60">Usual gear: {band.gear}</p>}

      <form onSubmit={save} className="grid gap-4 rounded-lg border border-[#E8E0D0]/15 p-4 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className={label}>Band / project</span>
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} />
        </label>
        <label className="space-y-1.5">
          <span className={label}>Contact name</span>
          <input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} className={input} />
        </label>
        <label className="space-y-1.5">
          <span className={label}>Email</span>
          <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={input} />
        </label>
        <label className="space-y-1.5">
          <span className={label}>Phone</span>
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={input} />
        </label>
        <label className="space-y-1.5 sm:col-span-2">
          <span className={label}>Notes (only you see these)</span>
          <textarea
            rows={4}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className={`${input} leading-relaxed`}
          />
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={form.archived} onChange={(e) => setForm({ ...form, archived: e.target.checked })} />
          Archived <span className="text-[#E8E0D0]/40">(hides the band and turns its link off; history stays)</span>
        </label>
        <div className="flex items-center gap-4 sm:col-span-2">
          <button
            type="submit"
            disabled={busy !== null}
            className="bg-[#E8E0D0] text-[#2A2420] rounded px-6 py-2 text-sm font-medium hover:bg-[#E8E0D0]/90 disabled:opacity-50"
          >
            {busy === 'save' ? 'Saving…' : 'Save'}
          </button>
          {message && <span className={`text-sm ${message.ok ? 'text-emerald-300' : 'text-red-300'}`}>{message.text}</span>}
        </div>
      </form>
    </section>
  );
}
