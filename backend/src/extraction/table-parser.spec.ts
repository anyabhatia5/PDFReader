import { buildLines } from './line-builder.js';
import { parseParameterTable } from './table-parser.js';
import { COL, header, page, result, row, word } from './test-helpers.js';
import type { PageText } from './extraction.types.js';

/** Runs the parser over one or more fake pages. */
function parse(...pages: PageText[]) {
  return parseParameterTable(pages.flatMap(buildLines));
}

describe('parseParameterTable', () => {
  it('reads every row under the header, in order', () => {
    const { rows, headerFound } = parse(
      page(1, [
        word('City Lab', 50, 40),
        ...header(100),
        ...result(120, 'Hemoglobin', '13.2', 'g/dL', '13.0 - 17.0'),
        ...result(140, 'WBC Count', '7,500', 'cells/µL', '4,000 - 11,000'),
      ]),
    );

    expect(headerFound).toBe(true);
    expect(rows).toEqual([
      { pageNumber: 1, name: 'Hemoglobin', value: '13.2', unit: 'g/dL', range: '13.0 - 17.0' },
      { pageNumber: 1, name: 'WBC Count', value: '7,500', unit: 'cells/µL', range: '4,000 - 11,000' },
    ]);
  });

  it('leaves missing unit, range or value empty instead of shifting columns', () => {
    const { rows } = parse(
      page(1, [
        ...header(100),
        ...result(120, 'HIV I & II', 'Non Reactive', null, null),
        ...result(140, 'Vitamin D', null, 'ng/mL', '30 - 100'),
      ]),
    );
    expect(rows).toEqual([
      { pageNumber: 1, name: 'HIV I & II', value: 'Non Reactive', unit: null, range: null },
      { pageNumber: 1, name: 'Vitamin D', value: null, unit: 'ng/mL', range: '30 - 100' },
    ]);
  });

  it('ignores text before the header (lab name, patient details)', () => {
    const { rows } = parse(
      page(1, [
        ...row(60, [['Patient Name: A. Kumar', COL.name], ['Report ID: R-1', COL.unit]]),
        ...header(100),
        ...result(120, 'Glucose', '92', 'mg/dL', '70 - 100'),
      ]),
    );
    expect(rows.map((r) => r.name)).toEqual(['Glucose']);
  });

  it('skips section titles and page footers inside the table', () => {
    const { rows } = parse(
      page(1, [
        ...header(100),
        word('BIOCHEMISTRY', COL.name, 120),
        ...result(140, 'Glucose', '92', 'mg/dL', '70 - 100'),
        word('Page 1 of 2', COL.name, 800),
      ]),
    );
    expect(rows.map((r) => r.name)).toEqual(['Glucose']);
  });

  it('continues a table onto the next page when the header is repeated', () => {
    const { rows } = parse(
      page(1, [...header(100), ...result(120, 'Glucose', '92', 'mg/dL', '70 - 100')]),
      page(2, [...header(100), ...result(120, 'Urea', '24', 'mg/dL', '15 - 40')]),
    );
    expect(rows.map((r) => [r.name, r.pageNumber])).toEqual([
      ['Glucose', 1],
      ['Urea', 2],
    ]);
  });

  it('continues a table onto the next page when the header is NOT repeated', () => {
    const { rows } = parse(
      page(1, [...header(100), ...result(120, 'Glucose', '92', 'mg/dL', '70 - 100')]),
      page(2, [
        ...row(40, [['Report ID: R-1', COL.name], ['Page 2', COL.range]]),
        ...result(100, 'Urea', '24', 'mg/dL', '15 - 40'),
      ]),
    );
    expect(rows.map((r) => r.name)).toEqual(['Glucose', 'Urea']);
  });

  it('stops at an end-of-report marker', () => {
    const { rows } = parse(
      page(1, [
        ...header(100),
        ...result(120, 'Glucose', '92', 'mg/dL', '70 - 100'),
        word('*** End of Report ***', COL.name, 140),
        ...row(160, [['Dr. Rao', COL.name], ['MD Pathology', COL.value]]),
      ]),
    );
    expect(rows.map((r) => r.name)).toEqual(['Glucose']);
  });

  it('reports when no header is found', () => {
    const { rows, headerFound } = parse(page(1, [word('Just a letter, not a report.', 50, 100)]));
    expect(headerFound).toBe(false);
    expect(rows).toEqual([]);
  });

  it('recognises alternative header wording and ignores unknown columns', () => {
    const { rows } = parse(
      page(1, [
        ...row(100, [
          ['Investigation', 50],
          ['Observed Value', 200],
          ['Flag', 300],
          ['Units', 350],
          ['Biological Reference Interval', 430],
        ]),
        ...row(120, [
          ['TSH', 50],
          ['5.8', 200],
          ['H', 300],
          ['µIU/mL', 350],
          ['0.4 - 4.0', 430],
        ]),
      ]),
    );
    expect(rows).toEqual([{ pageNumber: 1, name: 'TSH', value: '5.8', unit: 'µIU/mL', range: '0.4 - 4.0' }]);
  });
});
