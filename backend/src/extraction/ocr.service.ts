import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import path from 'node:path';
import { createWorker, type Worker } from 'tesseract.js';
import { OcrUnavailableError } from './extraction.errors.js';
import type { PositionedText } from './extraction.types.js';

/** Result of recognising one page image. */
export interface OcrPageResult {
  words: PositionedText[];
  /** Average word confidence, 0-100. */
  confidence: number;
}

/**
 * Optical character recognition with Tesseract (compiled to WebAssembly, so
 * it runs the same on every OS without native installs).
 *
 * One worker is created on first use and reused: starting Tesseract takes a
 * second or two, recognising a page much less. The English language data is
 * downloaded once and cached in backend/.cache/tesseract.
 */
@Injectable()
export class OcrService implements OnModuleDestroy {
  private readonly logger = new Logger(OcrService.name);
  private worker: Promise<Worker> | null = null;

  /**
   * Recognises the words in a page image.
   * @param scale the render scale of the image, used to convert pixels back to PDF points.
   */
  async recognize(png: Buffer, scale: number): Promise<OcrPageResult> {
    const worker = await this.getWorker();
    const { data } = await worker.recognize(png, {}, { blocks: true });

    const words = (data.blocks ?? []).flatMap((block) =>
      block.paragraphs.flatMap((paragraph) => paragraph.lines.flatMap((line) => line.words)),
    );

    const confidence = words.length
      ? words.reduce((sum, word) => sum + word.confidence, 0) / words.length
      : 0;

    return {
      confidence,
      words: words.map(({ text, bbox }) => ({
        text,
        x: bbox.x0 / scale,
        y: (bbox.y0 + bbox.y1) / 2 / scale,
        width: (bbox.x1 - bbox.x0) / scale,
        height: (bbox.y1 - bbox.y0) / scale,
      })),
    };
  }

  /** Starts the worker once; if starting fails, the next call retries. */
  private getWorker(): Promise<Worker> {
    this.worker ??= createWorker('eng', undefined, {
      cachePath: path.resolve(process.cwd(), '.cache', 'tesseract'),
    }).catch((error: unknown) => {
      this.worker = null;
      this.logger.error('Failed to start Tesseract', error as Error);
      throw new OcrUnavailableError(error);
    });
    return this.worker;
  }

  async onModuleDestroy(): Promise<void> {
    const worker = await this.worker?.catch(() => null);
    await worker?.terminate();
  }
}
