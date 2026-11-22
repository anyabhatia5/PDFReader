import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogModule } from '../catalog/catalog.module.js';
import { ExtractionModule } from '../extraction/extraction.module.js';
import { ReportParameter } from './entities/report-parameter.entity.js';
import { Report } from './entities/report.entity.js';
import { FileStorageService } from './file-storage.service.js';
import { ReportEditorService } from './report-editor.service.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Report, ReportParameter]),
    // With no `dest` set, uploads are kept in memory (they are hashed and
    // parsed anyway). Capped at MAX_UPLOAD_MB; larger files get a 413.
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        limits: { fileSize: config.getOrThrow<number>('maxUploadBytes'), files: 1 },
      }),
    }),
    ExtractionModule,
    CatalogModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService, ReportEditorService, FileStorageService],
})
export class ReportsModule {}
