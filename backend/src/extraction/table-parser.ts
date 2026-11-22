/**
 * Finds the result table in a report's lines and reads its rows.
 *
 * Works for lab reports and for industrial / SCADA reports (process
 * summaries, equipment test reports, water quality reports, calibration
 * certificates). How it works:
 *   - A header row is recognised by its column titles (e.g. "Test | Result |
 *     Unit | Reference Range" or "Tag | Description | Value | Unit | Lo Limit
 *     | Hi Limit | Status"). It fixes where each column starts.
 *   - Every following line's cells are assigned to columns by x position, so
 *     a missing unit or range simply leaves that column empty.
 *   - Separate low / high limit columns are combined into one range.
 *   - The layout carries over to the next page, so a table that continues
 *     across pages is read whether or not the header is repeated.
 *   - Lines that aren't result rows (section titles, footers, "Label: value"
 *     lines) are skipped; an end marker ("End of report", "Tested by")
 *     closes the table.
 */
import { toCanonicalKey } from '../catalog/canonical-key.js';
import type { Cell, RawTableRow, TextLine } from './extraction.types.js';

/**
 * What a column holds. `ignore` columns are recognised on purpose (status,
 * serial number, test method...) so they are never mistaken for data.
 */
type ColumnKey = 'name' | 'value' | 'unit' | 'range' | 'low' | 'high' | 'ignore';

interface Column {
  key: ColumnKey;
  x: number;
  /** Unit written in the title, e.g. "Reading (bar)" → "bar". */
  titleUnit: string | null;
}

/**
 * Header title patterns, checked IN THIS ORDER; the first match wins.
 *
 * - `low` / `high` must match the WHOLE title ("Lo Limit", "Min", "Hi Alarm
 *   Limit"), so "Normal Range (Min - Max)" stays a range column. They come
 *   before `ignore` ("alarm") and `range` ("limit").
 * - `ignore` comes next, so e.g. "Test Method" is not read as a name column
 *   and "Applied (bar)" is not read as the result.
 * - `range` comes before `value` so "Reference Value" is read as a range.
 */
const HEADER_PATTERNS: Array<[ColumnKey, RegExp]> = [
  ['low', /^(lo|low|lower|min|minimum)\.?(\s+alarm)?(\s+(limit|value|setpoint))?$/i],
  ['high', /^(hi|high|upper|max|maximum)\.?(\s+alarm)?(\s+(limit|value|setpoint))?$/i],
  [
    'ignore',
    /^(s\.?\s*no\.?|sr\.?\s*no\.?|sl\.?\s*no\.?|#)$|\b(status|alarm|flag|remarks?|method|error|deviation|applied|nominal|set\s*point|time|date)\b/i,
  ],
  [
    'range',
    /\b(reference|ref\.?|normal|biological|range|interval|limits?|acceptance|criteria|permissible|specification|spec|tolerance)\b/i,
  ],
  ['unit', /^(units?|uom|eng\.?\s*units?|e\.?u\.?)\b/i],
  ['value', /\b(result|results|observed|value|values|observation|reading|measured|actual|pv)\b/i],
  ['name', /\b(test|tests|parameter|parameters|investigation|analyte|description|tag|point|item|signal|characteristic)\b/i],
];

/** Lines that mark the end of the result table. */
const TABLE_END =
  /^(\**\s*end of (the )?report|interpretation|comments?\b|remarks?\b|notes?\b|conclusion|authori[sz]ed by|verified by|tested by|calibrated by|approved by|reviewed by|analy[sz]ed by|pathologist)/i;

/** "Report ID: X", "Page 1 of 2" — page furniture, never a result row. */
const LABEL_LIKE = /:\s|:$/;
const PAGE_FOOTER = /^page\s+\d+(\s+of\s+\d+)?$/i;

/** Cells that mean "nothing printed" in a limit column. */
const EMPTY_LIMIT = /^(-+|—|–|n\/?a)$/i;

/** Cells may start a little left of their header title (e.g. OCR jitter), in points. */
const COLUMN_TOLERANCE = 6;

/** Classifies one header title, given which single-use keys are already taken. */
function classifyTitle(title: string, taken: Set<ColumnKey>): ColumnKey {
  for (const [key, pattern] of HEADER_PATTERNS) {
    // `name` and `ignore` may appear several times (e.g. "Tag" + "Description");
    // every other kind of column is used once, the leftmost match winning.
    const reusable = key === 'name' || key === 'ignore';
    if ((reusable || !taken.has(key)) && pattern.test(title)) return key;
  }
  return 'ignore';
}

/** Recognises a header line; returns its columns, or null if it isn't one. */
export function detectHeader(line: TextLine): Column[] | null {
  const taken = new Set<ColumnKey>();
  const columns = line.cells.map((cell): Column => {
    const key = classifyTitle(cell.text, taken);
    taken.add(key);
    const titleUnit = /\(([^()]+)\)\s*$/.exec(cell.text)?.[1].trim() ?? null;
    return { key, x: cell.x, titleUnit };
  });

  // A table needs at least a name column and a result column.
  return taken.has('name') && taken.has('value') ? columns : null;
}

/** Picks the column a cell falls under: the right-most column starting at or before it. */
function columnFor(cell: Cell, columns: Column[]): ColumnKey {
  let chosen = columns[0];
  for (const column of columns) {
    if (column.x - COLUMN_TOLERANCE <= cell.x) chosen = column;
  }
  return chosen.key;
}

/**
 * Builds a range text from separate limit columns, in the same notation the
 * range parser understands: "2.0" + "8.0" → "2.0 - 8.0", only a low limit →
 * ">= 0.90", only a high limit → "<= 10".
 */
function combineLimits(low: string | undefined, high: string | undefined): string | null {
  const lo = low && !EMPTY_LIMIT.test(low) ? low : null;
  const hi = high && !EMPTY_LIMIT.test(high) ? high : null;
  if (lo && hi) return `${lo} - ${hi}`;
  if (lo) return `>= ${lo}`;
  if (hi) return `<= ${hi}`;
  return null;
}

/** Maps a line's cells to a row; returns null if the line isn't a result row. */
function toRow(line: TextLine, columns: Column[]): RawTableRow | null {
  const values: Partial<Record<ColumnKey, string>> = {};
  for (const cell of line.cells) {
    const key = columnFor(cell, columns);
    // Several cells in one kind of column (e.g. Tag + Description) are joined.
    values[key] = values[key] ? `${values[key]} ${cell.text}` : cell.text;
  }

  const name = values.name?.trim();
  // The name must give a catalog key ("—" or "***" is decoration, not a name).
  if (!name || !toCanonicalKey(name) || LABEL_LIKE.test(name) || PAGE_FOOTER.test(name)) {
    return null;
  }

  const row: RawTableRow = {
    pageNumber: line.pageNumber,
    name,
    value: values.value ?? null,
    unit: values.unit ?? null,
    range: values.range ?? combineLimits(values.low, values.high),
  };

  // A name with nothing beside it is a section title ("BIOCHEMISTRY").
  if (row.value === null && row.unit === null && row.range === null) return null;

  // No unit cell: fall back to a unit written in the result column's title.
  row.unit ??= columns.find((column) => column.key === 'value')?.titleUnit ?? null;
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
