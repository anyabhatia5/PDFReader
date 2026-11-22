/**
 * Rebuilds visual lines and table cells from positioned words.
 *
 * PDFs (and OCR) give us loose pieces of text with coordinates, not rows and
 * columns. We recover the layout in two passes:
 *   1. pieces whose vertical centres are close belong to the same line;
 *   2. within a line, pieces separated by a large horizontal gap belong to
 *      different cells (columns), small gaps are just spaces between words.
 */
import type { Cell, PageText, PositionedText, TextLine } from './extraction.types.js';

/** Two pieces are on the same line if their centres differ by less than this share of the text height. */
const SAME_LINE_TOLERANCE = 0.5;

/** A gap wider than this many text heights starts a new cell. A normal word space is ~0.3. */
const CELL_GAP = 1.0;

/** Fallback height for zero-height items, in points. */
const DEFAULT_HEIGHT = 10;

/** Splits one line's pieces (sorted left to right) into cells. */
function splitIntoCells(pieces: PositionedText[]): Cell[] {
  const cells: Cell[] = [];
  for (const piece of pieces) {
    const last = cells.at(-1);
    const gap = last ? piece.x - last.xEnd : Infinity;
    const height = piece.height || DEFAULT_HEIGHT;

    if (last && gap <= height * CELL_GAP) {
      last.text = `${last.text} ${piece.text}`;
      last.xEnd = Math.max(last.xEnd, piece.x + piece.width);
    } else {
      cells.push({ text: piece.text, x: piece.x, xEnd: piece.x + piece.width });
    }
  }
  // Collapse the double spaces that joining can create.
  return cells.map((cell) => ({ ...cell, text: cell.text.replace(/\s+/g, ' ').trim() }));
}

/**
 * Groups a page's text into lines (top to bottom), each split into cells
 * (left to right).
 */
export function buildLines(page: PageText): TextLine[] {
  const pieces = page.items
    .filter((item) => item.text.trim() !== '')
    .sort((a, b) => a.y - b.y || a.x - b.x);

  // Pass 1: group pieces into lines by vertical position.
  const groups: PositionedText[][] = [];
  for (const piece of pieces) {
    const current = groups.at(-1);
    const anchor = current?.[0];
    // Use the TALLER of the two: OCR reports tiny boxes for glyphs such as
    // "-" or ".", which must not shrink the tolerance and split the line.
    const height = Math.max(piece.height || DEFAULT_HEIGHT, anchor?.height || DEFAULT_HEIGHT);

    if (anchor && Math.abs(piece.y - anchor.y) <= height * SAME_LINE_TOLERANCE) {
      current.push(piece);
    } else {
      groups.push([piece]);
    }
  }

  // Pass 2: split each line into cells.
  return groups.map((group) => {
    const cells = splitIntoCells([...group].sort((a, b) => a.x - b.x));
    return {
      pageNumber: page.pageNumber,
      y: group[0].y,
      cells,
      text: cells.map((cell) => cell.text).join(' '),
    };
  });
}
