/**
 * Data shapes passed between the steps of the extraction pipeline:
 *
 *   PDF ─► PageText (positioned words) ─► TextLine (rows of cells)
 *       ─► table rows ─► ExtractedParameter (parsed values) ─► ExtractionResult
 *
 * All coordinates are PDF points (1/72 inch) measured from the TOP-LEFT of the
 * page, whatever the source (text layer or OCR), so later steps don't care
 * how the text was obtained.
 */
import type { ExtractionMethod } from '../reports/entities/report.entity.js';
import type { ValueComparator } from '../reports/entities/report-parameter.entity.js';

/** A word or phrase on a page with its bounding box. */
export interface PositionedText {
  text: string;
  /** Left edge. */
  x: number;
  /** Vertical centre of the text. */
  y: number;
  width: number;
  height: number;
}

/** All text found on one page, and whether it came from the text layer or OCR. */
export interface PageText {
  pageNumber: number;
  source: 'text' | 'ocr';
  items: PositionedText[];
  /** Average OCR word confidence (0-100); only set for OCR pages. */
  ocrConfidence?: number;
}

/** A run of text on one line that belongs together (one table cell). */
export interface Cell {
  text: string;
  x: number;
  xEnd: number;
}

/** One visual line of a page, split into cells by large horizontal gaps. */
export interface TextLine {
  pageNumber: number;
  cells: Cell[];
  /** All cells joined by spaces; handy for label searches. */
  text: string;
}

/** A parsed result value, e.g. "<5" → { comparator: '<', numeric: 5 }. */
export interface ParsedValue {
  raw: string | null;
  numeric: number | null;
  comparator: ValueComparator | null;
}

/** A parsed reference range, e.g. "13.0 - 17.0" → { low: 13, high: 17 }. */
export interface ReferenceRange {
  raw: string | null;
  low: number | null;
  high: number | null;
}

/** A row's result, unit and range cells as text (null = empty). */
export interface RowCells {
  value: string | null;
  unit: string | null;
  range: string | null;
}

/** A row's cells after parsing (see row-parser.ts). */
export interface ParsedRowCells {
  value: ParsedValue;
  unit: string | null;
  referenceRange: ReferenceRange;
  /** null when it cannot be decided (non-numeric value or range). */
  isAbnormal: boolean | null;
}

/** A table row, as text, before values are parsed. */
export interface RawTableRow extends RowCells {
  pageNumber: number;
  name: string;
}

/** One fully parsed parameter, ready to be stored. */
export interface ExtractedParameter extends ParsedRowCells {
  /** 1-based order in the report. */
  position: number;
  pageNumber: number;
  name: string;
}

/** Everything extracted from one PDF. */
export interface ExtractionResult {
  pageCount: number;
  method: ExtractionMethod;
  /** Report / sample ID found in the PDF, or null if none was found. */
  reportIdentifier: string | null;
  parameters: ExtractedParameter[];
  /** Human-readable notes, shown in the UI (e.g. "Page 2 was scanned"). */
  warnings: string[];
}
