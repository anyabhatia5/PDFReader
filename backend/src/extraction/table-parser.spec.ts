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

  describe('industrial / SCADA layouts', () => {
    it('joins Tag + Description into the name and combines Lo/Hi limit columns', () => {
      const header = row(100, [
        ['Tag', 45],
        ['Description', 100],
        ['Value', 250],
        ['Unit', 315],
        ['Lo Limit', 375],
        ['Hi Limit', 430],
        ['Status', 485],
      ]);
      const { rows } = parse(
        page(1, [
          ...header,
          ...row(120, [['FT-101', 45], ['Inlet Flow', 100], ['182.4', 250], ['m³/h', 315], ['120', 375], ['250', 430], ['NORMAL', 485]]),
          ...row(140, [['AT-102', 45], ['Turbidity', 100], ['14.6', 250], ['NTU', 315], ['10', 430], ['HI ALARM', 485]]),
          ...row(160, [['EM-402', 45], ['Power Factor', 100], ['0.93', 250], ['0.90', 375], ['NORMAL', 485]]),
          ...row(180, [['EM-401', 45], ['Energy', 100], ['2,184.5', 250], ['kWh', 315], ['---', 375], ['---', 430]]),
        ]),
      );

      expect(rows).toEqual([
        { pageNumber: 1, name: 'FT-101 Inlet Flow', value: '182.4', unit: 'm³/h', range: '120 - 250' },
        { pageNumber: 1, name: 'AT-102 Turbidity', value: '14.6', unit: 'NTU', range: '<= 10' },
        { pageNumber: 1, name: 'EM-402 Power Factor', value: '0.93', unit: null, range: '>= 0.90' },
        { pageNumber: 1, name: 'EM-401 Energy', value: '2,184.5', unit: 'kWh', range: null },
      ]);
    });

    it('takes the unit from the result column title and ignores applied / error / pass-fail columns', () => {
      const { rows } = parse(
        page(1, [
          ...row(100, [
            ['Test Point', 45],
            ['Applied (bar)', 160],
            ['Reading (bar)', 245],
            ['Error (bar)', 330],
            ['Tolerance (bar)', 410],
            ['Result', 495],
          ]),
          ...row(120, [['Point 3 (50 %)', 45], ['5.000', 160], ['5.031', 245], ['+0.031', 330], ['± 0.025', 410], ['Fail', 495]]),
        ]),
      );
      expect(rows).toEqual([{ pageNumber: 1, name: 'Point 3 (50 %)', value: '5.031', unit: 'bar', range: '± 0.025' }]);
    });

    it('ignores serial-number and test-method columns', () => {
      const { rows } = parse(
        page(1, [
          ...row(100, [['S.No', 45], ['Parameter', 75], ['Result', 215], ['Unit', 290], ['Permissible Limit', 360], ['Test Method', 455]]),
          ...row(120, [['1', 45], ['Turbidity', 75], ['0.8', 215], ['NTU', 290], ['Max 1', 360], ['IS 3025 (Part 10)', 455]]),
        ]),
      );
      expect(rows).toEqual([{ pageNumber: 1, name: 'Turbidity', value: '0.8', unit: 'NTU', range: 'Max 1' }]);
    });

    it('keeps "Normal Range (Min - Max)" as a single range column', () => {
      const { rows } = parse(
        page(1, [
          ...row(100, [['Parameter', 50], ['Reading', 250], ['Normal Range (Min - Max)', 350]]),
          ...row(120, [['Oil Temperature', 50], ['62', 250], ['40 - 85', 350]]),
        ]),
      );
      expect(rows).toEqual([{ pageNumber: 1, name: 'Oil Temperature', value: '62', unit: null, range: '40 - 85' }]);
    });
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
