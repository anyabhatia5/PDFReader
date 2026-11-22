import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

/**
 * The parameter catalog: one row per distinct kind of test (e.g. "Hemoglobin").
 *
 * Extracted names are linked here by a normalised `canonicalKey`, so the same
 * test appearing in many reports points to one definition. That makes
 * cross-report questions ("all hemoglobin values") a simple join.
 */
@Entity('parameter_definitions')
@Unique('UQ_parameter_definitions_canonical_key', ['canonicalKey'])
export class ParameterDefinition {
  @PrimaryGeneratedColumn({ primaryKeyConstraintName: 'PK_parameter_definitions' })
  id: number;

  /** Normalised name used for matching, e.g. "haemoglobin hb". */
  @Column({ name: 'canonical_key', type: 'text' })
  canonicalKey: string;

  /** Human-readable name, taken from the first report that used it. */
  @Column({ name: 'display_name', type: 'text' })
  displayName: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
