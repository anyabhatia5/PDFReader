import { Module } from '@nestjs/common';
import { ExtractionService } from './extraction.service.js';
import { OcrService } from './ocr.service.js';

/** PDF reading and parsing. Knows nothing about HTTP or the database. */
@Module({
  providers: [ExtractionService, OcrService],
  exports: [ExtractionService],
})
export class ExtractionModule {}
