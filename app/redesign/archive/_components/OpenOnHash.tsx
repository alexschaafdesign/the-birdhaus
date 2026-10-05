'use client';

import { useEffect } from 'react';

// Opens the set a #fragment points at (a collapsed <details>) on load and on
// in-page hash changes, so links like /redesign/archive/BH-260904#joe-kaplow
// land on an open set rather than its one-line summary.
export function OpenOnHash() {
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      const el = id ? document.getElementById(id) : null;
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
