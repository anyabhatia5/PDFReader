/**
 * Typed application settings, read once from environment variables.
 *
 * Every setting has a sensible local-development default so the app starts
 * with an unmodified `.env.example`. Invalid values (e.g. a non-numeric port)
 * fail fast at startup instead of causing confusing errors later.
 */

import path from 'node:path';

export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

export interface AppConfig {
  port: number;
  frontendOrigin: string;
  maxUploadBytes: number;
  /** Absolute path of the folder where original PDFs are stored. */
  uploadDir: string;
  database: DatabaseConfig;
}

/** Reads a positive integer from the environment, or throws a clear error. */
function readPositiveInt(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer, got "${raw}".`);
  }
  return value;
}

/** Builds the application config from environment variables. */
export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: readPositiveInt(env, 'PORT', 4000),
    frontendOrigin: env.FRONTEND_ORIGIN ?? 'http://localhost:3000',
    maxUploadBytes: readPositiveInt(env, 'MAX_UPLOAD_MB', 20) * 1024 * 1024,
    // Resolved against the backend folder, where npm runs the app from.
    // path.resolve produces the correct separator on every OS.
    uploadDir: path.resolve(process.cwd(), env.UPLOAD_DIR ?? 'uploads'),
    database: {
      host: env.DB_HOST ?? 'localhost',
      port: readPositiveInt(env, 'DB_PORT', 5433),
      username: env.DB_USER ?? 'pdfreader',
      password: env.DB_PASSWORD ?? 'pdfreader',
      database: env.DB_NAME ?? 'pdfreader',
    },
  };
}
