/**
 * End-to-end tests: the real Nest app, a real PostgreSQL database and the
 * real sample PDFs from /samples, exercised over HTTP.
 *
 * Uses a separate database (default "pdfreader_test", created if missing) and
 * a temporary upload folder, so running the tests never touches dev data.
 * Requires PostgreSQL to be running (`npm run db:up` from the repo root).
 */
import type { INestApplication } from '@nestjs/common';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import request from 'supertest';
import { DataSource } from 'typeorm';
import type { ReportDetailDto, ReportSummaryDto, UploadResponseDto } from '../src/reports/reports.dto.js';

const SAMPLES_DIR = fileURLToPath(new URL('../../samples/', import.meta.url));
const TEST_DB = process.env.E2E_DB_NAME ?? 'pdfreader_test';

/** Creates the test database if it doesn't exist yet. */
async function ensureDatabase(name: string): Promise<void> {
  const client = new pg.Client({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5433),
    user: process.env.DB_USER ?? 'pdfreader',
    password: process.env.DB_PASSWORD ?? 'pdfreader',
    database: 'postgres',
  });
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (!rowCount) await client.query(`CREATE DATABASE "${name}"`);
  } finally {
    await client.end();
  }
}

describe('Reports API (e2e)', () => {
  let app: INestApplication;
  let uploadDir: string;

  const sample = (file: string) => readFile(path.join(SAMPLES_DIR, file));
  const upload = async (file: string) =>
    request(app.getHttpServer()).post('/api/reports').attach('file', await sample(file), file);

  beforeAll(async () => {
    // Environment must be set before AppModule is imported (it reads config on import).
    uploadDir = await mkdtemp(path.join(os.tmpdir(), 'pdfreader-e2e-'));
    process.env.DB_NAME = TEST_DB;
    process.env.UPLOAD_DIR = uploadDir;
    process.env.MAX_UPLOAD_MB = '1'; // small limit so the 413 case is cheap to test
    await ensureDatabase(TEST_DB);

    const { Test } = await import('@nestjs/testing');
    const { AppModule } = await import('../src/app.module.js');
    const { configureApp } = await import('../src/app.setup.js');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    const dataSource = app.get(DataSource);
    await dataSource.runMigrations();
    await dataSource.query('TRUNCATE reports, parameter_definitions CASCADE');
  });

  afterAll(async () => {
    await app?.close();
    await rm(uploadDir, { recursive: true, force: true });
  });

  describe('POST /api/reports', () => {
    it('extracts a 10-parameter text report with its report ID', async () => {
      const response = await upload('01-cbc-10-parameters.pdf');
      const { duplicate, report } = response.body as UploadResponseDto;

      expect(response.status).toBe(201);
      expect(duplicate).toBe(false);
      expect(report).toMatchObject({
        reportIdentifier: 'LR-2026-001042',
        identifierSource: 'pdf',
        extractionMethod: 'text',
        status: 'completed',
        parameterCount: 10,
      });
      expect(report.parameters[0]).toMatchObject({
        position: 1,
        name: 'Hemoglobin',
        value: { raw: '11.2 L', numeric: 11.2, comparator: null },
        unit: 'g/dL',
        referenceRange: { raw: '12.0 - 15.5', low: 12, high: 15.5 },
        isAbnormal: true,
      });
    });

    it('returns the stored report instead of saving the same PDF twice', async () => {
      const first = await upload('02-lipid-thyroid-8-parameters.pdf');
      const second = await upload('02-lipid-thyroid-8-parameters.pdf');

      expect(first.status).toBe(201);
      expect(second.status).toBe(200);
      expect(second.body.duplicate).toBe(true);
      expect(second.body.report.id).toBe(first.body.report.id);
      expect(second.body.report.parameterCount).toBe(8);
    });

    it('reads a table that continues on page 2 without a repeated header', async () => {
      const { report } = (await upload('03-metabolic-13-parameters-2-pages.pdf')).body as UploadResponseDto;

      expect(report.pageCount).toBe(2);
      expect(report.parameterCount).toBe(13);
      expect(new Set(report.parameters.map((p) => p.pageNumber))).toEqual(new Set([1, 2]));
      expect(report.parameters.map((p) => p.name)).not.toContain('KIDNEY FUNCTION');
    });

    it('keeps text values and missing cells as they are', async () => {
      const { report } = (await upload('04-urine-text-values.pdf')).body as UploadResponseDto;
      const byName = new Map(report.parameters.map((p) => [p.name, p]));

      expect(byName.get('Urine Glucose')?.value).toEqual({ raw: 'Positive', numeric: null, comparator: null });
      expect(byName.get('Urine Protein')?.value.raw).toBe('Nil');
      expect(byName.get('C-Reactive Protein (CRP)')?.value).toEqual({ raw: '<5', numeric: 5, comparator: '<' });
      expect(byName.get('HIV I & II Antibodies')).toMatchObject({ unit: null, referenceRange: { raw: null } });
      expect(byName.get('Vitamin D (25-OH)')?.value.raw).toBeNull();
      expect(report.warnings).toContain('1 parameter(s) have no result value printed.');
    });

    it('generates and flags an ID when the PDF has none', async () => {
      const { report } = (await upload('05-no-report-id.pdf')).body as UploadResponseDto;

      expect(report.identifierSource).toBe('generated');
      expect(report.reportIdentifier).toMatch(/^AUTO-\d{8}-[0-9a-f]{6}$/);
      expect(report.warnings[0]).toContain('No report / sample ID was found');
    });

    it('reads a scanned (image-only) PDF with OCR', { timeout: 120_000 }, async () => {
      const { report } = (await upload('06-scanned-cbc.pdf')).body as UploadResponseDto;

      expect(report.extractionMethod).toBe('ocr');
      expect(report.reportIdentifier).toBe('LR-2026-001042');
      expect(report.parameterCount).toBe(10);
      expect(report.parameters.map((p) => p.name)).toContain('Mean Corpuscular Volume (MCV)');
    });

    describe('industrial / SCADA reports', () => {
      it('reads a SCADA daily report: tag + description, Lo/Hi limits, alarms, 2 pages', async () => {
        const { report } = (await upload('09-scada-daily-process-report.pdf')).body as UploadResponseDto;
        const byName = new Map(report.parameters.map((p) => [p.name, p]));

        expect(report).toMatchObject({ reportIdentifier: 'SCADA-DR-20261121-PS04', pageCount: 2, parameterCount: 17 });
        expect(byName.get('FT-101 Raw Water Inlet Flow')).toMatchObject({
          value: { numeric: 182.4 },
          unit: 'm³/h',
          referenceRange: { raw: '120 - 250', low: 120, high: 250 },
          isAbnormal: false,
        });
        // The values the SCADA system itself flagged as alarms.
        expect(byName.get('AT-102 Raw Water Turbidity')?.isAbnormal).toBe(true);
        expect(byName.get('VT-204 Pump 1 Vibration')?.isAbnormal).toBe(true);
        expect(byName.get('AT-303 Residual Chlorine at Outlet')?.isAbnormal).toBe(true);
        expect(byName.get('LT-302 Elevated Tank Level')?.value).toEqual({
          raw: 'COMM FAIL',
          numeric: null,
          comparator: null,
        });
      });

      it('reads an equipment test report with acceptance criteria', async () => {
        const { report } = (await upload('10-transformer-test-report.pdf')).body as UploadResponseDto;
        const byName = new Map(report.parameters.map((p) => [p.name, p]));

        expect(report).toMatchObject({ reportIdentifier: 'TR/2026/0457', parameterCount: 12 });
        expect(byName.get('Oil Breakdown Voltage (BDV)')).toMatchObject({
          referenceRange: { raw: 'Min 50', low: 50, high: null },
          isAbnormal: false,
        });
        expect(byName.get('Polarisation Index (HV-Earth)')?.isAbnormal).toBe(true); // "Fail" in the PDF
        expect(byName.get('Vector Group')?.value.raw).toBe('Dyn11');
      });

      it('reads a water quality report and ignores the test-method column', async () => {
        const { report } = (await upload('11-water-quality-report.pdf')).body as UploadResponseDto;
        const byName = new Map(report.parameters.map((p) => [p.name, p]));

        expect(report).toMatchObject({ reportIdentifier: 'WTP/LAB/2026/1123', parameterCount: 12 });
        expect(byName.get('Residual Free Chlorine')?.isAbnormal).toBe(true);
        expect(byName.get('Iron (as Fe)')?.value).toEqual({ raw: 'BDL', numeric: null, comparator: null });
        expect(report.parameters.some((p) => p.name.includes('IS 3025'))).toBe(false);
      });

      it('reads a calibration certificate, taking the unit from the column title', async () => {
        const { report } = (await upload('12-pressure-calibration-cert.pdf')).body as UploadResponseDto;

        expect(report).toMatchObject({ reportIdentifier: 'CC/2026/1187', parameterCount: 9 });
        expect(report.parameters[2]).toMatchObject({
          name: 'Point 3 (50 %, up)',
          value: { numeric: 5.031 },
          unit: 'bar',
          referenceRange: { raw: '± 0.025' },
        });
      });
    });

    it('rejects a corrupted PDF with 422', async () => {
      const response = await upload('07-corrupted.pdf');
      expect(response.status).toBe(422);
      expect(response.body.message).toBe('The PDF is corrupted or incomplete.');
    });

    it('rejects a non-PDF named .pdf with 415', async () => {
      expect((await upload('08-not-a-pdf.pdf')).status).toBe(415);
    });

    it('rejects a request without a file with 400', async () => {
      expect((await request(app.getHttpServer()).post('/api/reports')).status).toBe(400);
    });

    it('rejects a file over the size limit with 413', async () => {
      const tooBig = Buffer.alloc(2 * 1024 * 1024, 0x20);
      const response = await request(app.getHttpServer())
        .post('/api/reports')
        .attach('file', tooBig, 'big.pdf');
      expect(response.status).toBe(413);
    });
  });

  describe('reading reports', () => {
    it('lists every stored report with its parameter count', async () => {
      const response = await request(app.getHttpServer()).get('/api/reports');
      const reports = response.body as ReportSummaryDto[];

      expect(response.status).toBe(200);
      expect(reports).toHaveLength(10); // 6 lab + 4 industrial
      expect(reports.find((r) => r.reportIdentifier === 'LR-2026-001077')?.parameterCount).toBe(13);
    });

    it('links the same test in different reports to one catalog entry', async () => {
      const reports = (await request(app.getHttpServer()).get('/api/reports')).body as ReportSummaryDto[];
      const cbcReports = reports.filter((r) => r.reportIdentifier === 'LR-2026-001042');
      const details = await Promise.all(
        cbcReports.map(async (r) => (await request(app.getHttpServer()).get(`/api/reports/${r.id}`)).body as ReportDetailDto),
      );
      const hemoglobinIds = details.map((d) => d.parameters.find((p) => p.name === 'Hemoglobin')?.parameterDefinitionId);

      expect(hemoglobinIds).toHaveLength(2);
      expect(hemoglobinIds[0]).toBe(hemoglobinIds[1]);
    });

    it('streams the original PDF', async () => {
      const [report] = (await request(app.getHttpServer()).get('/api/reports')).body as ReportSummaryDto[];
      const response = await request(app.getHttpServer()).get(`/api/reports/${report.id}/file`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
    });

    it('returns 404 for an unknown id and 400 for a malformed one', async () => {
      const server = app.getHttpServer();
      expect((await request(server).get('/api/reports/00000000-0000-4000-8000-000000000000')).status).toBe(404);
      expect((await request(server).get('/api/reports/not-a-uuid')).status).toBe(400);
    });
  });

  describe('PATCH /api/reports/:id (manual corrections)', () => {
    /** Id and current detail of the report uploaded from `file`. */
    async function reportFor(file: string): Promise<ReportDetailDto> {
      const reports = (await request(app.getHttpServer()).get('/api/reports')).body as ReportSummaryDto[];
      const summary = reports.find((r) => r.originalFilename === file);
      if (!summary) throw new Error(`${file} was not uploaded`);
      return (await request(app.getHttpServer()).get(`/api/reports/${summary.id}`)).body as ReportDetailDto;
    }
    const patch = (id: string, body: object) => request(app.getHttpServer()).patch(`/api/reports/${id}`).send(body);

    it('corrects an OCR value, re-parses it and keeps the extracted original', async () => {
      const report = await reportFor('06-scanned-cbc.pdf');
      const rbc = report.parameters.find((p) => p.name === 'Total RBC Count')!;

      const response = await patch(report.id, {
        updateParameters: [{ position: rbc.position, range: '4.0 - 5.2' }],
      });
      const updated = (response.body as ReportDetailDto).parameters.find((p) => p.position === rbc.position)!;

      expect(response.status).toBe(200);
      expect(updated.referenceRange).toEqual({ raw: '4.0 - 5.2', low: 4, high: 5.2 });
      expect(updated.isAbnormal).toBe(false);
      expect(updated.edited?.original).toEqual({
        name: rbc.name,
        value: rbc.value.raw,
        unit: rbc.unit,
        range: rbc.referenceRange.raw,
      });
    });

    it('keeps the FIRST extracted version across several edits', async () => {
      const report = await reportFor('01-cbc-10-parameters.pdf');
      await patch(report.id, { updateParameters: [{ position: 1, value: '11.5' }] });
      const response = await patch(report.id, { updateParameters: [{ position: 1, value: '12.4' }] });
      const row = (response.body as ReportDetailDto).parameters[0];

      expect(row.value).toEqual({ raw: '12.4', numeric: 12.4, comparator: null });
      expect(row.isAbnormal).toBe(false);
      expect(row.edited?.original?.value).toBe('11.2 L');
    });

    it('adds a missed row and removes a junk row', async () => {
      const report = await reportFor('02-lipid-thyroid-8-parameters.pdf');
      const response = await patch(report.id, {
        addParameters: [{ name: 'Free T4', value: '1.9', unit: 'ng/dL', range: '0.9 - 1.7' }],
        removePositions: [5],
      });
      const updated = response.body as ReportDetailDto;
      const added = updated.parameters.at(-1)!;

      expect(updated.parameterCount).toBe(8); // 8 - 1 + 1
      expect(updated.parameters.some((p) => p.position === 5)).toBe(false);
      expect(added).toMatchObject({
        position: 9, // positions are never reused
        pageNumber: null,
        source: 'manual',
        name: 'Free T4',
        value: { numeric: 1.9 },
        isAbnormal: true,
        edited: { original: null },
      });
    });

    it('replaces a generated ID with one typed by the user', async () => {
      const report = await reportFor('05-no-report-id.pdf');
      const response = await patch(report.id, { reportIdentifier: '  BS-2026-0042 ' });

      expect(response.body).toMatchObject({ reportIdentifier: 'BS-2026-0042', identifierSource: 'manual' });
    });

    it('applies all changes or none: an invalid row leaves the report untouched', async () => {
      const before = await reportFor('11-water-quality-report.pdf');
      const response = await patch(before.id, {
        updateParameters: [{ position: 1, value: '9.9' }],
        removePositions: [999],
      });
      const after = await reportFor('11-water-quality-report.pdf');

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Row 999 does not exist.');
      expect(after.parameters).toEqual(before.parameters);
    });

    it('updates the status when all rows are removed', async () => {
      const report = await reportFor('12-pressure-calibration-cert.pdf');
      const response = await patch(report.id, { removePositions: report.parameters.map((p) => p.position) });

      expect(response.body).toMatchObject({ status: 'no_parameters_found', parameterCount: 0 });
    });

    it.each([
      ['an empty name', { updateParameters: [{ position: 1, name: '' }] }],
      ['a name without letters or digits', { addParameters: [{ name: '***' }] }],
      ['an unknown property', { colour: 'red' }],
      ['a row both edited and removed', { updateParameters: [{ position: 1, value: '1' }], removePositions: [1] }],
      ['a non-integer position', { removePositions: ['one'] }],
    ])('rejects %s with 400', async (_case, body) => {
      const report = await reportFor('10-transformer-test-report.pdf');
      expect((await patch(report.id, body)).status).toBe(400);
    });

    it('returns 404 for an unknown report', async () => {
      const response = await patch('00000000-0000-4000-8000-000000000000', { reportIdentifier: 'X-1' });
      expect(response.status).toBe(404);
    });
  });

});
