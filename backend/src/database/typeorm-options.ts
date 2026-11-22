import type { DataSourceOptions } from 'typeorm';
import type { DatabaseConfig } from '../config/app-config.js';

/**
 * Entities and migrations are listed explicitly (instead of file globs) so the
 * same options work from TypeScript sources, compiled output and tests.
 */
const ENTITIES: DataSourceOptions['entities'] = [];
const MIGRATIONS: DataSourceOptions['migrations'] = [];

/**
 * TypeORM options shared by the running app and the migration CLI.
 *
 * `synchronize` is deliberately off: the schema is only ever changed through
 * versioned migration files, never silently on application start.
 */
export function buildTypeOrmOptions(db: DatabaseConfig): DataSourceOptions {
  return {
    type: 'postgres',
    host: db.host,
    port: db.port,
    username: db.username,
    password: db.password,
    database: db.database,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    synchronize: false,
  };
}
