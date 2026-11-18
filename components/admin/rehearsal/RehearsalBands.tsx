'use client';

import Link from 'next/link';
import { useState } from 'react';
import { StatusMark, buttonClassName } from '@/components/admin/ui';
import { ADMIN_TYPE } from '@/components/admin/ui';
import { FORM } from '@/components/night/form';

interface BandRow {
  id: number;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  archived: boolean;
  url: string | null;
}

const input = FORM.field;
const small = `text-data-caption-13 ${ADMIN_TYPE.link} disabled:opacity-40`;

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
      <form onSubmit={add} className="grid gap-3 border border-surface-ink p-4 sm:grid-cols-5">
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
          className={buttonClassName('primary', 's')}
        >
          {busy === 'add' ? 'Adding…' : 'Add band'}
        </button>
      </form>

      {error && (
        <div role="alert" className="border-accent-red text-body-3 text-accent-red border-2 p-3">{error}</div>
      )}

      {bands.length === 0 ? (
        <p className="text-body-3 text-surface-ink/60">No bands yet.</p>
      ) : (
        <ul className="divide-y divide-surface-ink/20 border border-surface-ink">
          {bands.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
              <div className="min-w-48 flex-1">
                <p className="font-bold">
                  <Link href={`/admin/rehearsal/bands/${b.id}`} className="hover:text-accent-red underline-offset-4 hover:underline">
                    {b.name}
                  </Link>{' '}
                  {b.archived && <StatusMark tone="neutral">archived</StatusMark>}
                </p>
                <p className="text-body-3 text-surface-ink/60">
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
                  <StatusMark tone="attention">No active link</StatusMark>
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
                    className="text-data-caption-13 text-accent-red cursor-pointer underline underline-offset-4 hover:no-underline disabled:opacity-40"
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
