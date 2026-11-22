/**
 * Thin wrapper around pdfjs (Mozilla's PDF engine) for the three things the
 * pipeline needs: opening a PDF, reading a page's text layer with positions,
 * and rendering a page to an image for OCR.
 */
import { createCanvas } from '@napi-rs/canvas';
import { createRequire } from 'node:module';
import path from 'node:path';
import {
  getDocument,
  InvalidPDFException,
  PasswordException,
  VerbosityLevel,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from 'pdfjs-dist/legacy/build/pdf.mjs';
import { UnreadablePdfError } from './extraction.errors.js';
import type { PositionedText } from './extraction.types.js';

/**
 * Fonts bundled with pdfjs, needed to render standard fonts (Helvetica…)
 * faithfully. pdfjs requires forward slashes and a trailing "/" even on
 * Windows; Node's file APIs accept forward slashes on every OS.
 */
const STANDARD_FONTS_DIR = `${path
  .join(path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json')), 'standard_fonts')
  .replaceAll('\\', '/')}/`;

/**
 * Opens a PDF from memory.
 * @throws UnreadablePdfError if the file is corrupted or password-protected.
 */
export async function openPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  try {
    return await getDocument({
      // pdfjs takes ownership of the buffer it is given, so pass a copy.
      data: new Uint8Array(bytes),
      standardFontDataUrl: STANDARD_FONTS_DIR,
      verbosity: VerbosityLevel.ERRORS,
    }).promise;
  } catch (error) {
    if (error instanceof PasswordException) {
      throw new UnreadablePdfError('The PDF is password-protected.', error);
    }
    if (error instanceof InvalidPDFException) {
      throw new UnreadablePdfError('The PDF is corrupted or incomplete.', error);
    }
    throw new UnreadablePdfError('The PDF could not be opened.', error);
  }
}

/** Shape of the text items pdfjs returns (the subset we use). */
interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

/**
 * Reads the text layer of a page.
 *
 * pdfjs measures y from the bottom of the page to the text baseline; we
 * convert to "distance from the top to the middle of the text" to match OCR.
 */
export async function readTextLayer(page: PDFPageProxy): Promise<PositionedText[]> {
  const pageHeight = page.getViewport({ scale: 1 }).height;
  const content = await page.getTextContent();

  return content.items
    .filter((item): item is PdfTextItem & typeof item => 'str' in item && item.str.trim() !== '')
    .map((item) => {
      const [, , , fontHeight, x, baseline] = item.transform;
      const height = item.height || Math.abs(fontHeight);
      return {
        text: item.str,
        x,
        y: pageHeight - baseline - height / 2,
        width: item.width,
        height,
      };
    });
}

/**
 * Renders a page to a PNG image for OCR.
 * @param scale 1 = 72 DPI; 3 ≈ 216 DPI, enough for reliable OCR of small print.
 */
export async function renderPageToPng(page: PDFPageProxy, scale: number): Promise<Buffer> {
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  // pdfjs is typed for the browser's HTMLCanvasElement; @napi-rs/canvas is the
  // Node implementation pdfjs officially supports, so the cast is safe.
  await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise;
  return canvas.toBuffer('image/png');
}
