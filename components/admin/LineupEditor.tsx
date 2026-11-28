'use client';

import { useState, type DragEvent, type KeyboardEvent } from 'react';
import BandNameInput, { type BandMatch, type TwinSceneBandOption } from './BandNameInput';
import { FORM } from '@/components/night/form';

const inputClass = FORM.field;

// The slice of ShowForm's Band this editor reads. Profile fields (photo, bio,
// Instagram) are edited in the band profile modal, not here.
export interface LineupBand {
  bandId: number | null;
  name: string;
  photo: string;
  email: string;
  payout: string;
}

// The lineup as one compact row per band, headliner first. Empty slots (up to
// the bill size) are the band typeahead; a picked band collapses to its name,
// with amber dots only for what's still missing. "details" opens this night's
// contact fields under the row. Rows drag to reorder (or arrow keys on the
// handle).
export default function LineupEditor({
  bands,
  billSize,
  showContacts,
  twinSceneBands,
  onNameChange,
  onSelect,
  onAddNew,
  onEditProfile,
  onContactChange,
  onRemove,
  onMove,
}: {
  bands: LineupBand[];
  // Empty slots up to the bill size stay; only extra ones can be removed.
  billSize: number;
  // Contact email + payout are the Overview tab's (see ShowForm saveBandContacts).
  showContacts: boolean;
  twinSceneBands: TwinSceneBandOption[];
  onNameChange: (index: number, name: string) => void;
  onSelect: (index: number, match: BandMatch) => void;
  onAddNew: (index: number, name: string) => void;
  onEditProfile: (index: number) => void;
  onContactChange: (index: number, field: 'email' | 'payout', value: string) => void;
  onRemove: (index: number) => void;
  onMove: (from: number, to: number) => void;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  // Dragging starts only from the handle, so text in an open row stays selectable.
  const [armed, setArmed] = useState<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  function endDrag() {
    setArmed(null);
    setDragFrom(null);
    setDragOver(null);
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= bands.length || from === to) return;
    onMove(from, to);
    // Keep the open row open as it moves.
    setOpenIndex((open) => {
      if (open === null) return open;
      if (open === from) return to;
      if (from < open && to >= open) return open - 1;
      if (from > open && to <= open) return open + 1;
      return open;
    });
  }

  function handleKey(e: KeyboardEvent, index: number) {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(index, index - 1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(index, index + 1);
    }
  }

  return (
    <ol className="border-t border-surface-ink/20">
      {bands.map((band, index) => {
        const filled = Boolean(band.name.trim());
        const linked = band.bandId != null;
        const open = openIndex === index && filled;
        const missing = [
          showContacts && !band.email.trim() && 'email',
          showContacts && !band.payout.trim() && 'venmo',
          linked && !band.photo.trim() && 'photo',
        ].filter(Boolean) as string[];
        const over = dragOver === index && dragFrom !== null && dragFrom !== index;

        return (
          <li
            key={index}
            draggable={armed === index}
            onDragStart={(e: DragEvent) => {
              setDragFrom(index);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e: DragEvent) => {
              if (dragFrom === null) return;
              e.preventDefault();
              setDragOver(index);
            }}
            onDrop={(e: DragEvent) => {
              e.preventDefault();
              if (dragFrom !== null) move(dragFrom, index);
              endDrag();
            }}
            onDragEnd={endDrag}
            className={`border-b ${dragFrom === index ? 'opacity-40' : ''} ${
              over && dragFrom! > index ? 'border-t-2 border-t-surface-ink' : ''
            } ${over && dragFrom! < index ? 'border-b-2 border-b-surface-ink' : 'border-b-surface-ink/20'}`}
          >
            <div className="flex items-center gap-3 py-2.5">
              <button
                type="button"
                aria-label={`Reorder ${band.name || `slot ${index + 1}`} (arrow keys move it)`}
                title="Drag to reorder"
                onPointerDown={() => setArmed(index)}
                onPointerUp={() => setArmed(null)}
                onKeyDown={(e) => handleKey(e, index)}
                className="cursor-grab touch-none px-0.5 text-surface-ink/40 hover:text-surface-ink active:cursor-grabbing"
              >
                ⠿
              </button>
              <span className="w-4 shrink-0 text-data-caption-13 tabular-nums text-surface-ink/60">{index + 1}</span>

              {linked ? (
                <>
                  {band.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={band.photo} alt="" className="h-8 w-8 shrink-0 object-cover" />
                  ) : (
                    <span aria-hidden className="h-8 w-8 shrink-0 bg-surface-paper-shade" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-body-3 font-bold">{band.name}</div>
                  </div>
                </>
              ) : (
                <div className="min-w-0 flex-1">
                  <BandNameInput
                    placeholder={index === 0 ? 'Headliner: search bands or add a new one' : 'Search bands or add a new one'}
                    value={band.name}
                    onChange={(value) => onNameChange(index, value)}
                    onSelect={(match) => onSelect(index, match)}
                    onAddNew={(name) => onAddNew(index, name)}
                    twinSceneBands={twinSceneBands}
                    className={`${inputClass} w-full`}
                  />
                  {filled && (
                    <p className="mt-1 text-data-caption-13 text-surface-ink/60">
                      Not in the band list yet: becomes a new band on save.
                    </p>
                  )}
                </div>
              )}

              {filled && (
                <>
                  {missing.length > 0 && (
                    <span className="hidden items-center gap-2 text-data-caption-13 text-surface-ink/70 sm:flex">
                      {missing.map((m) => (
                        <span key={m} className="flex items-center gap-1">
                          <span aria-hidden className="h-1.5 w-1.5 bg-spectrum-amber" />
                          {m}
                        </span>
                      ))}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpenIndex(open ? null : index)}
                    aria-expanded={open}
                    className="text-data-caption-13 underline underline-offset-2 hover:text-accent-red"
                  >
                    {open ? 'close' : 'details'}
                  </button>
                </>
              )}
              {(filled || index >= billSize) && (
                <button
                  type="button"
                  onClick={() => {
                    setOpenIndex(null);
                    onRemove(index);
                  }}
                  aria-label={`Remove ${band.name || `slot ${index + 1}`}`}
                  className="px-1 text-body-3 text-surface-ink/40 hover:text-accent-red"
                >
                  ×
                </button>
              )}
            </div>

            {open && (
              <div className="space-y-2 pb-3 pl-9 sm:pl-[4.5rem]">
                {missing.length > 0 && (
                  <p className="flex flex-wrap gap-2 text-data-caption-13 text-surface-ink/70 sm:hidden">
                    Missing: {missing.join(', ')}
                  </p>
                )}
                {showContacts && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      type="email"
                      placeholder="Contact email (gets the Portal invite)"
                      value={band.email}
                      onChange={(e) => onContactChange(index, 'email', e.target.value)}
                      className={`${inputClass} w-full`}
                      aria-label={`${band.name} contact email`}
                    />
                    <input
                      placeholder="Venmo handle (private)"
                      value={band.payout}
                      onChange={(e) => onContactChange(index, 'payout', e.target.value)}
                      className={`${inputClass} w-full`}
                      aria-label={`${band.name} payout handle`}
                    />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => (linked ? onEditProfile(index) : onAddNew(index, band.name))}
                  className="text-data-caption-13 text-surface-ink/70 underline underline-offset-2 hover:text-accent-red"
                >
                  {linked ? 'Edit profile: photo, bio, Instagram' : 'Set up profile: photo, bio, Instagram'}
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
