'use client';

import { useEffect } from 'react';

// Opens the set a #fragment points at (a collapsed <details>) on load and on
// in-page hash changes, so links like /shows/BH-260904#BH-260904-2
// land on an open set rather than its one-line summary. A #band-slug alias
// (#joe-kaplow) points at a marker whose data-set names the set's id.
export function OpenOnHash() {
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      const target = id ? document.getElementById(id) : null;
      const alias = target instanceof HTMLElement ? target.dataset.set : undefined;
      const el = alias ? document.getElementById(alias) : target;
      if (el instanceof HTMLDetailsElement && !el.open) {
        el.open = true;
        el.scrollIntoView();
      }
    };
    open();
    window.addEventListener('hashchange', open);
    return () => window.removeEventListener('hashchange', open);
  }, []);
  return null;
}
