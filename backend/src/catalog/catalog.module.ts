import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service.js';

/** The parameter catalog shared by all reports. */
@Module({
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
