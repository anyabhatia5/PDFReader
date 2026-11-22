import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  type Relation,
} from 'typeorm';
import { ReportParameter } from './report-parameter.entity.js';

/** Where the report identifier came from: the PDF, generated, or typed in by a user. */
export type IdentifierSource = 'pdf' | 'generated' | 'manual';

/** How the text was obtained: PDF text layer, OCR, or both (per page). */
export type ExtractionMethod = 'text' | 'ocr' | 'mixed';

/** Outcome of extraction. Unreadable files are rejected and never stored. */
export type ReportStatus = 'completed' | 'no_parameters_found';

/**
 * One uploaded PDF and the report-level facts extracted from it.
 * Its parameters (any number of them) live in `report_parameters`.
 */
@Entity('reports')
@Unique('UQ_reports_file_sha256', ['fileSha256'])
@Check('CHK_reports_identifier_source', `"identifier_source" IN ('pdf', 'generated', 'manual')`)
@Check('CHK_reports_extraction_method', `"extraction_method" IN ('text', 'ocr', 'mixed')`)
@Check('CHK_reports_status', `"status" IN ('completed', 'no_parameters_found')`)
export class Report {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_reports' })
  id: string;

  /**
   * Report / sample ID printed in the PDF, or a generated fallback.
   * Indexed for lookups but not unique: two different files may carry the
   * same ID (e.g. a re-scan), and duplicates are detected by file hash.
   */
  @Index('IDX_reports_report_identifier')
  @Column({ name: 'report_identifier', type: 'text' })
  reportIdentifier: string;

  @Column({ name: 'identifier_source', type: 'varchar', length: 16 })
  identifierSource: IdentifierSource;

  @Column({ name: 'original_filename', type: 'text' })
  originalFilename: string;

  /** SHA-256 of the file bytes. Unique, so the same PDF is stored only once. */
  @Column({ name: 'file_sha256', type: 'char', length: 64 })
  fileSha256: string;

  /** Path of the stored original, relative to the upload folder. */
  @Column({ name: 'file_path', type: 'text' })
  filePath: string;

  @Column({ name: 'page_count', type: 'integer' })
  pageCount: number;

  @Column({ name: 'extraction_method', type: 'varchar', length: 16 })
  extractionMethod: ExtractionMethod;

  @Column({ type: 'varchar', length: 32 })
  status: ReportStatus;

  /** Human-readable notes about anything unusual found during extraction. */
  @Column({ type: 'text', array: true, default: () => "'{}'" })
  warnings: string[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @OneToMany(() => ReportParameter, (parameter) => parameter.report)
  parameters: Relation<ReportParameter[]>;
}
