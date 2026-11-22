import { buildLines } from './line-builder.js';
import { page, word } from './test-helpers.js';

describe('buildLines', () => {
  it('groups text into lines from top to bottom', () => {
    const lines = buildLines(page(1, [word('second', 50, 120), word('first', 50, 100)]));
    expect(lines.map((line) => line.text)).toEqual(['first', 'second']);
  });

  it('keeps slightly misaligned words (e.g. OCR jitter) on the same line', () => {
    const lines = buildLines(page(1, [word('Hemoglobin', 50, 100), word('13.2', 250, 102)]));
    expect(lines).toHaveLength(1);
  });

  it('splits a line into cells at large gaps and joins words at small gaps', () => {
    // "Total" ends at x=75; "Cholesterol" starts 3pt later (a word space).
    const [line] = buildLines(
      page(1, [word('Total', 50, 100), word('Cholesterol', 78, 100), word('180', 250, 100)]),
    );
    expect(line.cells.map((cell) => cell.text)).toEqual(['Total Cholesterol', '180']);
    expect(line.text).toBe('Total Cholesterol 180');
  });

  it('ignores whitespace-only items', () => {
    const lines = buildLines(page(1, [word('  ', 50, 100), word('Text', 60, 100)]));
    expect(lines.map((line) => line.text)).toEqual(['Text']);
  });

  it('records the page number on every line', () => {
    const lines = buildLines(page(3, [word('a', 50, 100), word('b', 50, 200)]));
    expect(lines.every((line) => line.pageNumber === 3)).toBe(true);
  });
});
