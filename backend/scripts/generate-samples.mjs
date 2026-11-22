/**
 * Generates the sample PDFs in /samples used for testing and the demo.
 *
 *   npm run samples   (from backend/)
 *
 * All patients, labs and values are fictional. Each file targets one or more
 * of the edge cases in the assignment:
 *
 *   01-cbc-10-parameters.pdf            10 parameters, "Report ID", H/L flags
 *   02-lipid-thyroid-8-parameters.pdf   8 parameters, "Sample ID", different header wording
 *   03-metabolic-13-parameters-2-pages  13 parameters, table continues on page 2
 *                                       WITHOUT a repeated header, section titles
 *   04-urine-text-values.pdf            "Positive", "Nil", "<5", missing units/ranges/value
 *   05-no-report-id.pdf                 no report / sample ID anywhere
 *   06-scanned-cbc.pdf                  image-only copy of 01 (needs OCR)
 *   07-corrupted.pdf                    truncated file (should be rejected, 422)
 *   08-not-a-pdf.pdf                    a text file named .pdf (should be rejected, 415)
 *
 * Plain JavaScript (not TypeScript) so it runs on any supported Node version
 * without a build step.
 */
import { createCanvas } from '@napi-rs/canvas';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { getDocument, VerbosityLevel } from 'pdfjs-dist/legacy/build/pdf.mjs';

const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'samples');

/** Left edge of each table column, in points. */
const COLUMNS = [50, 235, 335, 425];
const ROW_HEIGHT = 18;
const PAGE_BOTTOM = 760;

// ---------------------------------------------------------------- report data

const CBC = {
  file: '01-cbc-10-parameters.pdf',
  title: 'COMPLETE BLOOD COUNT (CBC)',
  idLine: 'Report ID: LR-2026-001042',
  patient: 'Patient Name: Asha Verma        Age/Sex: 34 Y / F',
  header: ['Test', 'Result', 'Unit', 'Reference Range'],
  rows: [
    ['Hemoglobin', '11.2 L', 'g/dL', '12.0 - 15.5'],
    ['Total RBC Count', '4.3', 'million/µL', '4.0 - 5.2'],
    ['Packed Cell Volume (PCV)', '36.1', '%', '36 - 46'],
    ['Mean Corpuscular Volume (MCV)', '84', 'fL', '80 - 100'],
    ['MCH', '26.0 L', 'pg', '27 - 33'],
    ['MCHC', '31.0 L', 'g/dL', '32 - 36'],
    ['Total WBC Count', '11,800 H', 'cells/µL', '4,000 - 11,000'],
    ['Neutrophils', '72', '%', '40 - 75'],
    ['Lymphocytes', '21', '%', '20 - 45'],
    ['Platelet Count', '2,45,000', '/µL', '1,50,000 - 4,10,000'],
  ],
};

const LIPID_THYROID = {
  file: '02-lipid-thyroid-8-parameters.pdf',
  title: 'LIPID PROFILE & THYROID FUNCTION',
  idLine: 'Sample ID: SMP-88213',
  patient: 'Patient Name: Rahul Mehta        Age/Sex: 52 Y / M',
  header: ['Investigation', 'Observed Value', 'Units', 'Biological Reference Interval'],
  rows: [
    ['Total Cholesterol', '232', 'mg/dL', '< 200'],
    ['Triglycerides', '180', 'mg/dL', '< 150'],
    ['HDL Cholesterol', '38', 'mg/dL', '> 40'],
    ['LDL Cholesterol', '158', 'mg/dL', 'Up to 100'],
    ['VLDL Cholesterol', '36', 'mg/dL', '5 - 40'],
    ['T3 (Total)', '1.1', 'ng/mL', '0.8 - 2.0'],
    ['T4 (Total)', '7.9', 'µg/dL', '5.1 - 14.1'],
    ['TSH', '5.8', 'µIU/mL', '0.27 - 4.20'],
  ],
};

