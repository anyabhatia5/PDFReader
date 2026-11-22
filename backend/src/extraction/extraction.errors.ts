/**
 * Errors raised by the extraction pipeline. They are plain classes (not HTTP
 * exceptions) so the pipeline knows nothing about HTTP; the reports layer
 * maps them to status codes.
 */

/** The file is not a PDF we can open: corrupted, truncated or encrypted. */
export class UnreadablePdfError extends Error {
  /** @param cause the underlying pdfjs error, kept for server logs. */
  constructor(reason: string, cause?: unknown) {
    super(reason, { cause });
    this.name = 'UnreadablePdfError';
  }
}

/** A page needed OCR, but the OCR engine could not be started. */
export class OcrUnavailableError extends Error {
  constructor(cause: unknown) {
    super('The OCR engine could not be started (its language data may still need downloading).', {
      cause,
    });
    this.name = 'OcrUnavailableError';
  }
}
