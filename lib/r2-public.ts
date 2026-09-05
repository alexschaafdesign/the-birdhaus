// Public base URL for files uploaded to R2 (flyers, band photos, ...).
// Server-only: route handlers read this to build/parse public object URLs.
// The fallback matches the production custom domain so a missing env var in a
// local shell still resolves the same public files.
export const R2_PUBLIC_BASE = (
  process.env.R2_PUBLIC_URL_BASE ?? 'https://images.thebirdhaus.org'
).replace(/\/$/, '');
