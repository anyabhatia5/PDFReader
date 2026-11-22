import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial schema: reports, the parameter catalog, and report parameters.
 *
 *   reports 1 ──< report_parameters >── 1 parameter_definitions
 *
 * A report can have any number of parameter rows, which is how PDFs with
 * 8, 10, 12 or more parameters are stored without changing the schema.
 *
 * Generated from the entities with `typeorm migration:generate`, then
 * reformatted for readability (the SQL itself is unchanged).
 */
export class InitialSchema1795331643353 implements MigrationInterface {
  name = 'InitialSchema1795331643353';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "parameter_definitions" (
        "id"            SERIAL NOT NULL,
        "canonical_key" text NOT NULL,
        "display_name"  text NOT NULL,
        "created_at"    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_parameter_definitions_canonical_key" UNIQUE ("canonical_key"),
        CONSTRAINT "PK_parameter_definitions" PRIMARY KEY ("id")
      )`);

    await queryRunner.query(`
      CREATE TABLE "reports" (
        "id"                uuid NOT NULL DEFAULT gen_random_uuid(),
        "report_identifier" text NOT NULL,
        "identifier_source" character varying(16) NOT NULL,
        "original_filename" text NOT NULL,
        "file_sha256"       character(64) NOT NULL,
        "file_path"         text NOT NULL,
        "page_count"        integer NOT NULL,
        "extraction_method" character varying(16) NOT NULL,
        "status"            character varying(32) NOT NULL,
        "warnings"          text array NOT NULL DEFAULT '{}',
        "created_at"        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_reports_file_sha256" UNIQUE ("file_sha256"),
        CONSTRAINT "CHK_reports_status" CHECK ("status" IN ('completed', 'no_parameters_found')),
        CONSTRAINT "CHK_reports_extraction_method" CHECK ("extraction_method" IN ('text', 'ocr', 'mixed')),
        CONSTRAINT "CHK_reports_identifier_source" CHECK ("identifier_source" IN ('pdf', 'generated')),
        CONSTRAINT "PK_reports" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_reports_report_identifier" ON "reports" ("report_identifier")`,
    );

    await queryRunner.query(`
      CREATE TABLE "report_parameters" (
        "id"                      SERIAL NOT NULL,
        "report_id"               uuid NOT NULL,
        "parameter_definition_id" integer NOT NULL,
        "position"                integer NOT NULL,
        "page_number"             integer NOT NULL,
        "name_raw"                text NOT NULL,
        "value_raw"               text,
        "value_numeric"           numeric,
        "value_comparator"        character varying(2),
        "unit"                    text,
        "ref_range_raw"           text,
        "ref_low"                 numeric,
        "ref_high"                numeric,
        "is_abnormal"             boolean,
        CONSTRAINT "UQ_report_parameters_report_position" UNIQUE ("report_id", "position"),
        CONSTRAINT "CHK_report_parameters_comparator" CHECK ("value_comparator" IN ('<', '<=', '>', '>=')),
        CONSTRAINT "PK_report_parameters" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_report_parameters_definition" ON "report_parameters" ("parameter_definition_id")`,
    );
    await queryRunner.query(`
      ALTER TABLE "report_parameters" ADD CONSTRAINT "FK_report_parameters_report"
        FOREIGN KEY ("report_id") REFERENCES "reports"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`
      ALTER TABLE "report_parameters" ADD CONSTRAINT "FK_report_parameters_definition"
        FOREIGN KEY ("parameter_definition_id") REFERENCES "parameter_definitions"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop in reverse dependency order; dropping a table drops its indexes.
    await queryRunner.query(`DROP TABLE "report_parameters"`);
    await queryRunner.query(`DROP TABLE "reports"`);
    await queryRunner.query(`DROP TABLE "parameter_definitions"`);
  }
}
