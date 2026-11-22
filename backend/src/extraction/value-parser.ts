/**
 * Turns printed result values and reference ranges into structured data.
 *
 * Lab reports mix numbers ("13.2"), bounded numbers ("<5", "≥ 40"),
 * thousands separators ("1,50,000") and text ("Positive", "Nil"). The raw
 * text is always kept; a number is only extracted when it is unambiguous.
 */
import type { ValueComparator } from '../reports/entities/report-parameter.entity.js';
import type { ParsedValue, ReferenceRange } from './extraction.types.js';

/** A number with optional sign, thousands commas and decimals: "-1,234.5". */
const NUMBER = String.raw`[-+]?\d[\d,]*(?:\.\d+)?`;

/** Cells that mean "no value printed". */
const EMPTY_MARKERS = new Set(['', '-', '--', '—', '–']);

/** "13.2", "<5", "≥ 40", "1,50,000" — a whole cell that is one bounded number. */
const NUMERIC_VALUE = new RegExp(String.raw`^(<=|>=|≤|≥|<|>)?\s*(${NUMBER})$`);

/**
 * A high/low flag some labs print next to the value: "18.4 H", "3.1 (L)",
 * "250 HIGH", "18.4*". Removed only to read the number; raw text is kept.
 */
const TRAILING_FLAG = /\s*(?:\(?\b(?:H|L|HIGH|LOW)\b\)?|\*)$/i;

/**
 * "13 - 17", "13–17", "13 to 17", optionally followed by a unit. Also
 * "13 17": OCR often drops the dash, and two numbers in a range column can
 * only mean low and high.
 */
const RANGE_BETWEEN = new RegExp(
  String.raw`^(${NUMBER})(?:\s*(?:-|–|—|to)\s*|\s+)(${NUMBER})(?:\s+\S.*)?$`,
  'i',
);

/** "< 200", "<= 5", "Up to 5", "Below 10". */
const RANGE_UPPER = new RegExp(
  String.raw`^(?:<=|≤|<|up\s*to|upto|below|less\s+than)\s*(${NUMBER})(?:\s+\S.*)?$`,
  'i',
);

/** "> 40", ">= 60", "Above 40". */
const RANGE_LOWER = new RegExp(
  String.raw`^(?:>=|≥|>|above|more\s+than|greater\s+than)\s*(${NUMBER})(?:\s+\S.*)?$`,
  'i',
);

const COMPARATORS: Record<string, ValueComparator> = {
  '<': '<',
  '<=': '<=',
  '≤': '<=',
  '>': '>',
  '>=': '>=',
  '≥': '>=',
};

/** "1,50,000" → 150000. Commas are treated as thousands separators. */
function toNumber(text: string): number {
  return Number(text.replace(/,/g, ''));
}

/** Normalises a cell: trims it and returns null for "nothing printed". */
function cleanCell(raw: string | null | undefined): string | null {
  const text = raw?.trim() ?? '';
  return EMPTY_MARKERS.has(text) ? null : text;
}

/**
 * Parses a result cell.
 *
 * @example parseValue('13.2')     // { raw: '13.2', numeric: 13.2, comparator: null }
 * @example parseValue('<5')       // { raw: '<5', numeric: 5, comparator: '<' }
 * @example parseValue('18.4 H')   // { raw: '18.4 H', numeric: 18.4, comparator: null }
 * @example parseValue('Positive') // { raw: 'Positive', numeric: null, comparator: null }
 * @example parseValue('-')        // { raw: null, numeric: null, comparator: null }
 */
export function parseValue(rawCell: string | null | undefined): ParsedValue {
  const raw = cleanCell(rawCell);
  if (raw === null) return { raw: null, numeric: null, comparator: null };

  const match = NUMERIC_VALUE.exec(raw.replace(TRAILING_FLAG, ''));
  if (!match) return { raw, numeric: null, comparator: null };

  const [, comparator, number] = match;
  return {
    raw,
    numeric: toNumber(number),
    comparator: comparator ? COMPARATORS[comparator] : null,
  };
}

/**
 * Parses a reference-range cell into numeric bounds where possible.
 * Text ranges such as "Negative" keep their raw text with no bounds.
 *
 * @example parseReferenceRange('13.0 - 17.0') // { low: 13, high: 17 }
 * @example parseReferenceRange('< 200')       // { low: null, high: 200 }
 * @example parseReferenceRange('> 40')        // { low: 40, high: null }
 */
export function parseReferenceRange(rawCell: string | null | undefined): ReferenceRange {
  const raw = cleanCell(rawCell);
  if (raw === null) return { raw: null, low: null, high: null };

  const between = RANGE_BETWEEN.exec(raw);
  if (between) {
    return { raw, low: toNumber(between[1]), high: toNumber(between[2]) };
  }
  const upper = RANGE_UPPER.exec(raw);
  if (upper) return { raw, low: null, high: toNumber(upper[1]) };

  const lower = RANGE_LOWER.exec(raw);
  if (lower) return { raw, low: toNumber(lower[1]), high: null };

  return { raw, low: null, high: null };
}

/**
 * Decides whether a value lies outside its reference range.
 *
 * Returns null ("unknown") rather than guessing when the value or range is
 * not numeric, or the value is itself a bound such as "<5" (its exact
 * position relative to the range is unknown). Range bounds are inclusive.
 */
export function isOutOfRange(value: ParsedValue, range: ReferenceRange): boolean | null {
  if (value.numeric === null || value.comparator !== null) return null;
  if (range.low === null && range.high === null) return null;

  if (range.low !== null && value.numeric < range.low) return true;
  if (range.high !== null && value.numeric > range.high) return true;
  return false;
}
