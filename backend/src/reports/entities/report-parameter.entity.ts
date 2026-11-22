import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  type Relation,
} from 'typeorm';
import { ParameterDefinition } from '../../catalog/parameter-definition.entity.js';
import { numericTransformer } from '../../database/numeric.transformer.js';
import { Report } from './report.entity.js';

/** Comparator printed in front of a value, e.g. the "<" in "<5". */
export type ValueComparator = '<' | '<=' | '>' | '>=';

/** Whether a row was read from the PDF or added by a user. */
export type ParameterSource = 'extracted' | 'manual';

/** The four cells of a row as text, as first extracted (kept when a user edits the row). */
export interface OriginalCells {
  name: string;
  value: string | null;
  unit: string | null;
  range: string | null;
}

/**
 * One row of a report's result table, e.g. "Hemoglobin | 13.2 | g/dL | 13 - 17".
 *
 * Every value is kept exactly as printed (`*Raw` columns) so nothing is ever
 * lost, plus a parsed numeric form when one exists, so values can be compared
 * and range-checked. Any of value / unit / range may be missing in the PDF,
 * which is why those columns are nullable.
 */
@Entity('report_parameters')
@Unique('UQ_report_parameters_report_position', ['reportId', 'position'])
@Check('CHK_report_parameters_comparator', `"value_comparator" IN ('<', '<=', '>', '>=')`)
@Check('CHK_report_parameters_source', `"source" IN ('extracted', 'manual')`)
export class ReportParameter {
  @PrimaryGeneratedColumn({ primaryKeyConstraintName: 'PK_report_parameters' })
  id: number;

  @Column({ name: 'report_id', type: 'uuid' })
  reportId: string;

  /** Deleting a report deletes its rows; they have no meaning on their own. */
  @ManyToOne(() => Report, (report) => report.parameters, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'report_id', foreignKeyConstraintName: 'FK_report_parameters_report' })
  report: Relation<Report>;

  /** Indexed so "all values of parameter X across reports" stays fast. */
  @Index('IDX_report_parameters_definition')
  @Column({ name: 'parameter_definition_id', type: 'integer' })
  parameterDefinitionId: number;

  /** A catalog entry cannot be deleted while reports still reference it. */
  @ManyToOne(() => ParameterDefinition, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'parameter_definition_id',
    foreignKeyConstraintName: 'FK_report_parameters_definition',
  })
  parameterDefinition: Relation<ParameterDefinition>;

  /** 1-based order within the report, so the UI matches the PDF's order. */
  @Column({ type: 'integer' })
  position: number;

  /** Page the row was printed on; null for rows added by a user. */
  @Column({ name: 'page_number', type: 'integer', nullable: true })
  pageNumber: number | null;

  /** Parameter name exactly as printed in the PDF. */
  @Column({ name: 'name_raw', type: 'text' })
  nameRaw: string;

  /** Result exactly as printed: "13.2", "<5", "Positive", "Nil"... */
  @Column({ name: 'value_raw', type: 'text', nullable: true })
  valueRaw: string | null;

  /** Numeric part of the value, or null for text results like "Positive". */
  @Column({
    name: 'value_numeric',
    type: 'numeric',
    nullable: true,
    transformer: numericTransformer,
  })
  valueNumeric: number | null;

  @Column({ name: 'value_comparator', type: 'varchar', length: 2, nullable: true })
  valueComparator: ValueComparator | null;

  @Column({ type: 'text', nullable: true })
  unit: string | null;

  /** Reference range exactly as printed, e.g. "13.0 - 17.0" or "< 200". */
  @Column({ name: 'ref_range_raw', type: 'text', nullable: true })
  refRangeRaw: string | null;

  @Column({ name: 'ref_low', type: 'numeric', nullable: true, transformer: numericTransformer })
  refLow: number | null;

  @Column({ name: 'ref_high', type: 'numeric', nullable: true, transformer: numericTransformer })
  refHigh: number | null;

  /** True/false when value and range are both numeric; null when unknown. */
  @Column({ name: 'is_abnormal', type: 'boolean', nullable: true })
  isAbnormal: boolean | null;

  @Column({ type: 'varchar', length: 16, default: 'extracted' })
  source: ParameterSource;

  /**
   * The row as first extracted, saved the first time a user edits it, so
   * what the parser / OCR produced stays auditable and can be restored.
   * Null for rows never edited and for rows added by a user.
   */
  @Column({ type: 'jsonb', nullable: true })
  original: OriginalCells | null;

  /** When a user last changed (or added) this row. */
  @Column({ name: 'edited_at', type: 'timestamptz', nullable: true })
  editedAt: Date | null;
}
