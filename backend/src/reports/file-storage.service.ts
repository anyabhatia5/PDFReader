import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, type ReadStream } from 'node:fs';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Stores original PDFs on local disk (folder set by UPLOAD_DIR).
 *
 * Files are named by their SHA-256 hash, so the same content always maps to
 * the same file name: writing it twice is harmless, and user-supplied file
 * names never reach the file system (no path-traversal risk).
 */
@Injectable()
export class FileStorageService {
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = config.getOrThrow<string>('uploadDir');
  }

  /** Saves the file and returns its path relative to the upload folder. */
  async save(bytes: Uint8Array, sha256: string): Promise<string> {
    const relativePath = `${sha256}.pdf`;
    await mkdir(this.root, { recursive: true });
    await writeFile(path.join(this.root, relativePath), bytes);
    return relativePath;
  }

  /** Opens a stored file for streaming. */
  async open(relativePath: string): Promise<ReadStream> {
    const absolutePath = path.join(this.root, path.basename(relativePath));
    try {
      await access(absolutePath);
    } catch {
      throw new NotFoundException('The original PDF file is no longer available.');
    }
    return createReadStream(absolutePath);
  }
}
