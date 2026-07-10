import postgres from 'postgres';

declare global {
  var __birdhausDb: ReturnType<typeof postgres> | undefined;
}

// Hosted providers (Neon, Vercel Postgres, Supabase, ...) require SSL; a local
// Postgres for dev usually doesn't support it at all.
function sslOptionFor(connectionString: string): 'require' | false {
  try {
    const { hostname } = new URL(connectionString);
    return hostname === 'localhost' || hostname === '127.0.0.1' ? false : 'require';
  } catch {
    return 'require';
  }
}

// Lazily created so `next build`'s route data collection (which imports every
// route module without a request context) doesn't crash when DATABASE_URL
// isn't set at build time. The connection is only opened on first real query.
function getClient(): ReturnType<typeof postgres> {
  if (globalThis.__birdhausDb) return globalThis.__birdhausDb;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. See .env.example for setup instructions.');
  }

  const client = postgres(connectionString, { ssl: sslOptionFor(connectionString), max: 5 });
  globalThis.__birdhausDb = client;
  return client;
}

type SqlClient = ReturnType<typeof postgres>;

// Reuse the connection across hot reloads / lambda invocations instead of opening a new pool per request.
export const sql: SqlClient = new Proxy(function sql() {} as unknown as SqlClient, {
  apply(_target, _thisArg, args) {
    return Reflect.apply(getClient(), null, args);
  },
  get(_target, prop) {
    return Reflect.get(getClient(), prop);
  },
});
