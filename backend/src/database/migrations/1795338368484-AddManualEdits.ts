import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets users correct extracted data.
 *
 * - report_parameters.original: the row as first extracted (set on the first
 *   edit), so OCR / parser output stays auditable and can be restored
 * - report_parameters.edited_at: when a user last changed the row
 * - report_parameters.source: 'extracted' or 'manual' (added by a user)
 * - report_parameters.page_number becomes optional (manual rows have no page)
 * - reports.identifier_source also allows 'manual' (ID typed in by a user)
 *
 * Column changes were generated from the entities; the CHECK constraint
 * change on reports was written by hand (TypeORM compares CHECKs by name
 * only, so it does not detect a changed expression).
 */
export class AddManualEdits1795338368484 implements MigrationInterface {
  name = 'AddManualEdits1795338368484';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "report_parameters" ADD "source" character varying(16) NOT NULL DEFAULT 'extracted'`,
    );
    await queryRunner.query(`ALTER TABLE "report_parameters" ADD "original" jsonb`);
    await queryRunner.query(`ALTER TABLE "report_parameters" ADD "edited_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "report_parameters" ALTER COLUMN "page_number" DROP NOT NULL`);
    await queryRunner.query(`
      ALTER TABLE "report_parameters" ADD CONSTRAINT "CHK_report_parameters_source"
        CHECK ("source" IN ('extracted', 'manual'))`);

    await queryRunner.query(`ALTER TABLE "reports" DROP CONSTRAINT "CHK_reports_identifier_source"`);
    await queryRunner.query(`
      ALTER TABLE "reports" ADD CONSTRAINT "CHK_reports_identifier_source"
        CHECK ("identifier_source" IN ('pdf', 'generated', 'manual'))`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Data that only the new schema can hold must go before the old rules return:
    // manual rows (they have no page number) and manually entered IDs.
    await queryRunner.query(`DELETE FROM "report_parameters" WHERE "source" = 'manual'`);
    await queryRunner.query(
      `UPDATE "reports" SET "identifier_source" = 'pdf' WHERE "identifier_source" = 'manual'`,
    );

    await queryRunner.query(`ALTER TABLE "reports" DROP CONSTRAINT "CHK_reports_identifier_source"`);
    await queryRunner.query(`
      ALTER TABLE "reports" ADD CONSTRAINT "CHK_reports_identifier_source"
        CHECK ("identifier_source" IN ('pdf', 'generated'))`);

    await queryRunner.query(`ALTER TABLE "report_parameters" DROP CONSTRAINT "CHK_report_parameters_source"`);
    await queryRunner.query(`ALTER TABLE "report_parameters" ALTER COLUMN "page_number" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "report_parameters" DROP COLUMN "edited_at"`);
    await queryRunner.query(`ALTER TABLE "report_parameters" DROP COLUMN "original"`);
    await queryRunner.query(`ALTER TABLE "report_parameters" DROP COLUMN "source"`);
  }
}
