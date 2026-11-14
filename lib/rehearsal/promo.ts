// The rehearsal-space plug that goes at the end of band-facing summaries
// (the settlement plain-text summary). PURE: callers decide whether to show
// it — only while the public /rehearsal page is on, since it's a 404 until then.

export function rehearsalPromoLine(siteUrl: string): string {
  return `Need somewhere to practice? The Birdhaus basement is open for band rehearsals: ${siteUrl}/rehearsal`;
}
