'use client';

import { useState } from 'react';

interface BandRow {
  id: number;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  archived: boolean;
  url: string | null;
}

const input =
  'w-full rounded border border-[#E8E0D0]/30 bg-[#171412] px-3 py-2 text-sm focus:outline-none focus:border-[#E8E0D0]/60';
const small = 'text-xs text-[#E8E0D0]/60 underline hover:text-[#E8E0D0] disabled:opacity-40';

export default function RehearsalBands({ initial }: { initial: BandRow[] }) {
  const [bands, setBands] = useState(initial);
  const [form, setForm] = useState({ name: '', contactName: '', email: '', phone: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  async function reload() {
    const res = await fetch('/api/admin/rehearsal/bands', { cache: 'no-store' });
    const data = await res.json();
    if (res.ok) setBands(data.bands);
  }

  async function call(key: string, url: string, init: RequestInit) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Failed (${res.status})`);
      await reload();
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const data = await call('add', '/api/admin/rehearsal/bands', { method: 'POST', body: JSON.stringify(form) });
    if (data) setForm({ name: '', contactName: '', email: '', phone: '' });
  }

  async function copy(b: BandRow) {
    if (!b.url) return;
    await navigator.clipboard.writeText(b.url);
    setCopied(b.id);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="space-y-6">
      <form onSubmit={add} className="grid gap-3 rounded-lg border border-[#E8E0D0]/15 p-4 sm:grid-cols-5">
        <input
          required
          placeholder="Band / project"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className={input}
        />
        <input
          placeholder="Contact name"
          value={form.contactName}
          onChange={(e) => setForm({ ...form, contactName: e.target.value })}
          className={input}
        />
        <input
          required
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className={input}
        />
        <input
          placeholder="Phone (optional)"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          className={input}
        />
        <button
          type="submit"
          disabled={busy === 'add'}
          className="bg-[#E8E0D0] text-[#2A2420] rounded px-4 py-2 text-sm font-medium hover:bg-[#E8E0D0]/90 disabled:opacity-50"
        >
          {busy === 'add' ? 'Adding…' : 'Add band'}
        </button>
      </form>

      {error && (
        <div className="border border-red-400/40 bg-red-400/10 text-red-300 text-sm rounded px-4 py-2">{error}</div>
      )}

      {bands.length === 0 ? (
        <p className="text-sm text-[#E8E0D0]/50">No bands yet.</p>
      ) : (
        <ul className="divide-y divide-[#E8E0D0]/10 rounded-lg border border-[#E8E0D0]/15">
          {bands.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
              <div className="min-w-48 flex-1">
                <p className="font-semibold">
                  {b.name} {b.archived && <span className="text-xs text-[#E8E0D0]/40">(archived)</span>}
                </p>
                <p className="text-sm text-[#E8E0D0]/55">
                  {[b.contactName, b.email, b.phone].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {b.url ? (
                  <>
                    <a href={b.url} target="_blank" rel="noreferrer" className={small}>
                      Open link
                    </a>
                    <button type="button" onClick={() => copy(b)} className={small}>
                      {copied === b.id ? 'Copied' : 'Copy link'}
                    </button>
                  </>
                ) : (
                  <span className="text-xs text-amber-300">No active link</span>
                )}
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => {
                    if (!b.url || confirm(`Replace ${b.name}'s link? The old one will stop working.`)) {
                      call(`replace-${b.id}`, `/api/admin/rehearsal/bands/${b.id}/link`, { method: 'POST' });
                    }
                  }}
                  className={small}
                >
                  {b.url ? 'Replace link' : 'Make a new link'}
                </button>
                {b.url && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => {
                      if (confirm(`Revoke ${b.name}'s link? It stops working until you make a new one.`)) {
                        call(`revoke-${b.id}`, `/api/admin/rehearsal/bands/${b.id}/link`, { method: 'DELETE' });
                      }
                    }}
                    className="text-xs text-red-300/80 underline hover:text-red-300 disabled:opacity-40"
                  >
                    Revoke
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
