/**
 * Parses the text cells of one table row into structured values.
 *
 * Used both for rows read from a PDF and for rows a user edits or adds, so a
 * corrected value is interpreted exactly like an extracted one.
 */
import type { ParsedValue, ReferenceRange } from './extraction.types.js';
import { isOutOfRange, parseReferenceRange, parseValue } from './value-parser.js';

/** A row's result, unit and range cells as text (null = empty). */
export interface RowCells {
  value: string | null;
  unit: string | null;
  range: string | null;
}

export interface ParsedRowCells {
  value: ParsedValue;
  unit: string | null;
  referenceRange: ReferenceRange;
  /** null when it cannot be decided (non-numeric value or range). */
  isAbnormal: boolean | null;
}

export function parseRowCells(cells: RowCells): ParsedRowCells {
  const value = parseValue(cells.value);
  const referenceRange = parseReferenceRange(cells.range);
  return {
    value,
    unit: cells.unit?.trim() || null,
    referenceRange,
    isAbnormal: isOutOfRange(value, referenceRange),
  };
}
