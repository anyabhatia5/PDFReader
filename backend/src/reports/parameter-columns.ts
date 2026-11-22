import type { ParsedRowCells } from '../extraction/extraction.types.js';
import type { ReportParameter } from './entities/report-parameter.entity.js';

/** The columns of a parameter row that hold its name and (parsed) cells. */
export type ParameterContentColumns = Pick<
  ReportParameter,
  | 'nameRaw'
  | 'valueRaw'
  | 'valueNumeric'
  | 'valueComparator'
  | 'unit'
  | 'refRangeRaw'
  | 'refLow'
  | 'refHigh'
  | 'isAbnormal'
>;

/**
 * Maps a parameter's name and parsed cells onto its database columns.
 *
 * Shared by upload (new rows) and manual editing, so both always store a
 * value the same way.
 */
export function toParameterColumns(name: string, parsed: ParsedRowCells): ParameterContentColumns {
  return {
    nameRaw: name,
    valueRaw: parsed.value.raw,
    valueNumeric: parsed.value.numeric,
    valueComparator: parsed.value.comparator,
    unit: parsed.unit,
    refRangeRaw: parsed.referenceRange.raw,
    refLow: parsed.referenceRange.low,
    refHigh: parsed.referenceRange.high,
    isAbnormal: parsed.isAbnormal,
  };
}
