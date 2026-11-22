import {
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ExtractionErrorFilter } from './extraction-error.filter.js';
import type { ReportDetailDto, ReportSummaryDto, UploadResponseDto } from './reports.dto.js';
import { ReportsService } from './reports.service.js';

/**
 * HTTP endpoints under /api/reports.
 *
 *   POST /reports           upload a PDF (multipart field "file")
 *   GET  /reports           list all reports
 *   GET  /reports/:id       one report with its parameters
 *   GET  /reports/:id/file  the original PDF
 */
@Controller('reports')
@UseFilters(ExtractionErrorFilter)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /**
   * 201 with the new report, or 200 with `duplicate: true` and the stored
   * report when the same file was uploaded before. The size limit (413) is
   * enforced by the upload middleware configured in ReportsModule.
   */
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<UploadResponseDto> {
    const result = await this.reports.upload(file);
    response.status(result.duplicate ? HttpStatus.OK : HttpStatus.CREATED);
    return result;
  }

  @Get()
  findAll(): Promise<ReportSummaryDto[]> {
    return this.reports.findAll();
  }

  /** ParseUUIDPipe turns a malformed id into a 400 instead of a database error. */
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ReportDetailDto> {
    return this.reports.findOne(id);
  }

  /** Shown inline in the browser's PDF viewer. */
  @Get(':id/file')
  async file(@Param('id', ParseUUIDPipe) id: string): Promise<StreamableFile> {
    const { stream, filename } = await this.reports.openOriginalFile(id);
    return new StreamableFile(stream, {
      type: 'application/pdf',
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
    });
  }
}
