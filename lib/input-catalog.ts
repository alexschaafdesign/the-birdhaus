// The fixed vocabulary of gear a band can list as an input need for a show. This
// is the aggregation key set for the per-show "total needed" rollup, so it's a
// controlled list (a dropdown), not free text — two bands' "vocal mic" only sum
// into one total if they're the exact same key.
//
// Deliberately mirrors Twin Scene's stage-plot catalog vocabulary
// (twinscene/lib/stagePlotCatalog.ts) — same keys/labels — so the two stay
// legible together and a future "import this band's Twin Scene stage plot" path
// maps 1:1. It is NOT imported from Twin Scene: the repos are separate, on
// separate databases (see ../twinscene/ARCHITECTURE.md), and there's no public
// stage-plot API to call. Keep the keys in sync by hand if Twin Scene's change.
//
// `houseLabel` marks backline the Birdhaus commonly provides (kit, amps); the
// total flags these so Alex can see at a glance whether the house gear covers the
// peak need or a band has to bring their own.

export interface InputCatalogItem {
  /** Stored in show_input_items.item_type and used as the aggregation key. */
  key: string;
  label: string;
  /** Present when the venue commonly provides this (house kit / amp). The short
   *  noun phrase shown as a flag on the total, e.g. "house guitar amp". */
  houseLabel?: string;
}

export const INPUT_CATALOG: InputCatalogItem[] = [
  { key: 'vocal_mic', label: 'Vocal mic' },
  { key: 'guitar_amp', label: 'Guitar amp', houseLabel: 'house guitar amp' },
  { key: 'bass_amp', label: 'Bass amp', houseLabel: 'house bass amp' },
  { key: 'acoustic_guitar', label: 'Acoustic guitar' },
  { key: 'drum_kit', label: 'Drum kit', houseLabel: 'house kit' },
  { key: 'keys', label: 'Keyboard / keys' },
  { key: 'horn', label: 'Horn / wind' },
  { key: 'di_box', label: 'DI box' },
  { key: 'instrument_mic', label: 'Instrument mic' },
  { key: 'mic_stand', label: 'Mic stand' },
  { key: 'monitor', label: 'Monitor wedge' },
  { key: 'power', label: 'Power drop' },
  { key: 'other', label: 'Other' },
];

export const OTHER_INPUT_KEY = 'other';

const BY_KEY = new Map(INPUT_CATALOG.map((c) => [c.key, c]));

// Catalog entry for a stored item_type. Unknown keys (e.g. one removed later)
// fall back to the "Other" entry so an old row still renders.
export function inputCatalogItem(key: string): InputCatalogItem {
  return BY_KEY.get(key) ?? BY_KEY.get(OTHER_INPUT_KEY) ?? INPUT_CATALOG[0];
}

export function isInputCatalogKey(key: unknown): key is string {
  return typeof key === 'string' && BY_KEY.has(key);
}

// Sort index for a key, so totals list in catalog order (unknown keys last).
export function inputCatalogOrder(key: string): number {
  const i = INPUT_CATALOG.findIndex((c) => c.key === key);
  return i === -1 ? INPUT_CATALOG.length : i;
}
