'use client';

import { useState } from 'react';

export default function CopySummaryButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can reject (permissions, insecure context) — leave the
      // label unchanged so the user knows to copy from the PDF instead.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? 'Copied!' : 'Copy main details for email'}
      aria-label="Copy main details for email"
      className="border-surface-ink ui-hover:bg-surface-ink ui-hover:text-surface-paper flex size-9.5 cursor-pointer items-center justify-center border-2 transition-colors focus-visible:outline-accent-red focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      {copied ? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}