/** 13 rows split by section titles; page 2 has no repeated header. */
const METABOLIC = {
  file: '03-metabolic-13-parameters-2-pages.pdf',
  title: 'COMPREHENSIVE METABOLIC PANEL',
  idLine: 'Report ID: LR-2026-001077',
  patient: 'Patient Name: Farah Khan        Age/Sex: 61 Y / F',
  header: ['Test Name', 'Result', 'Unit', 'Reference Range'],
  sections: [
    ['KIDNEY FUNCTION', [
      ['Blood Urea', '48', 'mg/dL', '15 - 40'],
      ['Serum Creatinine', '1.4', 'mg/dL', '0.6 - 1.1'],
      ['Uric Acid', '6.1', 'mg/dL', '2.6 - 6.0'],
      ['eGFR', '42', 'mL/min/1.73m²', '> 60'],
    ]],
    ['ELECTROLYTES', [
      ['Sodium', '138', 'mmol/L', '135 - 145'],
      ['Potassium', '5.4', 'mmol/L', '3.5 - 5.1'],
      ['Chloride', '101', 'mmol/L', '98 - 107'],
    ]],
    ['LIVER FUNCTION', [
      ['Total Bilirubin', '0.8', 'mg/dL', '0.3 - 1.2'],
      ['SGOT (AST)', '34', 'U/L', '< 35'],
      ['SGPT (ALT)', '29', 'U/L', '< 35'],
      ['Alkaline Phosphatase', '96', 'U/L', '30 - 120'],
      ['Total Protein', '6.9', 'g/dL', '6.4 - 8.3'],
      ['Albumin', '3.9', 'g/dL', '3.5 - 5.2'],
    ]],
  ],
  // Leave little room on page 1 so the table must continue on page 2.
  firstPageBottom: 330,
};

const URINE = {
  file: '04-urine-text-values.pdf',
  title: 'URINE ROUTINE & SEROLOGY',
  idLine: 'Specimen No: UR/2026/4471',
  patient: 'Patient Name: Kiran Rao        Age/Sex: 28 Y / M',
  header: ['Test', 'Result', 'Unit', 'Reference Range'],
  rows: [
    ['Colour', 'Pale Yellow', '', 'Pale Yellow'],
    ['Specific Gravity', '1.020', '', '1.005 - 1.030'],
    ['Urine Protein', 'Nil', '', 'Nil'],
    ['Urine Glucose', 'Positive', '', 'Negative'],
    ['Pus Cells', '2-3', '/hpf', '0 - 5'],
    ['C-Reactive Protein (CRP)', '<5', 'mg/L', '< 6'],
    ['HIV I & II Antibodies', 'Non Reactive', '', ''],
    ['HBsAg', 'Negative', '', ''],
    ['Vitamin D (25-OH)', '', 'ng/mL', '30 - 100'],
  ],
};

const NO_ID = {
  file: '05-no-report-id.pdf',
  title: 'BLOOD SUGAR',
  idLine: null,
  patient: 'Patient Name: Meera Iyer        Age/Sex: 45 Y / F',
  header: ['Test', 'Result', 'Unit', 'Reference Range'],
  rows: [
    ['Glucose (Fasting)', '126', 'mg/dL', '70 - 100'],
    ['Glucose (Post Prandial)', '182', 'mg/dL', '70 - 140'],
    ['HbA1c', '6.9', '%', '4.0 - 5.6'],
    ['Mean Blood Glucose', '151', 'mg/dL', ''],
    ['Fasting Insulin', '14.2', 'µIU/mL', '2.6 - 24.9'],
    ['HOMA-IR', '4.4', '', '< 2.5'],
  ],
};

// ------------------------------------------------------------------- drawing

/** Builds a PDF in memory with pdfkit and returns its bytes. */
function buildPdf(draw) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 0,
    autoFirstPage: false,
    // Lets us return to earlier pages to stamp "Page x of y".
    bufferPages: true,
    // A fixed date makes the output identical on every run (stable in git).
    info: { CreationDate: new Date('2026-11-18T00:00:00Z'), Producer: 'PDFReader sample generator' },
  });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  draw(doc);
  doc.end();
  return done;
}

/** Writes text at an exact position without pdfkit's automatic wrapping or paging. */
function put(doc, text, x, y, options = {}) {
  doc.text(text, x, y, { lineBreak: false, ...options });
}

function drawPageTop(doc, report) {
  doc.font('Helvetica-Bold').fontSize(14);
  put(doc, 'SUNRISE DIAGNOSTICS', 50, 40);
  doc.font('Helvetica').fontSize(8);
  put(doc, '12 Lake Road, Pune 411001  |  Fictional laboratory for testing', 50, 58);
  doc.moveTo(50, 72).lineTo(545, 72).stroke();

  doc.fontSize(10);
  put(doc, report.patient, 50, 84);
  if (report.idLine) put(doc, report.idLine, 50, 100);
  put(doc, 'Collected: 18-Nov-2026 08:10        Reported: 18-Nov-2026 14:32', 50, 116);
}

