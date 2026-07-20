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
      title="Copy main details for email"
      className="flex items-center gap-1.5 text-sm border border-[#E8E0D0]/30 rounded px-3 py-1.5 hover:bg-[#E8E0D0]/10 transition-colors"
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
      {copied ? 'Copied!' : 'Copy main details'}
    </button>
  );
}
