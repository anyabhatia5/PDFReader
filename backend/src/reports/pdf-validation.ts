import { BadRequestException, UnsupportedMediaTypeException } from '@nestjs/common';

/** Every PDF starts with "%PDF-" within its first 1024 bytes (PDF spec). */
const PDF_SIGNATURE = Buffer.from('%PDF-');
const SIGNATURE_WINDOW = 1024;

/**
 * Checks that an uploaded file is present, non-empty and really a PDF.
 *
 * The browser-supplied file name and MIME type are easy to fake, so the
 * decision is made on the file's own bytes ("magic number").
 *
 * @throws BadRequestException (400) when no file or an empty file was sent
 * @throws UnsupportedMediaTypeException (415) when the file is not a PDF
 */
export function assertIsPdf(file: Express.Multer.File | undefined): asserts file is Express.Multer.File {
  if (!file) {
    throw new BadRequestException('No file was uploaded. Send the PDF in a form field named "file".');
  }
  if (file.size === 0) {
    throw new BadRequestException('The uploaded file is empty.');
  }
  if (!file.buffer.subarray(0, SIGNATURE_WINDOW).includes(PDF_SIGNATURE)) {
    throw new UnsupportedMediaTypeException('Only PDF files are accepted.');
  }
}

/**
 * Multer decodes file names as Latin-1, which garbles non-English names
 * ("rapport_é.pdf"); browsers send them as UTF-8. Re-decode them.
 */
export function decodeFilename(originalName: string): string {
  return Buffer.from(originalName, 'latin1').toString('utf8');
}
