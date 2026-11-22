/**
 * Converts database entities into the API's response shapes (reports.dto.ts).
 */
import type { ReportParameter } from './entities/report-parameter.entity.js';
import type { Report } from './entities/report.entity.js';
import type { ParameterDto, ReportDetailDto, ReportSummaryDto } from './reports.dto.js';

/** Entity → list row. */
export function toSummaryDto(report: Report, parameterCount: number): ReportSummaryDto {
  return {
    id: report.id,
    reportIdentifier: report.reportIdentifier,
    identifierSource: report.identifierSource,
    originalFilename: report.originalFilename,
    pageCount: report.pageCount,
    extractionMethod: report.extractionMethod,
    status: report.status,
    parameterCount,
    createdAt: report.createdAt.toISOString(),
  };
}

/** Entity → parameter row. */
function toParameterDto(parameter: ReportParameter): ParameterDto {
  return {
    position: parameter.position,
    pageNumber: parameter.pageNumber,
    source: parameter.source,
    edited: parameter.editedAt
      ? { at: parameter.editedAt.toISOString(), original: parameter.original }
      : null,
    name: parameter.nameRaw,
    parameterDefinitionId: parameter.parameterDefinitionId,
    value: {
      raw: parameter.valueRaw,
      numeric: parameter.valueNumeric,
      comparator: parameter.valueComparator,
    },
    unit: parameter.unit,
    referenceRange: {
      raw: parameter.refRangeRaw,
      low: parameter.refLow,
      high: parameter.refHigh,
    },
    isAbnormal: parameter.isAbnormal,
  };
}

/** Entity with loaded parameters → full report. */
export function toDetailDto(report: Report): ReportDetailDto {
  const parameters = [...report.parameters].sort((a, b) => a.position - b.position);
  return {
    ...toSummaryDto(report, parameters.length),
    warnings: report.warnings,
    parameters: parameters.map(toParameterDto),
  };
}