function drawHeader(doc, header, y) {
  doc.font('Helvetica-Bold').fontSize(10);
  header.forEach((title, i) => put(doc, title, COLUMNS[i], y));
  doc.moveTo(50, y + 14).lineTo(545, y + 14).stroke();
  doc.font('Helvetica');
  return y + 22;
}

function drawRow(doc, row, y) {
  row.forEach((cell, i) => cell && put(doc, cell, COLUMNS[i], y));
}

function drawFooters(doc, pageCount) {
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc.font('Helvetica').fontSize(8);
    put(doc, `Page ${i + 1} of ${pageCount}`, 270, 805);
  }
}

/** A report with a title, patient block and one result table (paged if needed). */
function renderReport(report) {
  return buildPdf((doc) => {
    // Flatten sections into a list of [kind, content] lines.
    const lines = report.sections
      ? report.sections.flatMap(([title, rows]) => [['section', title], ...rows.map((r) => ['row', r])])
      : report.rows.map((r) => ['row', r]);

    doc.addPage();
    drawPageTop(doc, report);
    doc.font('Helvetica-Bold').fontSize(12);
    put(doc, report.title, 50, 145);
    let y = drawHeader(doc, report.header, 170);
    let pageBottom = report.firstPageBottom ?? PAGE_BOTTOM;
    let pages = 1;

    for (const [kind, content] of lines) {
      if (y > pageBottom) {
        // Continue on a new page. The header is deliberately NOT repeated.
        doc.addPage();
        pages++;
        drawPageTop(doc, report);
        y = 150;
        pageBottom = PAGE_BOTTOM;
      }
      doc.fontSize(10);
      if (kind === 'section') {
        doc.font('Helvetica-Bold');
        put(doc, content, 50, y);
        doc.font('Helvetica');
      } else {
        drawRow(doc, content, y);
      }
      y += ROW_HEIGHT;
    }

    doc.font('Helvetica-Oblique').fontSize(9);
    put(doc, '*** End of Report ***', 240, y + 20);
    put(doc, 'Dr. S. Kulkarni, MD (Pathology)', 380, y + 60);
    drawFooters(doc, pages);
  });
}

/**
 * Simulates a scanner: renders every page to an image and builds a new PDF
 * containing only those images (no text layer), so it can only be read by OCR.
 */
async function toScannedPdf(pdfBytes, dpi = 200) {
  const scale = dpi / 72;
  const source = await getDocument({ data: new Uint8Array(pdfBytes), verbosity: VerbosityLevel.ERRORS })
    .promise;
  const images = [];
  for (let n = 1; n <= source.numPages; n++) {
    const page = await source.getPage(n);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvas, viewport }).promise;
    images.push({ png: canvas.toBuffer('image/png'), width: viewport.width / scale, height: viewport.height / scale });
  }
  await source.loadingTask.destroy();

  return buildPdf((doc) => {
    for (const image of images) {
      doc.addPage({ size: [image.width, image.height] });
      doc.image(image.png, 0, 0, { width: image.width, height: image.height });
    }
  });
}

// ---------------------------------------------------------------------- main

await mkdir(OUT_DIR, { recursive: true });

const outputs = {};
for (const report of [CBC, LIPID_THYROID, METABOLIC, URINE, NO_ID]) {
  outputs[report.file] = await renderReport(report);
}
outputs['06-scanned-cbc.pdf'] = await toScannedPdf(outputs[CBC.file]);
// Keep only the first 40%: the header is valid but the structure is cut off.
outputs['07-corrupted.pdf'] = outputs[CBC.file].subarray(0, Math.floor(outputs[CBC.file].length * 0.4));
outputs['08-not-a-pdf.pdf'] = Buffer.from('This is a plain text file pretending to be a PDF.\n');

for (const [file, bytes] of Object.entries(outputs)) {
  await writeFile(path.join(OUT_DIR, file), bytes);
  console.log(`wrote samples/${file} (${(bytes.length / 1024).toFixed(1)} KB)`);
}
