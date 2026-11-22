import { Injectable } from '@nestjs/common';
import type { PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { ExtractionMethod } from '../reports/entities/report.entity.js';
import type {
  ExtractedParameter,
  ExtractionResult,
  PageText,
  PositionedText,
  RawTableRow,
} from './extraction.types.js';
import { buildLines } from './line-builder.js';
import { OcrService } from './ocr.service.js';
import { openPdf, readTextLayer, renderPageToPng } from './pdf-reader.js';
import { findReportIdentifier } from './report-identifier.js';
import { parseParameterTable } from './table-parser.js';
import { isOutOfRange, parseReferenceRange, parseValue } from './value-parser.js';

/** A page with fewer readable characters than this is treated as scanned. */
const MIN_TEXT_CHARS = 20;

/** Render scale for OCR (3 × 72 DPI ≈ 216 DPI). */
const OCR_SCALE = 3;

/** Below this average confidence, OCR output is flagged for manual checking. */
const LOW_OCR_CONFIDENCE = 70;

/**
 * Runs the full pipeline on one PDF:
 *   open → per page: text layer, or OCR if the page is scanned
 *        → lines/cells → report ID + result table → parsed parameters.
 */
@Injectable()
export class ExtractionService {
  constructor(private readonly ocr: OcrService) {}

  /** @throws UnreadablePdfError, OcrUnavailableError */
  async extract(fileBytes: Uint8Array): Promise<ExtractionResult> {
    const pdf = await openPdf(fileBytes);
    try {
      const pages: PageText[] = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        pages.push(await this.readPage(page, pageNumber));
        page.cleanup();
      }

      const lines = pages.flatMap(buildLines);
      const { rows, headerFound } = parseParameterTable(lines);
      const parameters = rows.map(toExtractedParameter);

      return {
        pageCount: pdf.numPages,
        method: extractionMethod(pages),
        reportIdentifier: findReportIdentifier(lines),
        parameters,
        warnings: collectWarnings(pages, parameters, headerFound),
      };
    } finally {
      // Frees the parsed document and its worker resources.
      await pdf.loadingTask.destroy();
    }
  }

  /**
   * Reads one page from its text layer, falling back to OCR when the page
   * has (almost) no text, i.e. it is a scanned image. OCR's result is only
   * kept if it actually finds more text, so a nearly empty text page (just a
   * footer, say) is not mislabelled as scanned.
   */
  private async readPage(page: PDFPageProxy, pageNumber: number): Promise<PageText> {
    const items = await readTextLayer(page);
    const textChars = countChars(items);
    if (textChars >= MIN_TEXT_CHARS) {
      return { pageNumber, source: 'text', items };
    }

    const png = await renderPageToPng(page, OCR_SCALE);
    const { words, confidence } = await this.ocr.recognize(png, OCR_SCALE);
    if (countChars(words) <= textChars) {
      return { pageNumber, source: 'text', items };
    }
    return { pageNumber, source: 'ocr', items: words, ocrConfidence: confidence };
  }
}

function countChars(items: PositionedText[]): number {
  return items.reduce((sum, item) => sum + item.text.trim().length, 0);
}

/** Parses a raw table row into its stored form. */
function toExtractedParameter(row: RawTableRow, index: number): ExtractedParameter {
  const value = parseValue(row.value);
  const referenceRange = parseReferenceRange(row.range);
  return {
    position: index + 1,
    pageNumber: row.pageNumber,
    name: row.name,
    value,
    unit: row.unit?.trim() || null,
    referenceRange,
    isAbnormal: isOutOfRange(value, referenceRange),
  };
}

/** "text" or "ocr" when every page used one method, otherwise "mixed". */
function extractionMethod(pages: PageText[]): ExtractionMethod {
  const sources = new Set(pages.map((page) => page.source));
  if (sources.size > 1) return 'mixed';
  return sources.has('ocr') ? 'ocr' : 'text';
}

/** Human-readable notes about anything the user should double-check. */
function collectWarnings(
  pages: PageText[],
  parameters: ExtractedParameter[],
  headerFound: boolean,
): string[] {
  const warnings: string[] = [];

  for (const page of pages.filter((p) => p.source === 'ocr')) {
    const confidence = Math.round(page.ocrConfidence ?? 0);
    warnings.push(
      confidence < LOW_OCR_CONFIDENCE
        ? `Page ${page.pageNumber} is scanned; OCR confidence is low (${confidence}%), please verify the values.`
        : `Page ${page.pageNumber} is scanned; its text was read with OCR (${confidence}% confidence).`,
    );
  }

  if (!headerFound) {
    warnings.push('No result table header (e.g. "Test | Result | Unit | Reference Range") was found.');
  }

  const missingValues = parameters.filter((p) => p.value.raw === null).length;
  if (missingValues > 0) {
    warnings.push(`${missingValues} parameter(s) have no result value printed.`);
  }

  return warnings;
}
