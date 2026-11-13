'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface RowView {
  id: number;
  catalogueId: string;
  bandId: number;
  bandName: string;
  when: string;
  shortWhen: string;
  price: string;
  priceCents: number;
  status: 'pending' | 'confirmed' | 'declined' | 'cancelled' | 'expired';
  live: boolean;
  paymentStatus: 'unpaid' | 'paid' | 'comped' | 'refunded';
  paymentMethod: 'venmo' | 'square' | 'cash';
  gear: string;
  note: string;
  clash: string[];
  calendarUnchecked: boolean;
  adminEmailed: boolean;
  bandEmailed: boolean;
  expires: string;
  requested: string;
}

const btn = 'rounded border px-3 py-1 text-xs disabled:opacity-40';
const primary = `${btn} bg-[#E8E0D0] text-[#2A2420] border-[#E8E0D0] hover:bg-[#E8E0D0]/90`;
const ghost = `${btn} border-[#E8E0D0]/30 hover:border-[#E8E0D0]/60`;
const danger = `${btn} border-red-400/40 text-red-300 hover:border-red-300`;
const tag = 'rounded px-1.5 py-0.5 text-[11px] uppercase tracking-wide';

function sum(rows: RowView[]) {
  const c = rows.reduce((s, r) => s + r.priceCents, 0);
  return `$${(c / 100).toFixed(c % 100 === 0 ? 0 : 2)}`;
}

