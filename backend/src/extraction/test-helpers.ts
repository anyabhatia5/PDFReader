/**
 * Helpers for unit tests: build fake page text without needing a real PDF.
 * Not used by application code.
 */
import type { PageText, PositionedText } from './extraction.types.js';

const CHAR_WIDTH = 5;
const HEIGHT = 10;

/** One piece of text at (x, y), sized roughly like 10pt text. */
export function word(text: string, x: number, y: number): PositionedText {
  return { text, x, y, width: text.length * CHAR_WIDTH, height: HEIGHT };
}

/**
 * A table-like row: each entry is [text, x] placed on the same line y.
 * Use null text to leave a column empty.
 */
export function row(y: number, cells: Array<[string | null, number]>): PositionedText[] {
  return cells.filter(([text]) => text !== null).map(([text, x]) => word(text as string, x, y));
}

export function page(pageNumber: number, items: PositionedText[]): PageText {
  return { pageNumber, source: 'text', items };
}

/** Column x positions used by the table tests. */
export const COL = { name: 50, value: 250, unit: 350, range: 430 } as const;

/** A standard header line at y. */
export function header(y: number): PositionedText[] {
  return row(y, [
    ['Test', COL.name],
    ['Result', COL.value],
    ['Unit', COL.unit],
    ['Reference Range', COL.range],
  ]);
}

/** A standard result row at y. */
export function result(
  y: number,
  name: string,
  value: string | null,
  unit: string | null,
  range: string | null,
): PositionedText[] {
  return row(y, [
    [name, COL.name],
    [value, COL.value],
    [unit, COL.unit],
    [range, COL.range],
  ]);
}
