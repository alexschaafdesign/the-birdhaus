'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ADMIN_TYPE, StatusMark, buttonClassName } from '@/components/admin/ui';
import { FORM } from '@/components/night/form';

interface Band {
  id: number;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  notes: string;
  rateNotes: string;
  doorCode: string;
  archived: boolean;
  url: string | null;
  gear: string;
}

const label = FORM.label;
const input = FORM.field;
const small = `text-data-caption-13 ${ADMIN_TYPE.link} disabled:opacity-40`;

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
        {band.url ? (
          <>
            <a href={band.url} target="_blank" rel="noreferrer" className={small}>
              Open booking link
            </a>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => {
                if (confirm(`Email ${band.name} their booking link?`)) {
                  call('invite', `/api/admin/rehearsal/bands/${band.id}/invite`, { method: 'POST' }, 'Booking link emailed.');
                }
              }}
              className={small}
            >
              Email booking link
            </button>
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
          <StatusMark tone="attention">No active link</StatusMark>
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
            className="text-data-caption-13 text-accent-red cursor-pointer underline underline-offset-4 hover:no-underline disabled:opacity-40"
          >
            Revoke
          </button>
        )}
      </div>
      {band.gear && <p className="text-body-3 text-surface-ink/60">Usual gear: {band.gear}</p>}

      <form onSubmit={save} className="grid gap-4 border border-surface-ink p-4 sm:grid-cols-2">
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
          <span className={label}>Door code (shown on their booking page while they have a confirmed session)</span>
          <input
            value={form.doorCode}
            maxLength={100}
            onChange={(e) => setForm({ ...form, doorCode: e.target.value })}
            placeholder="e.g. 4821#"
            autoComplete="off"
            className={`${input} sm:max-w-xs`}
          />
        </label>
        <label className="space-y-1.5 sm:col-span-2">
          <span className={label}>Rate &amp; payment notes (only you see these; shown with their requests)</span>
          <input
            value={form.rateNotes}
            maxLength={2000}
            onChange={(e) => setForm({ ...form, rateNotes: e.target.value })}
            placeholder="$20 a session, pays cash · trading for a mix · free this month"
            className={input}
          />
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
        <label className="text-body-3 flex cursor-pointer flex-wrap items-center gap-2 sm:col-span-2">
          <input type="checkbox" className="accent-surface-ink size-4" checked={form.archived} onChange={(e) => setForm({ ...form, archived: e.target.checked })} />
          Archived <span className="text-surface-ink/60">(hides the band and turns its link off; history stays)</span>
        </label>
        <div className="flex items-center gap-4 sm:col-span-2">
          <button
            type="submit"
            disabled={busy !== null}
            className={buttonClassName('primary', 's')}
          >
            {busy === 'save' ? 'Saving…' : 'Save'}
          </button>
          {message && <span role={message.ok ? 'status' : 'alert'} className={message.ok ? 'text-body-3 font-bold' : FORM.error}>{message.text}</span>}
        </div>
      </form>
    </section>
  );
}
