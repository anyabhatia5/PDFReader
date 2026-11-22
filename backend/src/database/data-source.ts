/**
 * Entry point for the TypeORM CLI (`npm run migration:run` and friends).
 *
 * The Nest app does not use this file; it builds the same options through
 * `buildTypeOrmOptions` inside AppModule.
 */
import fs from 'node:fs';
import { DataSource } from 'typeorm';
import { loadAppConfig } from '../config/app-config.js';
import { buildTypeOrmOptions } from './typeorm-options.js';

// The CLI runs outside Nest, so load backend/.env ourselves (built into Node).
if (fs.existsSync('.env')) {
  process.loadEnvFile('.env');
}

export default new DataSource(buildTypeOrmOptions(loadAppConfig().database));
