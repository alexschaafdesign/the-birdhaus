'use client';

import { useState } from 'react';
import type { ShowHubData } from '@/lib/show-hub';

// "Venue & info" — the whole venue rundown, consolidated into one continuous
// read (intro + every section flowing together like Alex's advance email)
// rather than a stack of per-topic accordions. Collapsed by default to the
// first few lines with a fade so it's obviously "there's more, tap to read".
export default function HubInfo({
  introHtml,
  sections,
  isAdmin,
}: {
  introHtml: string;
  sections: ShowHubData['infoSections'];
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hasBody = Boolean(introHtml) || sections.length > 0;

  return (
    <section className="border border-[#E8E0D0]/15 rounded-xl p-5 space-y-3">
      <h2 className="text-xs uppercase tracking-[0.12em] text-[#c8a26a] font-semibold">
        Venue &amp; info
      </h2>

      {hasBody && (
        <>
          {/* Collapsed: clamp the height and fade the bottom out via a mask so
              the cut-off reads as "more below" on any background. */}
          <div
            className={
              open
                ? 'space-y-4'
                : 'space-y-4 max-h-32 overflow-hidden [mask-image:linear-gradient(to_bottom,#000_55%,transparent)] [-webkit-mask-image:linear-gradient(to_bottom,#000_55%,transparent)]'
            }
          >
            {introHtml && (
              <div
                className="hub-prose text-sm text-[#E8E0D0]/80 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: introHtml }}
              />
            )}
            {sections.map((s) => (
              <div key={s.title} className="space-y-1">
                <h3 className="text-sm font-semibold text-[#E8E0D0]">{s.title}</h3>
                <div
                  className="hub-prose text-sm text-[#E8E0D0]/80 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: s.html }}
                />
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="text-sm font-medium text-[#c8a26a] hover:text-[#E8E0D0] transition-colors"
          >
            {open ? 'Show less' : 'Read the full venue rundown …'}
          </button>
        </>
      )}

      {isAdmin && (
        <p className="text-xs pt-1">
          <a
            href="/admin/settings"
            className="text-[#E8E0D0]/45 hover:text-[#E8E0D0] underline"
          >
            Edit this text (admin) →
          </a>
        </p>
      )}
    </section>
  );
}
