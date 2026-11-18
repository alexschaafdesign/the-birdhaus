'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ADMIN_TYPE, StatusMark, buttonClassName } from '@/components/admin/ui';
import { FORM } from '@/components/night/form';

interface LeadRow {
  id: number;
  name: string;
  project: string;
  email: string;
  phone: string;
  people: number | null;
  frequency: string;
  preferredTimes: string;
  genreLinks: string;
  notes: string;
  status: 'new' | 'invited' | 'archived';
  bandId: number | null;
  created: string;
}

const TONE = { new: 'attention', invited: 'ok', archived: 'neutral' } as const;

export default function RehearsalLeads({ leads }: { leads: LeadRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ id: number; ok: boolean; text: string } | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  async function act(id: number, action: 'invite' | 'archive' | 'restore') {
    if (action === 'invite' && !confirm('Create the band and email them their booking link?')) return;
    setBusy(id);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/rehearsal/leads/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) setMsg({ id, ok: false, text: d?.error ?? `Failed (${res.status})` });
      else if (action === 'invite')
        setMsg({ id, ok: d.emailed, text: d.emailed ? 'Invited — link emailed.' : 'Band made, but the email didn’t send. Use Email booking link on the band page.' });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const visible = leads.filter((l) => showArchived || l.status !== 'archived');
  const archived = leads.filter((l) => l.status === 'archived').length;

  return (
    <div className="space-y-4">
      {visible.length === 0 && <p className="text-body-3 text-surface-ink/60">No leads yet.</p>}
      <ul className="space-y-3">
        {visible.map((l) => (
          <li key={l.id} className={`space-y-2  border border-surface-ink p-4 text-body-3 ${l.status === 'archived' ? 'opacity-60' : ''}`}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-bold">{l.project || l.name}</span>
              {l.project && <span className="text-surface-ink/60">{l.name}</span>}
              <span className="text-surface-ink/60">{l.created}</span>
              <StatusMark tone={TONE[l.status]}>{l.status}</StatusMark>
              <span className="ml-auto flex items-center gap-3">
                {l.status === 'invited' && l.bandId ? (
                  <Link href={`/admin/rehearsal/bands/${l.bandId}`} className={`text-data-caption-13 ${ADMIN_TYPE.link}`}>
                    Band page
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => act(l.id, 'invite')}
                    className={buttonClassName('primary', 's')}
                  >
                    {busy === l.id ? 'Inviting…' : 'Invite'}
                  </button>
                )}
                {l.status === 'new' && (
                  <button type="button" disabled={busy !== null} onClick={() => act(l.id, 'archive')} className={`text-data-caption-13 ${ADMIN_TYPE.link}`}>
                    Archive
                  </button>
                )}
                {l.status === 'archived' && (
                  <button type="button" disabled={busy !== null} onClick={() => act(l.id, 'restore')} className={`text-data-caption-13 ${ADMIN_TYPE.link}`}>
                    Restore
                  </button>
                )}
              </span>
            </div>
            <p className="text-surface-ink/70">
              <a href={`mailto:${l.email}`} className={ADMIN_TYPE.link}>{l.email}</a>
              {l.phone ? ` · ${l.phone}` : ''}
              {l.people ? ` · ${l.people} people` : ''} · {l.frequency}
            </p>
            {l.preferredTimes && <p><span className="text-surface-ink/60">Prefers:</span> {l.preferredTimes}</p>}
            {l.genreLinks && <p className="break-words"><span className="text-surface-ink/60">Genre / links:</span> {l.genreLinks}</p>}
            {l.notes && <p className="whitespace-pre-line"><span className="text-surface-ink/60">Notes:</span> {l.notes}</p>}
            {msg?.id === l.id && <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'font-bold' : FORM.error}>{msg.text}</p>}
          </li>
        ))}
      </ul>
      {archived > 0 && (
        <button type="button" onClick={() => setShowArchived(!showArchived)} className={`text-data-caption-13 ${ADMIN_TYPE.link}`}>
          {showArchived ? 'Hide archived' : `Show archived (${archived})`}
        </button>
      )}
    </div>
  );
}
