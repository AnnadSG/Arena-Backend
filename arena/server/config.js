export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? '',
  // Managed Postgres (Render, Railway, ...) usually needs TLS; local Docker does not.
  databaseSsl: process.env.DATABASE_SSL === 'true',
  aiDelayMs: Number(process.env.AI_DELAY_MS ?? 350),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
};
