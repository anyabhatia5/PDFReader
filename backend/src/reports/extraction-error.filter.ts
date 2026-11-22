import {
  Catch,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { OcrUnavailableError, UnreadablePdfError } from '../extraction/extraction.errors.js';

/**
 * Translates extraction errors into HTTP responses, keeping the extraction
 * code free of HTTP concerns:
 *   UnreadablePdfError  → 422 Unprocessable Entity (corrupted / encrypted file)
 *   OcrUnavailableError → 503 Service Unavailable (try again later)
 */
@Catch(UnreadablePdfError, OcrUnavailableError)
export class ExtractionErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(ExtractionErrorFilter.name);

  catch(error: UnreadablePdfError | OcrUnavailableError, host: ArgumentsHost): void {
    const status =
      error instanceof UnreadablePdfError
        ? HttpStatus.UNPROCESSABLE_ENTITY
        : HttpStatus.SERVICE_UNAVAILABLE;

    this.logger.warn(`${error.message} (cause: ${String((error.cause as Error)?.message ?? 'n/a')})`);
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(status)
      .json({ statusCode: status, message: error.message, error: error.name });
  }
}
