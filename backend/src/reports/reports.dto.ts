/**
 * JSON shapes returned by the reports API. These are deliberately separate
 * from the database entities, so internals (file hash, disk path) are never
 * exposed and the database can change without breaking the API.
 */
import type {
  ExtractionMethod,
  IdentifierSource,
  ReportStatus,
} from './entities/report.entity.js';
import type { ValueComparator } from './entities/report-parameter.entity.js';

/** A row in the reports list. */
export interface ReportSummaryDto {
  id: string;
  reportIdentifier: string;
  identifierSource: IdentifierSource;
  originalFilename: string;
  pageCount: number;
  extractionMethod: ExtractionMethod;
  status: ReportStatus;
  parameterCount: number;
  createdAt: string;
}

/** One parameter row as shown in the report table. */
export interface ParameterDto {
  position: number;
  pageNumber: number;
  name: string;
  parameterDefinitionId: number;
  value: { raw: string | null; numeric: number | null; comparator: ValueComparator | null };
  unit: string | null;
  referenceRange: { raw: string | null; low: number | null; high: number | null };
  isAbnormal: boolean | null;
}

/** A full report with its parameters in PDF order. */
export interface ReportDetailDto extends ReportSummaryDto {
  warnings: string[];
  parameters: ParameterDto[];
}

/** Response of POST /reports. */
export interface UploadResponseDto {
  /** true when the same file had already been uploaded; `report` is the stored one. */
  duplicate: boolean;
  report: ReportDetailDto;
}
