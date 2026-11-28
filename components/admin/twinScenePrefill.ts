// Shared by BandForm and AddBandModal: the "Prefill from Twin Scene" button.
// Looks the band up by name and fills only the fields that are still empty,
// so it never overwrites something typed in Birdhaus. A one-time copy: nothing
// links or syncs afterwards.

export interface PrefillTarget {
  instagram: string;
  bio: string;
  photo: string;
  twinsceneSlug: string;
}

export interface PrefillResult {
  values: PrefillTarget;
  message: string;
}

const LABELS: Record<keyof PrefillTarget, string | null> = {
  instagram: 'Instagram',
  bio: 'bio',
  photo: 'photo',
  twinsceneSlug: null, // not a visible field
};

export async function prefillFromTwinScene(name: string, current: PrefillTarget): Promise<PrefillResult> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Type the band name first.');

  const res = await fetch(`/api/admin/bands/twinscene/prefill?name=${encodeURIComponent(trimmed)}`);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `Lookup failed (${res.status})`);

  const values = { ...current };
  const filled: string[] = [];
  for (const key of Object.keys(LABELS) as (keyof PrefillTarget)[]) {
    const incoming = typeof body?.[key] === 'string' ? body[key].trim() : '';
    if (!incoming || current[key].trim()) continue;
    values[key] = incoming;
    const label = LABELS[key];
    if (label) filled.push(label);
  }

  return {
    values,
    message: filled.length
      ? `Copied ${filled.join(', ')} from Twin Scene. Review, then save.`
      : 'Found it on Twin Scene, but there was nothing new to copy.',
  };
}
