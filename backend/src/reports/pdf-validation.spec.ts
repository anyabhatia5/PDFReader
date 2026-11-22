import { BadRequestException, UnsupportedMediaTypeException } from '@nestjs/common';
import { assertIsPdf, decodeFilename } from './pdf-validation.js';

/** Minimal fake of a Multer upload. */
function upload(content: string | Buffer, originalname = 'report.pdf'): Express.Multer.File {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
  return { buffer, size: buffer.length, originalname } as Express.Multer.File;
}

describe('assertIsPdf', () => {
  it('accepts a file that starts with the PDF signature', () => {
    expect(() => assertIsPdf(upload('%PDF-1.7\n...'))).not.toThrow();
  });

  it('accepts a signature preceded by junk bytes, as the PDF spec allows', () => {
    expect(() => assertIsPdf(upload(`${'x'.repeat(100)}%PDF-1.4`))).not.toThrow();
  });

  it('rejects a missing file with 400', () => {
    expect(() => assertIsPdf(undefined)).toThrow(BadRequestException);
  });

  it('rejects an empty file with 400', () => {
    expect(() => assertIsPdf(upload(''))).toThrow(BadRequestException);
  });

  it('rejects a non-PDF with 415, even when it is named .pdf', () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    expect(() => assertIsPdf(upload(pngBytes, 'fake.pdf'))).toThrow(UnsupportedMediaTypeException);
  });
});

describe('decodeFilename', () => {
  it('restores UTF-8 names that were decoded as Latin-1', () => {
    const garbled = Buffer.from('rapport_é.pdf', 'utf8').toString('latin1');
    expect(decodeFilename(garbled)).toBe('rapport_é.pdf');
  });
});
