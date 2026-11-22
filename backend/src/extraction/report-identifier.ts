/**
 * Finds the report / sample identifier printed in the PDF.
 *
 * Looks for labels such as "Report ID", "Sample ID", "Specimen No",
 * "Accession No", "Lab No" or "Barcode" followed by a value. The value must
 * contain a digit, so "Sample ID: Pending" or a stray word is not accepted.
 * "Patient ID" is deliberately not matched: it identifies a person, not a report.
 */
import type { TextLine } from './extraction.types.js';

const IDENTIFIER_LABEL =
  /\b(?:report|sample|specimen|accession|lab|barcode)\s*(?:id|no|number|#)\.?\s*[:#-]?\s*([A-Z0-9][A-Z0-9\-/_.]*)/gi;

/** Returns the first identifier found (top of the first page first), or null. */
export function findReportIdentifier(lines: TextLine[]): string | null {
  for (const line of lines) {
    for (const match of line.text.matchAll(IDENTIFIER_LABEL)) {
      const value = match[1].replace(/[.]+$/, ''); // drop a trailing full stop
      if (/\d/.test(value)) return value;
    }
  }
  return null;
}
