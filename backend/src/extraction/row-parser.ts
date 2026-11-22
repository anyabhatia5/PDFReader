/**
 * Parses the text cells of one table row into structured values.
 *
 * Used both for rows read from a PDF and for rows a user edits or adds, so a
 * corrected value is interpreted exactly like an extracted one.
 */
import type { ParsedRowCells, RowCells } from './extraction.types.js';
import { isOutOfRange, parseReferenceRange, parseValue } from './value-parser.js';

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
