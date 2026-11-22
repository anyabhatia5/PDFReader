/**
 * Finds the result table in a report's lines and reads its rows.
 *
 * How it works:
 *   - A header row is recognised by its column titles (e.g. "Test", "Result",
 *     "Unit", "Reference Range"). It fixes where each column starts.
 *   - Every following line's cells are assigned to columns by x position, so
 *     a missing unit or range simply leaves that column empty.
 *   - The layout carries over to the next page, so a table that continues
 *     across pages is read whether or not the header is repeated.
 *   - Lines that aren't result rows (section titles, footers, "Label: value"
 *     lines) are skipped; an end marker ("End of report", "Interpretation")
 *     closes the table.
 */
import type { Cell, RawTableRow, TextLine } from './extraction.types.js';

type ColumnKey = 'name' | 'value' | 'unit' | 'range' | 'other';

interface Column {
  key: ColumnKey;
  x: number;
}

/**
 * Header title patterns, checked in this order. "range" comes before
 * "value" so that "Reference Value" is read as the range column.
 */
const HEADER_PATTERNS: Array<[Exclude<ColumnKey, 'other'>, RegExp]> = [
  ['range', /\b(reference|ref\.?|normal|biological|range|interval)\b/i],
  ['unit', /^units?$/i],
  ['value', /\b(result|results|observed|value|values|observation)\b/i],
  ['name', /\b(test|tests|parameter|parameters|investigation|analyte|description)\b/i],
];

/** Lines that mark the end of the result table. */
const TABLE_END = /^(\**\s*end of (the )?report|interpretation|comments?\b|remarks?\b|notes?\b|authori[sz]ed by|verified by|pathologist)/i;

/** "Report ID: X", "Page 1 of 2" — page furniture, never a result row. */
const LABEL_LIKE = /:\s|:$/;
const PAGE_FOOTER = /^page\s+\d+(\s+of\s+\d+)?$/i;

/** Cells may start a little left of their header title (e.g. OCR jitter), in points. */
const COLUMN_TOLERANCE = 6;

/** Recognises a header line; returns its columns, or null if it isn't one. */
export function detectHeader(line: TextLine): Column[] | null {
  const used = new Set<ColumnKey>();
  const columns = line.cells.map((cell): Column => {
    const match = HEADER_PATTERNS.find(([key, pattern]) => !used.has(key) && pattern.test(cell.text));
    const key = match?.[0] ?? 'other';
    used.add(key);
    return { key, x: cell.x };
  });

  // A table needs at least a name column and a result column.
  return used.has('name') && used.has('value') ? columns : null;
}

/** Picks the column a cell falls under: the right-most column starting at or before it. */
function columnFor(cell: Cell, columns: Column[]): ColumnKey {
  let chosen = columns[0];
  for (const column of columns) {
    if (column.x - COLUMN_TOLERANCE <= cell.x) chosen = column;
  }
  return chosen.key;
}

/** Maps a line's cells to a row; returns null if the line isn't a result row. */
function toRow(line: TextLine, columns: Column[]): RawTableRow | null {
  const values: Partial<Record<ColumnKey, string>> = {};
  for (const cell of line.cells) {
    const key = columnFor(cell, columns);
    // Two cells in one column (e.g. a split name) are joined back together.
    values[key] = values[key] ? `${values[key]} ${cell.text}` : cell.text;
  }

  const name = values.name?.trim();
  if (!name || LABEL_LIKE.test(name) || PAGE_FOOTER.test(name)) return null;

  const row: RawTableRow = {
    pageNumber: line.pageNumber,
    name,
    value: values.value ?? null,
    unit: values.unit ?? null,
    range: values.range ?? null,
  };

  // A name with nothing beside it is a section title ("BIOCHEMISTRY").
  if (row.value === null && row.unit === null && row.range === null) return null;
  return row;
}

/** Result of reading the table: its rows, and whether a header was ever found. */
export interface TableParseResult {
  rows: RawTableRow[];
  headerFound: boolean;
}

/** Reads all result rows from the report's lines (all pages, in order). */
export function parseParameterTable(lines: TextLine[]): TableParseResult {
  const rows: RawTableRow[] = [];
  let columns: Column[] | null = null;
  let headerFound = false;

  for (const line of lines) {
    const header = detectHeader(line);
    if (header) {
      columns = header;
      headerFound = true;
      continue;
    }
    if (!columns) continue;

    if (TABLE_END.test(line.text)) {
      columns = null; // a later header may start another table
      continue;
    }

    const row = toRow(line, columns);
    if (row) rows.push(row);
  }

  return { rows, headerFound };
}
