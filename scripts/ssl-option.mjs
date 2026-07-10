export function sslOptionFor(connectionString) {
  try {
    const { hostname } = new URL(connectionString);
    return hostname === 'localhost' || hostname === '127.0.0.1' ? false : 'require';
  } catch {
    return 'require';
  }
}
