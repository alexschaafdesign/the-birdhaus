'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ADMIN_TYPE, StatusMark, buttonClassName } from '@/components/admin/ui';
import { FORM } from '@/components/night/form';

export interface RowView {
  id: number;
  catalogueId: string;
  bandId: number;
  bandName: string;
  rateNotes: string;
  usualRate: string | null; // soft estimate (payments off, estimates on)
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
  repeat: string | null;
  changeFrom: string | null; // a change request: the booking it replaces
}

const primary = buttonClassName('primary', 's');
const ghost = buttonClassName('secondary', 's');
// Declining is the destructive one: a red text link, per DESIGN.md.
const danger = 'text-body-3 text-accent-red cursor-pointer underline underline-offset-4 hover:no-underline disabled:opacity-40';
// A repeat label: a category, not a status, so plain ink.
const tag = `${ADMIN_TYPE.overline} whitespace-nowrap`;

function sum(rows: RowView[]) {
  const c = rows.reduce((s, r) => s + r.priceCents, 0);
  return `$${(c / 100).toFixed(c % 100 === 0 ? 0 : 2)}`;
}

export default function RehearsalRequests({
  requests,
  outstanding,
  upcoming,
  paymentsEnabled,
}: {
  requests: RowView[][];
  outstanding: RowView[];
  upcoming: RowView[];
  paymentsEnabled: boolean;
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
          role={message.ok ? 'status' : 'alert'}
          className={message.ok ? FORM.notice : 'border-accent-red text-body-3 text-accent-red border-2 p-3'}
        >
          {message.text}
        </div>
      )}

      {/* Requests */}
      <section className="space-y-4">
        <h2 className={ADMIN_TYPE.heading}>Requests {requests.length > 0 && <span className="text-surface-ink/60">({requests.length})</span>}</h2>
        {requests.length === 0 && <p className="text-body-3 text-surface-ink/60">No requests waiting.</p>}
        {requests.map((group) => {
          const first = group[0];
          const live = group.filter((r) => r.live);
          const key = `req-${first.id}`;
          return (
            <article key={key} className="space-y-3 border border-surface-ink p-4">
              <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <Link href={`/admin/rehearsal/bands/${first.bandId}`} className="font-bold hover:text-accent-red underline-offset-4 hover:underline">
                  {first.bandName}
                </Link>
                {first.rateNotes && <span className="text-body-3 font-bold">{first.rateNotes}</span>}
                {[...new Set(group.map((r) => r.usualRate).filter(Boolean))].map((u) => (
                  <span key={u} className="text-body-3 text-surface-ink/60">
                    {u}
                  </span>
                ))}
                <span className="text-body-3 text-surface-ink/60">
                  requested {first.requested} · expires {first.expires}
                  {paymentsEnabled && ` · ${sum(group)} · pays by ${first.paymentMethod}`}
                </span>
                {[...new Set(group.map((r) => r.repeat).filter(Boolean))].map((label) => (
                  <span key={label} className={tag}>
                    ↻ {label}
                  </span>
                ))}
                {first.changeFrom && <StatusMark tone="attention">change</StatusMark>}
                {first.calendarUnchecked && <StatusMark tone="attention">calendar not checked</StatusMark>}
                {!first.adminEmailed && <StatusMark tone="neutral">no email to you</StatusMark>}
              </header>
              {first.changeFrom && (
                <p className="text-body-3">
                  Moving from <span className="font-bold">{first.changeFrom}</span> to:
                </p>
              )}
              <ul className="divide-y divide-surface-ink/20 text-body-3">
                {group.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                    <span className="w-24 text-surface-ink/60">{r.catalogueId}</span>
                    <span className="min-w-56 font-bold">{r.when}</span>
                    {paymentsEnabled && <span>{r.price}</span>}
                    {r.repeat && group.some((x) => x.repeat !== r.repeat) && (
                      <span className="text-data-caption-13 text-surface-ink/70">↻ {r.repeat}</span>
                    )}
                    {!r.live && <StatusMark tone="neutral">expired</StatusMark>}
                    {r.clash.length > 0 && (
                      <StatusMark tone="problem">{r.clash.join(', ')}</StatusMark>
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
                <div className="text-body-3 text-surface-ink/80 space-y-1">
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
                    {busy === key
                      ? 'Working…'
                      : group.every((r) => r.repeat && r.repeat === first.repeat)
                        ? `Approve the series (${live.length})`
                        : live.length === 1
                          ? 'Approve'
                          : `Approve all ${live.length}`}
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

      {/* Outstanding (only when payments are tracked) */}
      {paymentsEnabled && (
      <section className="space-y-3">
        <h2 className={ADMIN_TYPE.heading}>
          Outstanding {outstanding.length > 0 && <span className="text-surface-ink/60">({sum(outstanding)})</span>}
        </h2>
        {outstanding.length === 0 ? (
          <p className="text-body-3 text-surface-ink/60">Nothing owed.</p>
        ) : (
          <PaymentTable rows={outstanding} busy={busy} pay={pay} resend={resend} paymentsEnabled />
        )}
      </section>
      )}

      {/* Upcoming */}
      <section className="space-y-3">
        <h2 className={ADMIN_TYPE.heading}>Upcoming confirmed</h2>
        {upcoming.length === 0 ? (
          <p className="text-body-3 text-surface-ink/60">No confirmed sessions coming up.</p>
        ) : (
          <PaymentTable rows={upcoming} busy={busy} pay={pay} resend={resend} paymentsEnabled={paymentsEnabled} />
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
  paymentsEnabled,
}: {
  rows: RowView[];
  paymentsEnabled: boolean;
  busy: string | null;
  pay: (id: number, s: RowView['paymentStatus']) => void;
  resend: (ids: number[], key: string) => void;
}) {
  return (
    <ul className="divide-y divide-surface-ink/20 border border-surface-ink text-body-3">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
          <span className="w-24 text-surface-ink/60">{r.catalogueId}</span>
          <span className="min-w-56 font-bold">{r.when}</span>
          <Link href={`/admin/rehearsal/bands/${r.bandId}`} className="min-w-32 hover:text-accent-red underline-offset-4 hover:underline">
            {r.bandName}
          </Link>
          {r.rateNotes && <span className="font-bold">{r.rateNotes}</span>}
          {r.usualRate && <span className="text-surface-ink/60">{r.usualRate}</span>}
          {paymentsEnabled && <span>{r.price}</span>}
          {r.gear && <span className="text-surface-ink/60">{r.gear}</span>}
          {r.clash.length > 0 && <StatusMark tone="problem">{r.clash.join(', ')}</StatusMark>}
          {!r.bandEmailed && (
            <button type="button" disabled={busy !== null} onClick={() => resend([r.id], `rs-${r.id}`)} className={ghost}>
              Resend confirmation
            </button>
          )}
          {paymentsEnabled && (
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
                <StatusMark tone={r.paymentStatus === 'paid' ? 'ok' : 'neutral'}>{r.paymentStatus}</StatusMark>
                <button type="button" disabled={busy !== null} onClick={() => pay(r.id, 'unpaid')} className={`text-data-caption-13 ${ADMIN_TYPE.link}`}>
                  undo
                </button>
              </>
            )}
          </span>
          )}
        </li>
      ))}
    </ul>
  );
}
