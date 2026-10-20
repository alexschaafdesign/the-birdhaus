import type { FreshCutsContent } from './page-content';

// Copy that's still a stand-in ("tbd", "TODO", "…") or blank. The archive's
// Fresh Cuts view skips the intro until the tagline or a body paragraph has
// real words, so placeholder text never goes public. No DB import here:
// FreshCutsIntro, a client component, uses these.
const PLACEHOLDER = /^(tbd|tba|tbc|todo|tk|placeholder|coming soon|lorem ipsum.*|\.\.\.|…)?[.!]*$/i;

export function isPlaceholderCopy(text: string): boolean {
  return PLACEHOLDER.test(text.trim());
}

export function hasFreshCutsCopy(content: Pick<FreshCutsContent, 'tagline' | 'body'>): boolean {
  return !isPlaceholderCopy(content.tagline) || content.body.some((p) => !isPlaceholderCopy(p));
}
