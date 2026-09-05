// Pure URL helpers for Song Club pins — no DB imports, so client components
// can use them too (lib/club-board.ts pulls in the postgres client).

export function isValidHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

// Turns a pasted share URL into an iframe-able player src, or null when the
// host isn't allowlisted / the URL shape can't be embedded (the UI then falls
// back to a plain link). The allowlist matters: members must not be able to
// iframe arbitrary origins into a page other members are logged in to.
export function embedSrcFor(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  const host = parsed.hostname;

  // Samply — player pages embed as-is.
  if (host === 'samply.app' || host === 'www.samply.app') return url;

  // Bandcamp — only the EmbeddedPlayer URLs are frameable.
  if ((host === 'bandcamp.com' || host.endsWith('.bandcamp.com')) &&
      parsed.pathname.startsWith('/EmbeddedPlayer')) {
    return url;
  }

  // SoundCloud player widget.
  if (host === 'w.soundcloud.com' && parsed.pathname.startsWith('/player')) return url;

  // Spotify — open.spotify.com/track/ID -> open.spotify.com/embed/track/ID.
  if (host === 'open.spotify.com') {
    return parsed.pathname.startsWith('/embed/')
      ? url
      : `https://open.spotify.com/embed${parsed.pathname}`;
  }

  // YouTube — watch/short URLs -> privacy-enhanced embed URL.
  if (host === 'www.youtube.com' || host === 'youtube.com') {
    if (parsed.pathname.startsWith('/embed/')) return url;
    const id = parsed.searchParams.get('v');
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === 'youtu.be') {
    const id = parsed.pathname.slice(1).split('/')[0];
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === 'www.youtube-nocookie.com' && parsed.pathname.startsWith('/embed/')) return url;

  // Vimeo — vimeo.com/12345 -> player.vimeo.com/video/12345.
  if (host === 'player.vimeo.com') return url;
  if (host === 'vimeo.com' || host === 'www.vimeo.com') {
    const id = parsed.pathname.slice(1).split('/')[0];
    return /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
  }

  // Google Drive — file/d/ID/view -> file/d/ID/preview.
  if (host === 'drive.google.com') {
    const match = parsed.pathname.match(/^\/file\/d\/([^/]+)/);
    return match ? `https://drive.google.com/file/d/${match[1]}/preview` : null;
  }

  return null;
}

// Samply embeds are full app pages (folders with browsable track lists), not
// fixed-height player strips — the UI gives them a tall panel so the whole
// folder is usable inline.
export function isSamplyEmbed(src: string): boolean {
  try {
    const host = new URL(src).hostname;
    return host === 'samply.app' || host === 'www.samply.app';
  } catch {
    return false;
  }
}

// Video embeds want a 16:9 box; everything else gets a fixed player-strip
// height.
export function isVideoEmbed(src: string): boolean {
  try {
    const host = new URL(src).hostname;
    return (
      host === 'www.youtube-nocookie.com' ||
      host === 'www.youtube.com' ||
      host === 'player.vimeo.com' ||
      host === 'drive.google.com'
    );
  } catch {
    return false;
  }
}
