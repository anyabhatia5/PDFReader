import { findReportIdentifier } from './report-identifier.js';
import type { TextLine } from './extraction.types.js';

/** Builds lines from plain strings; positions don't matter here. */
function lines(...texts: string[]): TextLine[] {
  return texts.map((text, i) => ({ pageNumber: 1, y: i * 20, cells: [], text }));
}

describe('findReportIdentifier', () => {
  it.each([
    ['Report ID: LR-2026-0001', 'LR-2026-0001'],
    ['Sample ID : S123456', 'S123456'],
    ['Specimen No. 88/2026', '88/2026'],
    ['Accession #A77812', 'A77812'],
    ['Lab No: 4521.', '4521'],
    ['Patient Name: Asha Rao    Sample ID: SMP-0042', 'SMP-0042'],
  ])('finds the ID in "%s"', (text, expected) => {
    expect(findReportIdentifier(lines(text))).toBe(expected);
  });

  it('returns the first ID when several appear', () => {
    expect(findReportIdentifier(lines('Report ID: R-1', 'Sample ID: S-2'))).toBe('R-1');
  });

  it('does not treat a patient ID as the report ID', () => {
    expect(findReportIdentifier(lines('Patient ID: P-12345'))).toBeNull();
  });

  it('ignores labels whose value contains no digit', () => {
    expect(findReportIdentifier(lines('Sample ID: Pending'))).toBeNull();
  });

  it('returns null when no ID is printed', () => {
    expect(findReportIdentifier(lines('City Lab', 'Hemoglobin 13.2 g/dL'))).toBeNull();
  });
});
