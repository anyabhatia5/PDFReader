import type { DataSourceOptions } from 'typeorm';
import { ParameterDefinition } from '../catalog/parameter-definition.entity.js';
import type { DatabaseConfig } from '../config/app-config.js';
import { InitialSchema1795331643353 } from './migrations/1795331643353-InitialSchema.js';
import { ReportParameter } from '../reports/entities/report-parameter.entity.js';
import { Report } from '../reports/entities/report.entity.js';

/**
 * Entities and migrations are listed explicitly (instead of file globs) so the
 * same options work from TypeScript sources, compiled output and tests.
 */
const ENTITIES: DataSourceOptions['entities'] = [Report, ReportParameter, ParameterDefinition];
const MIGRATIONS: DataSourceOptions['migrations'] = [InitialSchema1795331643353];

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
    // Use gen_random_uuid(), built into Postgres 13+, so no extension is needed.
    uuidExtension: 'pgcrypto',
  };
}
