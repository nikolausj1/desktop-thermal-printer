import postgres from "postgres";

// Server-side only. Never import this from a client component.
//
// The site talks to the queue's database functions directly, through
// Supabase's connection pooler in transaction mode, as the papertelegram_site
// role. That role can execute the public queue functions and the dashboard
// read and nothing else (see migration 20261028010000). Direct connections
// are neither metered nor restricted by Supabase, unlike the API gateway,
// which the free plan shuts off entirely when a quota is exceeded.

export class DbError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "DbError";
  }
}

type Sql = ReturnType<typeof postgres>;

declare global {
  // One client per server instance, kept across hot reloads in development.
  var paperTelegramSql: Sql | undefined;
}

export function db(): Sql {
  if (!globalThis.paperTelegramSql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new DbError("DATABASE_URL is not configured on this server.");
    globalThis.paperTelegramSql = postgres(url, {
      ssl: "require",
      // The pooler's transaction mode cannot track named prepared statements.
      prepare: false,
      max: 2,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return globalThis.paperTelegramSql;
}

export function asDbError(error: unknown): DbError {
  if (error instanceof DbError) return error;
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const message = typeof record.message === "string" ? record.message : String(error);
  return new DbError(message, typeof record.code === "string" ? record.code : undefined);
}
