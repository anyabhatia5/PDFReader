import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { loadAppConfig, type DatabaseConfig } from './config/app-config.js';
import { buildTypeOrmOptions } from './database/typeorm-options.js';
import { HealthController } from './health/health.controller.js';
import { ReportsModule } from './reports/reports.module.js';

/**
 * Root module: wires configuration and the database connection, then pulls in
 * the feature modules.
 */
@Module({
  imports: [
    // Reads backend/.env into process.env, then exposes the typed AppConfig.
    ConfigModule.forRoot({ isGlobal: true, load: [loadAppConfig] }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        buildTypeOrmOptions(config.getOrThrow<DatabaseConfig>('database')),
    }),
    ReportsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