export default function RehearsalRequests({
  requests,
  outstanding,
  upcoming,
}: {
  requests: RowView[][];
  outstanding: RowView[];
  upcoming: RowView[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function post(key: string, url: string, body: unknown, success: (d: { emailed?: boolean }) => string) {
    setBusy(key);
    setMessage(null);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) setMessage({ ok: false, text: data?.error ?? `Failed (${res.status})` });
      else setMessage({ ok: true, text: success(data ?? {}) });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const decideMsg = (verb: string) => (d: { emailed?: boolean }) =>
    `${verb}. ${d.emailed ? 'Band emailed.' : 'The band email did not go out — use Resend.'}`;

  function approve(ids: number[], key: string) {
    post(key, '/api/admin/rehearsal/bookings/decide', { action: 'approve', ids }, decideMsg('Approved'));
  }

  function decline(ids: number[], key: string) {
    const reason = prompt('Reason for the band (optional — leave blank for none):');
    if (reason === null) return;
    post(key, '/api/admin/rehearsal/bookings/decide', { action: 'decline', ids, reason }, decideMsg('Declined'));
  }

  function pay(id: number, status: RowView['paymentStatus']) {
    post(`pay-${id}`, `/api/admin/rehearsal/bookings/${id}/payment`, { status }, () => `Marked ${status}.`);
  }

  function resend(ids: number[], key: string) {
    post(key, '/api/admin/rehearsal/bookings/resend', { ids }, () => 'Email sent.');
  }

  return (
    <div className="space-y-10">
      {message && (
        <div
          role="status"
          className={`rounded border px-4 py-2 text-sm ${
            message.ok ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200' : 'border-red-400/40 bg-red-400/10 text-red-300'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Requests */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold">Requests {requests.length > 0 && <span className="text-[#E8E0D0]/50">({requests.length})</span>}</h2>
        {requests.length === 0 && <p className="text-sm text-[#E8E0D0]/50">No requests waiting.</p>}
        {requests.map((group) => {
          const first = group[0];
          const live = group.filter((r) => r.live);
          const key = `req-${first.id}`;
          return (
            <article key={key} className="space-y-3 rounded-lg border border-[#E8E0D0]/15 p-4">
              <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <Link href={`/admin/rehearsal/bands/${first.bandId}`} className="font-semibold hover:underline">
                  {first.bandName}
                </Link>
                <span className="text-sm text-[#E8E0D0]/50">
                  requested {first.requested} · expires {first.expires} · {sum(group)} · pays by {first.paymentMethod}
                </span>
                {first.calendarUnchecked && <span className={`${tag} bg-amber-400/15 text-amber-200`}>calendar not checked</span>}
                {!first.adminEmailed && <span className={`${tag} bg-[#E8E0D0]/10 text-[#E8E0D0]/60`}>no email to you</span>}
              </header>
              <ul className="divide-y divide-[#E8E0D0]/10 text-sm">
                {group.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                    <span className="w-24 text-[#E8E0D0]/50">{r.catalogueId}</span>
                    <span className="min-w-56 font-medium">{r.when}</span>
                    <span>{r.price}</span>
                    {!r.live && <span className={`${tag} bg-[#E8E0D0]/10 text-[#E8E0D0]/60`}>expired</span>}
                    {r.clash.length > 0 && (
                      <span className={`${tag} bg-red-400/15 text-red-300`}>{r.clash.join(', ')}</span>
                    )}
                    {group.length > 1 && (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => decline([r.id], `d-${r.id}`)}
                        className={`${ghost} ml-auto`}
                      >
                        Decline this one
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {(first.gear || first.note) && (
                <div className="space-y-1 text-sm text-[#E8E0D0]/80">
                  {first.gear && <p>Gear: {first.gear}</p>}
                  {first.note && <p className="whitespace-pre-line">Note: {first.note}</p>}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {live.length > 0 && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => approve(live.map((r) => r.id), key)}
                    className={primary}
                  >
                    {busy === key ? 'Working…' : live.length === 1 ? 'Approve' : `Approve all ${live.length}`}
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => decline(group.map((r) => r.id), `${key}-d`)}
                  className={danger}
                >
                  {live.length === 0 ? 'Mark declined' : group.length === 1 ? 'Decline' : `Decline all ${group.length}`}
                </button>
              </div>
            </article>
          );
        })}
      </section>

      {/* Outstanding */}
      <section className="space-y-3">
        <h2 className="text-xl font-bold">
          Outstanding {outstanding.length > 0 && <span className="text-[#E8E0D0]/50">({sum(outstanding)})</span>}
        </h2>
        {outstanding.length === 0 ? (
          <p className="text-sm text-[#E8E0D0]/50">Nothing owed.</p>
        ) : (
          <PaymentTable rows={outstanding} busy={busy} pay={pay} resend={resend} />
        )}
      </section>

      {/* Upcoming */}
      <section className="space-y-3">
        <h2 className="text-xl font-bold">Upcoming confirmed</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-[#E8E0D0]/50">No confirmed sessions coming up.</p>
        ) : (
          <PaymentTable rows={upcoming} busy={busy} pay={pay} resend={resend} />
        )}
      </section>
    </div>
  );
}

function PaymentTable({
  rows,
  busy,
  pay,
  resend,
}: {
  rows: RowView[];
  busy: string | null;
  pay: (id: number, s: RowView['paymentStatus']) => void;
  resend: (ids: number[], key: string) => void;
}) {
  return (
    <ul className="divide-y divide-[#E8E0D0]/10 rounded-lg border border-[#E8E0D0]/15 text-sm">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
          <span className="w-24 text-[#E8E0D0]/50">{r.catalogueId}</span>
          <span className="min-w-56 font-medium">{r.when}</span>
          <Link href={`/admin/rehearsal/bands/${r.bandId}`} className="min-w-32 hover:underline">
            {r.bandName}
          </Link>
          <span>{r.price}</span>
          {r.gear && <span className="text-[#E8E0D0]/60">{r.gear}</span>}
          {r.clash.length > 0 && <span className={`${tag} bg-red-400/15 text-red-300`}>{r.clash.join(', ')}</span>}
          {!r.bandEmailed && (
            <button type="button" disabled={busy !== null} onClick={() => resend([r.id], `rs-${r.id}`)} className={ghost}>
              Resend confirmation
            </button>
          )}
          <span className="ml-auto flex items-center gap-2">
            {r.paymentStatus === 'unpaid' ? (
              <>
                <button type="button" disabled={busy !== null} onClick={() => pay(r.id, 'paid')} className={primary}>
                  {busy === `pay-${r.id}` ? '…' : `Paid (${r.paymentMethod})`}
                </button>
                <button type="button" disabled={busy !== null} onClick={() => pay(r.id, 'comped')} className={ghost}>
                  Comp
                </button>
              </>
            ) : (
              <>
                <span className={`${tag} ${r.paymentStatus === 'paid' ? 'bg-emerald-400/15 text-emerald-200' : 'bg-[#E8E0D0]/10 text-[#E8E0D0]/70'}`}>
                  {r.paymentStatus}
                </span>
                <button type="button" disabled={busy !== null} onClick={() => pay(r.id, 'unpaid')} className="text-xs text-[#E8E0D0]/50 underline">
                  undo
                </button>
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
