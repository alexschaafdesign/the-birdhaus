// Soft rate estimates for the informal rate card. PURE. Display-only: an
// estimate is never stored on a booking and never treated as owed.
//
// Cheapest mix of packages and the hourly rate (hourly charged per half hour).
// A package may cover more time than asked for (a 2.5-hour session can use a
// 3-hour package if that's cheaper). A weekly series is "4 for the price of
// 3": three sessions' worth per four weeks.

export interface RateCardInput {
  rateHourlyCents: number;
  ratePackages: Array<{ minutes: number; cents: number }>;
}

export function estimateCents(minutes: number, r: RateCardInput): number {
  const units = Math.ceil(minutes / 30);
  const halfHour = r.rateHourlyCents / 2;
  const best: number[] = [0];
  for (let u = 1; u <= units; u++) {
    let b = best[u - 1] + halfHour;
    for (const p of r.ratePackages) {
      const pu = Math.ceil(p.minutes / 30);
      if (pu <= 0) continue;
      b = Math.min(b, p.cents + best[Math.max(0, u - pu)]);
    }
    best[u] = b;
  }
  return Math.round(best[units]);
}

// Per four weeks, for a weekly series: pay for 3 of every 4 sessions.
export function weeklyEstimateCents(minutes: number, r: RateCardInput): number {
  return estimateCents(minutes, r) * 3;
}

export function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

export function hoursLabel(minutes: number): string {
  const h = minutes / 60;
  const n = Number.isInteger(h) ? String(h) : h.toFixed(1);
  return `${n} hour${h === 1 ? '' : 's'}`;
}

// The soft line shown on the review sheet and to Alex.
//   once / every other / monthly: "Usual rate for 3 hours: $50"
//   weekly:                        "Regular rate: $150 / 4 weeks"
export function estimateLine(minutes: number, freq: string | null, r: RateCardInput): string {
  return freq === 'weekly'
    ? `Regular rate: ${dollars(weeklyEstimateCents(minutes, r))} / 4 weeks`
    : `Usual rate for ${hoursLabel(minutes)}: ${dollars(estimateCents(minutes, r))}`;
}

// The rate card as short lines, for /rehearsal and the invite email:
//   ["$20 an hour", "3 hours for $50", "6 hours for $100"]
export function rateCardLines(r: RateCardInput): string[] {
  return [
    `${dollars(r.rateHourlyCents)} an hour`,
    ...[...r.ratePackages].sort((a, b) => a.minutes - b.minutes).map((p) => `${hoursLabel(p.minutes)} for ${dollars(p.cents)}`),
  ];
}

// The soft line for Alex (request email, Requests, morning email), or null
// when payments are on (real prices show instead) or estimates are off.
export function usualRateFor(
  start: Date,
  end: Date,
  freq: string | null,
  s: RateCardInput & { paymentsEnabled: boolean; estimatesEnabled: boolean },
): string | null {
  if (s.paymentsEnabled || !s.estimatesEnabled) return null;
  return estimateLine(Math.round((end.getTime() - start.getTime()) / 60_000), freq, s);
}

// "3 h", "1.5 h"
export function lengthLabel(start: Date, end: Date): string {
  const h = (end.getTime() - start.getTime()) / 3_600_000;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} h`;
}
