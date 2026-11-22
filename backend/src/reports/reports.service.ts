import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import type { ReadStream } from 'node:fs';
import { DataSource, QueryFailedError, type Repository } from 'typeorm';
import { toCanonicalKey } from '../catalog/canonical-key.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { ExtractionService } from '../extraction/extraction.service.js';
import type { ExtractionResult } from '../extraction/extraction.types.js';
import { ReportParameter } from './entities/report-parameter.entity.js';
import { Report } from './entities/report.entity.js';
import { FileStorageService } from './file-storage.service.js';
import { assertIsPdf, decodeFilename } from './pdf-validation.js';
import type { ReportDetailDto, ReportSummaryDto, UploadResponseDto } from './reports.dto.js';
import { toDetailDto, toSummaryDto } from './reports.mapper.js';

/** Postgres error code for a unique-constraint violation. */
const UNIQUE_VIOLATION = '23505';

/**
 * Upload, storage and retrieval of reports.
 *
 * Upload flow:
 *   validate → hash → already stored? return it → extract → save file
 *   → one transaction: catalog entries + report + its parameters
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @InjectRepository(Report) private readonly reports: Repository<Report>,
    private readonly dataSource: DataSource,
    private readonly extraction: ExtractionService,
    private readonly catalog: CatalogService,
    private readonly storage: FileStorageService,
  ) {}

  /**
   * Handles an uploaded file.
   * @throws 400 / 415 for invalid uploads; extraction errors propagate
   *         (UnreadablePdfError → 422, OcrUnavailableError → 503).
   */
  async upload(file: Express.Multer.File | undefined): Promise<UploadResponseDto> {
    assertIsPdf(file);
    const fileSha256 = createHash('sha256').update(file.buffer).digest('hex');

    // Same bytes uploaded before: return the stored report, don't re-process.
    const existing = await this.findByHash(fileSha256);
    if (existing) return { duplicate: true, report: existing };

    const extraction = await this.extraction.extract(file.buffer);
    const filePath = await this.storage.save(file.buffer, fileSha256);

    try {
      const id = await this.saveReport(extraction, {
        fileSha256,
        filePath,
        originalFilename: decodeFilename(file.originalname),
      });
      return { duplicate: false, report: await this.findOne(id) };
    } catch (error) {
      // Two identical uploads at the same moment: the database's unique
      // constraint lets only one in; the other returns the winner.
      if (isUniqueViolation(error, 'UQ_reports_file_sha256')) {
        const winner = await this.findByHash(fileSha256);
        if (winner) return { duplicate: true, report: winner };
      }
      throw error;
    }
  }

  /** All reports, newest first, with their parameter counts. */
  async findAll(): Promise<ReportSummaryDto[]> {
    const reports = await this.reports.find({ order: { createdAt: 'DESC' } });

    // One grouped query for all counts, instead of loading every parameter.
    const counts: Array<{ reportId: string; count: string }> = await this.dataSource
      .getRepository(ReportParameter)
      .createQueryBuilder('parameter')
      .select('parameter.reportId', 'reportId')
      .addSelect('COUNT(*)', 'count')
      .groupBy('parameter.reportId')
      .getRawMany();
    const countByReport = new Map(counts.map((row) => [row.reportId, Number(row.count)]));

    return reports.map((report) => toSummaryDto(report, countByReport.get(report.id) ?? 0));
  }

  /** One report with its parameters. @throws NotFoundException */
  async findOne(id: string): Promise<ReportDetailDto> {
    const report = await this.reports.findOne({ where: { id }, relations: { parameters: true } });
    if (!report) throw new NotFoundException(`Report ${id} was not found.`);
    return toDetailDto(report);
  }

  /** Stream of the original PDF, plus the name to download it as. */
  async openOriginalFile(id: string): Promise<{ stream: ReadStream; filename: string }> {
    const report = await this.reports.findOneBy({ id });
    if (!report) throw new NotFoundException(`Report ${id} was not found.`);
    return { stream: await this.storage.open(report.filePath), filename: report.originalFilename };
  }

  private async findByHash(fileSha256: string): Promise<ReportDetailDto | null> {
    const report = await this.reports.findOne({
      where: { fileSha256 },
      relations: { parameters: true },
    });
    return report ? toDetailDto(report) : null;
  }

  /** Writes the report and its parameters atomically; returns the new id. */
  private async saveReport(
    extraction: ExtractionResult,
    file: { fileSha256: string; filePath: string; originalFilename: string },
  ): Promise<string> {
    const { identifier, identifierSource } = resolveIdentifier(extraction.reportIdentifier);
    const hasParameters = extraction.parameters.length > 0;

    const warnings = [...extraction.warnings];
    if (identifierSource === 'generated') {
      warnings.unshift(`No report / sample ID was found in the PDF; generated ID ${identifier}.`);
    }
    if (!hasParameters) {
      warnings.unshift('No parameters could be extracted from this PDF.');
    }

    return this.dataSource.transaction(async (manager) => {
      const definitionIds = await this.catalog.resolveDefinitionIds(
        manager,
        extraction.parameters.map((parameter) => parameter.name),
      );

      const report = await manager.save(
        manager.create(Report, {
          reportIdentifier: identifier,
          identifierSource,
          ...file,
          pageCount: extraction.pageCount,
          extractionMethod: extraction.method,
          status: hasParameters ? 'completed' : 'no_parameters_found',
          warnings,
        }),
      );

      await manager.insert(
        ReportParameter,
        extraction.parameters.map((parameter) => ({
          reportId: report.id,
          parameterDefinitionId: definitionIds.get(toCanonicalKey(parameter.name)),
          position: parameter.position,
          pageNumber: parameter.pageNumber,
          nameRaw: parameter.name,
          valueRaw: parameter.value.raw,
          valueNumeric: parameter.value.numeric,
          valueComparator: parameter.value.comparator,
          unit: parameter.unit,
          refRangeRaw: parameter.referenceRange.raw,
          refLow: parameter.referenceRange.low,
          refHigh: parameter.referenceRange.high,
          isAbnormal: parameter.isAbnormal,
        })),
      );

      this.logger.log(
        `Stored report ${identifier} (${extraction.parameters.length} parameters, ${extraction.method})`,
      );
      return report.id;
    });
  }
}

/**
 * Uses the ID printed in the PDF, or generates one such as
 * "AUTO-20261122-3fa9c1" (date + random suffix) when none was found.
 */
function resolveIdentifier(found: string | null): {
  identifier: string;
  identifierSource: 'pdf' | 'generated';
} {
  if (found) return { identifier: found, identifierSource: 'pdf' };
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return { identifier: `AUTO-${date}-${randomBytes(3).toString('hex')}`, identifierSource: 'generated' };
}

/** True when a query failed on the given unique constraint. */
function isUniqueViolation(error: unknown, constraint: string): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const driverError = error.driverError as { code?: string; constraint?: string };
  return driverError.code === UNIQUE_VIOLATION && driverError.constraint === constraint;
}
