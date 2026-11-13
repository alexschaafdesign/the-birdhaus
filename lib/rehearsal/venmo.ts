// Venmo pay links for confirmed rehearsals. PURE: tested.
//
// Memo: "RH-261114 · Band Name" (the catalogue id already carries the b/c
// suffix for a second booking that day). The link prefills recipient, amount
// and memo where Venmo honours it; emails always print the same three things
// as text too, so a link that doesn't prefill (decision 11) still works.

const MAX_MEMO = 140;

export function venmoMemo(catalogueId: string, bandName: string): string {
  const memo = `${catalogueId} · ${bandName.replace(/\s+/g, ' ').trim()}`;
  return memo.length > MAX_MEMO ? `${memo.slice(0, MAX_MEMO - 1)}…` : memo;
}

export function venmoAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function venmoPayUrl(handle: string, cents: number, memo: string): string {
  const h = handle.replace(/^@/, '');
  const q = new URLSearchParams({ txn: 'pay', amount: venmoAmount(cents), note: memo });
  return `https://venmo.com/${encodeURIComponent(h)}?${q.toString().replace(/\+/g, '%20')}`;
}
